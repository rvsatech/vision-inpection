// Package billing recebe webhooks do Stripe, valida, deduplica, enfileira e
// traduz para o contrato interno billing.stripe.event v1.
package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"
)

var (
	ErrNoSignature  = errors.New("cabeçalho Stripe-Signature ausente ou malformado")
	ErrBadSignature = errors.New("assinatura do webhook inválida")
	ErrTooOld       = errors.New("timestamp do webhook fora da tolerância")
)

// VerifySignature implementa o esquema v1 do Stripe:
//
//	Stripe-Signature: t=<unix>,v1=<hex hmac-sha256("<t>.<payload>", secret)>[,v1=...]
//
// Reimplementado (≈30 linhas) para não acoplar o worker ao SDK do Stripe.
func VerifySignature(payload []byte, header, secret string, tolerance time.Duration, now time.Time) error {
	if header == "" || secret == "" {
		return ErrNoSignature
	}
	var ts int64
	var sigs [][]byte
	for _, part := range strings.Split(header, ",") {
		k, v, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch k {
		case "t":
			ts, _ = strconv.ParseInt(v, 10, 64)
		case "v1":
			if b, err := hex.DecodeString(v); err == nil {
				sigs = append(sigs, b)
			}
		}
	}
	if ts == 0 || len(sigs) == 0 {
		return ErrNoSignature
	}
	if tolerance > 0 && now.Sub(time.Unix(ts, 0)).Abs() > tolerance {
		return ErrTooOld
	}
	expected := Sign(payload, secret, ts)
	for _, s := range sigs {
		if hmac.Equal(s, expected) {
			return nil
		}
	}
	return ErrBadSignature
}

// Sign gera a assinatura v1 (usado também nos testes).
func Sign(payload []byte, secret string, ts int64) []byte {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(ts, 10)))
	mac.Write([]byte("."))
	mac.Write(payload)
	return mac.Sum(nil)
}

// SignatureHeader monta o cabeçalho como o Stripe faria (para testes e CLI local).
func SignatureHeader(payload []byte, secret string, ts int64) string {
	return "t=" + strconv.FormatInt(ts, 10) + ",v1=" + hex.EncodeToString(Sign(payload, secret, ts))
}
