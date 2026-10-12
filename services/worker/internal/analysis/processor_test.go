package analysis

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vision-inspect/worker/internal/apiclient"
	"github.com/vision-inspect/worker/internal/contracts"
	"github.com/vision-inspect/worker/internal/stream"
)

type fakeAPI struct {
	status    string
	startErr  error
	completed []string
	failed    []string
}

func (f *fakeAPI) AnalysisStarted(context.Context, string, int, string) (apiclient.CallbackResult, error) {
	if f.startErr != nil {
		return apiclient.CallbackResult{}, f.startErr
	}
	s := f.status
	if s == "" {
		s = "PROCESSING"
	}
	return apiclient.CallbackResult{Status: s, Changed: true}, nil
}
func (f *fakeAPI) AnalysisCompleted(_ context.Context, id string, _ int, _ json.RawMessage) error {
	f.completed = append(f.completed, id)
	return nil
}
func (f *fakeAPI) AnalysisFailed(_ context.Context, id string, _ int, reason string) error {
	f.failed = append(f.failed, id+":"+reason)
	return nil
}

type fakeVision struct {
	err   error
	calls int
}

func (f *fakeVision) Infer(_ context.Context, req contracts.InferRequest) (json.RawMessage, contracts.InferResponse, error) {
	f.calls++
	if f.err != nil {
		return nil, contracts.InferResponse{}, f.err
	}
	raw := json.RawMessage(`{"analysisId":"` + req.AnalysisID + `","service":"` + req.Service + `","mode":"heuristic","summary":{"verdict":"PASS","headline":"ok"}}`)
	var r contracts.InferResponse
	_ = json.Unmarshal(raw, &r)
	return raw, r, nil
}

func example(t *testing.T) []byte {
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "packages", "contracts", "examples", "vision.analysis.requested.v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func newProc(api *fakeAPI, v *fakeVision) *Processor {
	return &Processor{API: api, Vision: v, WorkerID: "w1", Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

func TestHappyPath(t *testing.T) {
	api, v := &fakeAPI{}, &fakeVision{}
	if err := newProc(api, v).Handle(context.Background(), stream.Message{Payload: example(t), Attempt: 1}); err != nil {
		t.Fatal(err)
	}
	if len(api.completed) != 1 || v.calls != 1 {
		t.Fatalf("completed=%v calls=%d", api.completed, v.calls)
	}
}

func TestAlreadyFinalSkipsInference(t *testing.T) {
	api, v := &fakeAPI{status: "COMPLETED"}, &fakeVision{}
	if err := newProc(api, v).Handle(context.Background(), stream.Message{Payload: example(t), Attempt: 2}); err != nil {
		t.Fatal(err)
	}
	if v.calls != 0 {
		t.Fatal("não deveria inferir de novo")
	}
}

func TestVisionUnavailableIsRetryable(t *testing.T) {
	err := newProc(&fakeAPI{}, &fakeVision{err: &apiclient.HTTPError{Status: 503, Body: "loading model"}}).Handle(context.Background(), stream.Message{Payload: example(t), Attempt: 1})
	if err == nil || stream.IsPermanent(err) {
		t.Fatalf("503 deveria ser transitório: %v", err)
	}
	err = newProc(&fakeAPI{}, &fakeVision{err: errors.New("connection refused")}).Handle(context.Background(), stream.Message{Payload: example(t), Attempt: 1})
	if err == nil || stream.IsPermanent(err) {
		t.Fatal("erro de rede deveria ser transitório")
	}
}

func TestBadImageIsPermanentWithReadableReason(t *testing.T) {
	api := &fakeAPI{}
	p := newProc(api, &fakeVision{err: &apiclient.HTTPError{Status: 422, Body: "imagem ilegível"}})
	msg := stream.Message{Payload: example(t), Attempt: 1}
	err := p.Handle(context.Background(), msg)
	if !stream.IsPermanent(err) {
		t.Fatalf("422 deveria ser permanente: %v", err)
	}
	p.OnDeadLetter(context.Background(), msg, err)
	if len(api.failed) != 1 || !strings.Contains(api.failed[0], "Imagem não pôde ser processada") {
		t.Fatalf("motivo: %v", api.failed)
	}
}

func TestInvalidPayloadIsPermanent(t *testing.T) {
	for _, payload := range []string{`nope`, `{"eventType":"vision.analysis.requested","version":2}`, `{"eventType":"vision.analysis.requested","version":1,"data":{"analysisId":"x","service":"MAGIC","image":{"key":"k"}}}`} {
		err := newProc(&fakeAPI{}, &fakeVision{}).Handle(context.Background(), stream.Message{Payload: []byte(payload), Attempt: 1})
		if !stream.IsPermanent(err) {
			t.Fatalf("%s → %v", payload, err)
		}
	}
}

func TestAPIRejectionClassification(t *testing.T) {
	err := newProc(&fakeAPI{startErr: &apiclient.HTTPError{Status: 404, Body: "Análise não encontrada"}}, &fakeVision{}).Handle(context.Background(), stream.Message{Payload: example(t), Attempt: 1})
	if !stream.IsPermanent(err) {
		t.Fatal("404 da API deveria ser permanente")
	}
	err = newProc(&fakeAPI{startErr: &apiclient.HTTPError{Status: 502, Body: "bad gateway"}}, &fakeVision{}).Handle(context.Background(), stream.Message{Payload: example(t), Attempt: 1})
	if err == nil || stream.IsPermanent(err) {
		t.Fatal("502 da API deveria ser transitório")
	}
}

func TestTransientReasonDoesNotLeakInternals(t *testing.T) {
	api := &fakeAPI{}
	p := newProc(api, &fakeVision{})
	p.OnDeadLetter(context.Background(), stream.Message{Payload: example(t), Attempt: 3}, errors.New(`Post "http://vision:8000/v1/infer": connection refused`))
	if len(api.failed) != 1 || strings.Contains(api.failed[0], "http://") || !strings.Contains(api.failed[0], "3 tentativas") {
		t.Fatalf("motivo inadequado: %v", api.failed)
	}
}
