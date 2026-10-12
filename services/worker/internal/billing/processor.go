package billing

import (
	"context"
	"log/slog"

	"github.com/vision-inspect/worker/internal/apiclient"
	"github.com/vision-inspect/worker/internal/stream"
)

type API interface {
	BillingEvent(ctx context.Context, e any) (string, error)
}

// Processor consome billing.stripe.events e aplica na API.
type Processor struct {
	API API
	Log *slog.Logger
}

func (p *Processor) Handle(ctx context.Context, msg stream.Message) error {
	evt, ok, err := Map(msg.Payload)
	if err != nil {
		return stream.Permanent("%v", err)
	}
	if !ok {
		p.Log.Info("evento Stripe ignorado", "type", msg.Type)
		return nil
	}
	res, err := p.API.BillingEvent(ctx, evt)
	if err != nil {
		return apiclient.Classify(err)
	}
	p.Log.Info("evento de cobrança aplicado", "eventId", evt.EventID, "type", evt.Type, "result", res)
	return nil
}
