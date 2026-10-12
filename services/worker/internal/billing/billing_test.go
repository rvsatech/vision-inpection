package billing

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/vision-inspect/worker/internal/contracts"
	"github.com/vision-inspect/worker/internal/metrics"
	"github.com/vision-inspect/worker/internal/stream"
)

const secret = "whsec_test_secret"

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestVerifySignature(t *testing.T) {
	body := []byte(`{"id":"evt_1"}`)
	now := time.Unix(1760184000, 0)
	ts := now.Unix()

	if err := VerifySignature(body, SignatureHeader(body, secret, ts), secret, 5*time.Minute, now); err != nil {
		t.Fatalf("assinatura válida rejeitada: %v", err)
	}
	// Múltiplas assinaturas (rotação de segredo): basta uma bater.
	multi := "t=" + itoa(ts) + ",v1=deadbeef," + strings.Split(SignatureHeader(body, secret, ts), ",")[1]
	if err := VerifySignature(body, multi, secret, 5*time.Minute, now); err != nil {
		t.Fatalf("multi-assinatura: %v", err)
	}
	cases := map[string]struct {
		header string
		want   error
	}{
		"segredo errado":   {SignatureHeader(body, "whsec_outro", ts), ErrBadSignature},
		"payload alterado": {SignatureHeader([]byte(`{"id":"evt_2"}`), secret, ts), ErrBadSignature},
		"replay antigo":    {SignatureHeader(body, secret, ts-3600), ErrTooOld},
		"sem cabeçalho":    {"", ErrNoSignature},
		"malformado":       {"lixo", ErrNoSignature},
	}
	for name, c := range cases {
		if err := VerifySignature(body, c.header, secret, 5*time.Minute, now); err != c.want {
			t.Errorf("%s: esperado %v, veio %v", name, c.want, err)
		}
	}
}

func TestMapCheckout(t *testing.T) {
	e, ok, err := Map(fixture(t, "checkout.session.completed.json"))
	if err != nil || !ok {
		t.Fatal(ok, err)
	}
	if e.Type != "checkout.completed" || e.Data.PlanCode != "PRO" || e.Data.SubscriptionID != "sub_Test" || e.Data.TenantID == "" {
		t.Fatalf("%+v", e)
	}
}

func TestMapInvoicePaidNewAPIShape(t *testing.T) {
	e, ok, err := Map(fixture(t, "invoice.paid.basil.json"))
	if err != nil || !ok {
		t.Fatal(ok, err)
	}
	if e.Data.SubscriptionID != "sub_Test" || *e.Data.Amount != 189000 || e.Data.CurrentPeriodEnd == nil || e.Data.TenantID == "" {
		t.Fatalf("%+v", e.Data)
	}
}

func TestMapInvoiceFailedLegacyShapeWithExpandedCustomer(t *testing.T) {
	e, ok, err := Map(fixture(t, "invoice.payment_failed.legacy.json"))
	if err != nil || !ok {
		t.Fatal(ok, err)
	}
	if e.Type != "invoice.payment_failed" || e.Data.CustomerID != "cus_Test" || e.Data.SubscriptionID != "sub_Test" || *e.Data.Amount != 189000 {
		t.Fatalf("%+v", e.Data)
	}
}

func TestMapSubscriptionUpdated(t *testing.T) {
	e, ok, err := Map(fixture(t, "customer.subscription.updated.json"))
	if err != nil || !ok {
		t.Fatal(ok, err)
	}
	if e.Data.Status != "past_due" || e.Data.PriceID != "price_pro" || !*e.Data.CancelAtPeriodEnd || e.Data.CurrentPeriodEnd.Unix() != 1762862400 {
		t.Fatalf("%+v", e.Data)
	}
}

func TestMapIgnoresOtherEvents(t *testing.T) {
	_, ok, err := Map([]byte(`{"id":"evt","type":"customer.created","data":{"object":{}}}`))
	if err != nil || ok {
		t.Fatal("deveria ignorar")
	}
	_, ok, _ = Map([]byte(`{"id":"evt","type":"checkout.session.completed","data":{"object":{"mode":"payment"}}}`))
	if ok {
		t.Fatal("checkout avulso (não assinatura) deveria ser ignorado")
	}
}

func webhookSetup(t *testing.T) (*WebhookHandler, *redis.Client) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	return &WebhookHandler{Redis: rdb, Secret: secret, Tolerance: 5 * time.Minute, Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Metrics: metrics.New()}, rdb
}

func post(h http.Handler, body []byte, sig string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/webhooks/stripe", strings.NewReader(string(body)))
	req.Header.Set("Stripe-Signature", sig)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestWebhookEnqueuesOnceAndRejectsForgery(t *testing.T) {
	h, rdb := webhookSetup(t)
	body := fixture(t, "invoice.paid.basil.json")
	sig := SignatureHeader(body, secret, time.Now().Unix())

	if w := post(h, body, sig); w.Code != 200 {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if w := post(h, body, sig); w.Code != 200 || !strings.Contains(w.Body.String(), "duplicate") {
		t.Fatalf("duplicado: %d %s", w.Code, w.Body)
	}
	if n := rdb.XLen(context.Background(), contracts.StreamStripeEvents).Val(); n != 1 {
		t.Fatalf("esperava 1 evento na fila, veio %d", n)
	}
	if w := post(h, body, SignatureHeader(body, "whsec_falso", time.Now().Unix())); w.Code != 400 {
		t.Fatalf("assinatura falsa aceita: %d", w.Code)
	}
}

func TestWebhookIgnoresUnhandledTypes(t *testing.T) {
	h, rdb := webhookSetup(t)
	body := []byte(`{"id":"evt_x","type":"customer.created","data":{"object":{}}}`)
	if w := post(h, body, SignatureHeader(body, secret, time.Now().Unix())); w.Code != 200 || !strings.Contains(w.Body.String(), "ignored") {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if rdb.XLen(context.Background(), contracts.StreamStripeEvents).Val() != 0 {
		t.Fatal("não deveria enfileirar")
	}
}

type fakeBillingAPI struct {
	got []any
	err error
}

func (f *fakeBillingAPI) BillingEvent(_ context.Context, e any) (string, error) {
	f.got = append(f.got, e)
	return "applied", f.err
}

func TestProcessorForwardsNormalizedEvent(t *testing.T) {
	api := &fakeBillingAPI{}
	p := &Processor{API: api, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	if err := p.Handle(context.Background(), stream.Message{Payload: fixture(t, "checkout.session.completed.json"), Attempt: 1}); err != nil {
		t.Fatal(err)
	}
	ev := api.got[0].(contracts.BillingEvent)
	if ev.EventID != "evt_test_checkout" || ev.Type != "checkout.completed" {
		t.Fatalf("%+v", ev)
	}
	if err := p.Handle(context.Background(), stream.Message{Payload: []byte("{"), Attempt: 1}); !stream.IsPermanent(err) {
		t.Fatal("JSON inválido deveria ser permanente")
	}
}

func itoa(i int64) string {
	return strings.TrimSpace(strings.Split(SignatureHeader(nil, "x", i), ",")[0][2:])
}
