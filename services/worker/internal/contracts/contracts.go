// Package contracts espelha os schemas em packages/contracts (fonte única de verdade).
// Os testes decodificam os exemplos versionados para detectar divergências.
package contracts

import "time"

const (
	StreamAnalysisRequested = "vision.analysis.requested"
	StreamStripeEvents      = "billing.stripe.events"

	EventAnalysisRequested = "vision.analysis.requested"
)

var VisionServices = map[string]bool{"QUALITY_DEFECT": true, "PPE_COMPLIANCE": true, "OBJECT_COUNT": true}

// ImageRef aponta para a imagem da análise (storage local compartilhado ou URL assinada).
type ImageRef struct {
	Storage     string `json:"storage"`
	Key         string `json:"key"`
	URL         string `json:"url,omitempty"`
	ContentType string `json:"contentType"`
}

// AnalysisRequested — contrato vision.analysis.requested v1.
type AnalysisRequested struct {
	EventID    string    `json:"eventId"`
	EventType  string    `json:"eventType"`
	Version    int       `json:"version"`
	OccurredAt time.Time `json:"occurredAt"`
	Data       struct {
		AnalysisID string   `json:"analysisId"`
		TenantID   string   `json:"tenantId"`
		Service    string   `json:"service"`
		Image      ImageRef `json:"image"`
		Options    *struct {
			ConfidenceThreshold *float64 `json:"confidenceThreshold,omitempty"`
		} `json:"options,omitempty"`
	} `json:"data"`
}

// InferRequest — contrato vision.infer.request v1 (Worker → Python).
type InferRequest struct {
	AnalysisID string         `json:"analysisId"`
	Service    string         `json:"service"`
	Image      ImageRef       `json:"image"`
	Options    map[string]any `json:"options,omitempty"`
}

// InferResponse — contrato vision.infer.response v1. Mantido como RawMessage no
// repasse para a API para não perder campos que o worker não precisa interpretar.
type InferResponse struct {
	AnalysisID string `json:"analysisId"`
	Service    string `json:"service"`
	Mode       string `json:"mode"`
	Summary    struct {
		Verdict  string `json:"verdict"`
		Headline string `json:"headline"`
	} `json:"summary"`
}

// BillingEvent — contrato billing.stripe.event v1 (Worker → API).
type BillingEvent struct {
	EventID    string           `json:"eventId"`
	Type       string           `json:"type"`
	OccurredAt time.Time        `json:"occurredAt"`
	Livemode   bool             `json:"livemode"`
	Data       BillingEventData `json:"data"`
}

type BillingEventData struct {
	TenantID           string     `json:"tenantId,omitempty"`
	PlanCode           string     `json:"planCode,omitempty"`
	PriceID            string     `json:"priceId,omitempty"`
	CustomerID         string     `json:"customerId,omitempty"`
	SubscriptionID     string     `json:"subscriptionId,omitempty"`
	Status             string     `json:"status,omitempty"`
	CurrentPeriodStart *time.Time `json:"currentPeriodStart,omitempty"`
	CurrentPeriodEnd   *time.Time `json:"currentPeriodEnd,omitempty"`
	CancelAtPeriodEnd  *bool      `json:"cancelAtPeriodEnd,omitempty"`
	Amount             *int64     `json:"amount,omitempty"`
	Currency           string     `json:"currency,omitempty"`
}
