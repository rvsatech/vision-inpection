package billing

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/vision-inspect/worker/internal/contracts"
)

// Eventos do Stripe que o sistema trata → tipo interno.
var Handled = map[string]string{
	"checkout.session.completed":    "checkout.completed",
	"invoice.paid":                  "invoice.paid",
	"invoice.payment_failed":        "invoice.payment_failed",
	"customer.subscription.updated": "subscription.updated",
	"customer.subscription.deleted": "subscription.canceled",
}

type rawEvent struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Created  int64  `json:"created"`
	Livemode bool   `json:"livemode"`
	Data     struct {
		Object json.RawMessage `json:"object"`
	} `json:"data"`
}

// idOrObject aceita tanto "cus_123" quanto {"id": "cus_123", ...} (campos expandidos).
type idOrObject string

func (v *idOrObject) UnmarshalJSON(b []byte) error {
	if len(b) > 0 && b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		*v = idOrObject(s)
		return nil
	}
	var o struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(b, &o); err != nil {
		return err
	}
	*v = idOrObject(o.ID)
	return nil
}

type period struct {
	Start int64 `json:"start"`
	End   int64 `json:"end"`
}

type checkoutSession struct {
	Mode              string            `json:"mode"`
	Customer          idOrObject        `json:"customer"`
	Subscription      idOrObject        `json:"subscription"`
	ClientReferenceID string            `json:"client_reference_id"`
	Metadata          map[string]string `json:"metadata"`
}

type invoice struct {
	Customer     idOrObject `json:"customer"`
	Subscription idOrObject `json:"subscription"` // APIs anteriores a 2025
	AmountPaid   int64      `json:"amount_paid"`
	AmountDue    int64      `json:"amount_due"`
	Currency     string     `json:"currency"`
	Parent       *struct {
		SubscriptionDetails *struct {
			Subscription idOrObject        `json:"subscription"`
			Metadata     map[string]string `json:"metadata"`
		} `json:"subscription_details"`
	} `json:"parent"` // APIs 2025+ (basil)
	SubscriptionDetails *struct {
		Metadata map[string]string `json:"metadata"`
	} `json:"subscription_details"`
	Lines struct {
		Data []struct {
			Period period `json:"period"`
		} `json:"data"`
	} `json:"lines"`
}

type subscription struct {
	ID                 string            `json:"id"`
	Customer           idOrObject        `json:"customer"`
	Status             string            `json:"status"`
	CancelAtPeriodEnd  bool              `json:"cancel_at_period_end"`
	CurrentPeriodStart int64             `json:"current_period_start"` // APIs anteriores
	CurrentPeriodEnd   int64             `json:"current_period_end"`
	Metadata           map[string]string `json:"metadata"`
	Items              struct {
		Data []struct {
			CurrentPeriodStart int64 `json:"current_period_start"` // APIs 2025+
			CurrentPeriodEnd   int64 `json:"current_period_end"`
			Price              struct {
				ID string `json:"id"`
			} `json:"price"`
		} `json:"data"`
	} `json:"items"`
}

// Peek lê apenas id/tipo/livemode — usado no handler HTTP antes de enfileirar.
func Peek(payload []byte) (id, typ string, livemode bool, err error) {
	var e rawEvent
	if err = json.Unmarshal(payload, &e); err != nil {
		return
	}
	return e.ID, e.Type, e.Livemode, nil
}

// Map converte o evento bruto do Stripe no contrato interno.
// ok=false significa "evento que não nos interessa".
func Map(payload []byte) (out contracts.BillingEvent, ok bool, err error) {
	var e rawEvent
	if err = json.Unmarshal(payload, &e); err != nil {
		return out, false, fmt.Errorf("evento Stripe inválido: %w", err)
	}
	internal, handled := Handled[e.Type]
	if !handled {
		return out, false, nil
	}
	out = contracts.BillingEvent{EventID: e.ID, Type: internal, OccurredAt: time.Unix(e.Created, 0).UTC(), Livemode: e.Livemode}

	switch e.Type {
	case "checkout.session.completed":
		var s checkoutSession
		if err = json.Unmarshal(e.Data.Object, &s); err != nil {
			return out, false, err
		}
		if s.Mode != "subscription" {
			return out, false, nil
		}
		out.Data = contracts.BillingEventData{
			TenantID:       first(s.Metadata["tenantId"], s.ClientReferenceID),
			PlanCode:       s.Metadata["planCode"],
			CustomerID:     string(s.Customer),
			SubscriptionID: string(s.Subscription),
		}
	case "invoice.paid", "invoice.payment_failed":
		var inv invoice
		if err = json.Unmarshal(e.Data.Object, &inv); err != nil {
			return out, false, err
		}
		subID, meta := string(inv.Subscription), map[string]string{}
		if inv.Parent != nil && inv.Parent.SubscriptionDetails != nil {
			subID = first(string(inv.Parent.SubscriptionDetails.Subscription), subID)
			meta = inv.Parent.SubscriptionDetails.Metadata
		} else if inv.SubscriptionDetails != nil {
			meta = inv.SubscriptionDetails.Metadata
		}
		amount := inv.AmountPaid
		if e.Type == "invoice.payment_failed" {
			amount = inv.AmountDue
		}
		out.Data = contracts.BillingEventData{
			TenantID:       meta["tenantId"],
			PlanCode:       meta["planCode"],
			CustomerID:     string(inv.Customer),
			SubscriptionID: subID,
			Amount:         &amount,
			Currency:       inv.Currency,
		}
		if len(inv.Lines.Data) > 0 {
			out.Data.CurrentPeriodStart = unix(inv.Lines.Data[0].Period.Start)
			out.Data.CurrentPeriodEnd = unix(inv.Lines.Data[0].Period.End)
		}
	case "customer.subscription.updated", "customer.subscription.deleted":
		var s subscription
		if err = json.Unmarshal(e.Data.Object, &s); err != nil {
			return out, false, err
		}
		start, end, price := s.CurrentPeriodStart, s.CurrentPeriodEnd, ""
		if len(s.Items.Data) > 0 {
			it := s.Items.Data[0]
			price = it.Price.ID
			if it.CurrentPeriodEnd != 0 {
				start, end = it.CurrentPeriodStart, it.CurrentPeriodEnd
			}
		}
		cancel := s.CancelAtPeriodEnd
		out.Data = contracts.BillingEventData{
			TenantID:           s.Metadata["tenantId"],
			PlanCode:           s.Metadata["planCode"],
			PriceID:            price,
			CustomerID:         string(s.Customer),
			SubscriptionID:     s.ID,
			Status:             s.Status,
			CurrentPeriodStart: unix(start),
			CurrentPeriodEnd:   unix(end),
			CancelAtPeriodEnd:  &cancel,
		}
	}
	return out, true, nil
}

func first(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func unix(s int64) *time.Time {
	if s == 0 {
		return nil
	}
	t := time.Unix(s, 0).UTC()
	return &t
}
