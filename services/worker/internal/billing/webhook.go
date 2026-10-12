package billing

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/vision-inspect/worker/internal/contracts"
	"github.com/vision-inspect/worker/internal/metrics"
)

const dedupTTL = 7 * 24 * time.Hour

// WebhookHandler responde rápido ao Stripe (< 1s): valida assinatura, deduplica
// e enfileira. O processamento pesado acontece no consumidor, com retry.
type WebhookHandler struct {
	Redis     *redis.Client
	Secret    string
	Tolerance time.Duration
	Log       *slog.Logger
	Metrics   *metrics.Registry
	Now       func() time.Time
}

func (h *WebhookHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.Secret == "" {
		http.Error(w, "webhook não configurado", http.StatusServiceUnavailable)
		return
	}
	payload, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "corpo inválido", http.StatusBadRequest)
		return
	}
	now := time.Now
	if h.Now != nil {
		now = h.Now
	}
	if err := VerifySignature(payload, r.Header.Get("Stripe-Signature"), h.Secret, h.Tolerance, now()); err != nil {
		h.Metrics.Inc("webhook.rejected")
		h.Log.Warn("webhook rejeitado", "err", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	id, typ, _, err := Peek(payload)
	if err != nil || id == "" {
		http.Error(w, "evento inválido", http.StatusBadRequest)
		return
	}
	if _, ok := Handled[typ]; !ok {
		h.Metrics.Inc("webhook.ignored")
		writeJSON(w, `{"received":true,"ignored":true}`)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	dedupKey := "stripe:event:" + id
	fresh, err := h.Redis.SetNX(ctx, dedupKey, 1, dedupTTL).Result()
	if err != nil {
		h.Log.Error("redis indisponível no webhook", "err", err)
		http.Error(w, "indisponível", http.StatusServiceUnavailable) // o Stripe reenvia
		return
	}
	if !fresh {
		h.Metrics.Inc("webhook.duplicate")
		writeJSON(w, `{"received":true,"duplicate":true}`)
		return
	}
	err = h.Redis.XAdd(ctx, &redis.XAddArgs{
		Stream: contracts.StreamStripeEvents,
		MaxLen: 20000,
		Approx: true,
		Values: map[string]any{"type": typ, "payload": string(payload), "attempt": 0},
	}).Err()
	if err != nil {
		_ = h.Redis.Del(context.WithoutCancel(ctx), dedupKey).Err()
		h.Log.Error("falha ao enfileirar webhook", "err", err)
		http.Error(w, "indisponível", http.StatusServiceUnavailable)
		return
	}
	h.Metrics.Inc("webhook.accepted")
	h.Log.Info("webhook enfileirado", "eventId", id, "type", typ)
	writeJSON(w, `{"received":true}`)
}

func writeJSON(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = io.WriteString(w, body)
}
