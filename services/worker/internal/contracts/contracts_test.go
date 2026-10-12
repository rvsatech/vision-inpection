package contracts

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func load(t *testing.T, name string, v any) {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "packages", "contracts", "examples", name))
	if err != nil {
		t.Fatalf("lendo exemplo: %v", err)
	}
	dec := json.NewDecoder(bytesReader(b))
	if err := dec.Decode(v); err != nil {
		t.Fatalf("decodificando %s: %v", name, err)
	}
}

func TestAnalysisRequestedExample(t *testing.T) {
	var e AnalysisRequested
	load(t, "vision.analysis.requested.v1.json", &e)
	if e.Version != 1 || e.EventType != EventAnalysisRequested {
		t.Fatalf("envelope inesperado: %+v", e)
	}
	if !VisionServices[e.Data.Service] || e.Data.Image.Key == "" {
		t.Fatalf("dados inválidos: %+v", e.Data)
	}
	if e.Data.Options == nil || *e.Data.Options.ConfidenceThreshold != 0.35 {
		t.Fatalf("options não decodificado")
	}
}

func TestInferResponseExample(t *testing.T) {
	var r InferResponse
	load(t, "vision.infer.response.v1.json", &r)
	if r.Summary.Verdict != "FAIL" || r.Mode != "heuristic" {
		t.Fatalf("resposta inesperada: %+v", r)
	}
}

func TestBillingEventExample(t *testing.T) {
	var e BillingEvent
	load(t, "billing.stripe.event.v1.json", &e)
	if e.Type != "invoice.paid" || e.Data.Amount == nil || *e.Data.Amount != 149000 || e.Data.CurrentPeriodEnd == nil {
		t.Fatalf("evento inesperado: %+v", e)
	}
}
