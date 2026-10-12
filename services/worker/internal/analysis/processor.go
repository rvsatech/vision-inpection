// Package analysis orquestra o processamento de um pedido de análise:
// API (started) → serviço de visão (infer) → API (completed).
package analysis

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/vision-inspect/worker/internal/apiclient"
	"github.com/vision-inspect/worker/internal/contracts"
	"github.com/vision-inspect/worker/internal/stream"
)

type API interface {
	AnalysisStarted(ctx context.Context, id string, attempt int, workerID string) (apiclient.CallbackResult, error)
	AnalysisCompleted(ctx context.Context, id string, attempt int, result json.RawMessage) error
	AnalysisFailed(ctx context.Context, id string, attempt int, reason string) error
}

type Vision interface {
	Infer(ctx context.Context, req contracts.InferRequest) (json.RawMessage, contracts.InferResponse, error)
}

type Processor struct {
	API      API
	Vision   Vision
	WorkerID string
	Log      *slog.Logger
}

// Handle implementa stream.Handler.
func (p *Processor) Handle(ctx context.Context, msg stream.Message) error {
	var evt contracts.AnalysisRequested
	if err := json.Unmarshal(msg.Payload, &evt); err != nil {
		return stream.Permanent("payload não é JSON válido: %v", err)
	}
	if evt.Version != 1 || evt.EventType != contracts.EventAnalysisRequested {
		return stream.Permanent("versão/tipo de evento não suportado: %s v%d", evt.EventType, evt.Version)
	}
	d := evt.Data
	if d.AnalysisID == "" || !contracts.VisionServices[d.Service] || d.Image.Key == "" {
		return stream.Permanent("evento incompleto: analysisId=%q service=%q", d.AnalysisID, d.Service)
	}

	st, err := p.API.AnalysisStarted(ctx, d.AnalysisID, msg.Attempt, p.WorkerID)
	if err != nil {
		return apiclient.Classify(err)
	}
	if st.Status == "COMPLETED" || st.Status == "FAILED" {
		p.Log.Info("análise já finalizada; ignorando entrega duplicada", "analysisId", d.AnalysisID, "status", st.Status)
		return nil
	}

	req := contracts.InferRequest{AnalysisID: d.AnalysisID, Service: d.Service, Image: d.Image}
	if d.Options != nil && d.Options.ConfidenceThreshold != nil {
		req.Options = map[string]any{"confidenceThreshold": *d.Options.ConfidenceThreshold}
	}
	raw, parsed, err := p.Vision.Infer(ctx, req)
	if err != nil {
		return apiclient.Classify(err)
	}
	if parsed.AnalysisID != d.AnalysisID {
		return stream.Permanent("serviço de visão respondeu para outra análise (%s)", parsed.AnalysisID)
	}
	if err := p.API.AnalysisCompleted(ctx, d.AnalysisID, msg.Attempt, raw); err != nil {
		return apiclient.Classify(err)
	}
	p.Log.Info("análise concluída", "analysisId", d.AnalysisID, "verdict", parsed.Summary.Verdict, "mode", parsed.Mode)
	return nil
}

// OnDeadLetter informa a API que a análise falhou definitivamente.
func (p *Processor) OnDeadLetter(ctx context.Context, msg stream.Message, cause error) {
	var evt contracts.AnalysisRequested
	if json.Unmarshal(msg.Payload, &evt) != nil || evt.Data.AnalysisID == "" {
		return
	}
	reason := humanReason(cause, msg.Attempt)
	p.Log.Warn("análise enviada à DLQ", "analysisId", evt.Data.AnalysisID, "cause", fmt.Sprint(cause))
	if err := p.API.AnalysisFailed(ctx, evt.Data.AnalysisID, msg.Attempt, reason); err != nil {
		p.Log.Error("não foi possível marcar análise como falha", "analysisId", evt.Data.AnalysisID, "err", err)
	}
}

// humanReason gera a mensagem exibida ao cliente. Detalhes técnicos (URLs internas,
// erros de rede) ficam só no log do worker — não vazam para a interface.
func humanReason(err error, attempts int) string {
	var he *apiclient.HTTPError
	switch {
	case errors.As(err, &he) && he.Status == 422:
		return "Imagem não pôde ser processada: " + he.Body
	case stream.IsPermanent(err):
		return "Falha permanente no processamento da imagem."
	default:
		return fmt.Sprintf("Serviço de visão indisponível após %d tentativas. Tente reprocessar em alguns minutos.", attempts)
	}
}
