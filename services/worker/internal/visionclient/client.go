// Package visionclient chama o serviço Python de visão computacional.
package visionclient

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/vision-inspect/worker/internal/apiclient"
	"github.com/vision-inspect/worker/internal/contracts"
)

type Client struct {
	base string
	hc   *http.Client
}

func New(base string, timeout time.Duration) *Client {
	return &Client{base: base, hc: &http.Client{Timeout: timeout}}
}

// Infer devolve o JSON bruto (contrato vision.infer.response v1) e um resumo decodificado.
func (c *Client) Infer(ctx context.Context, req contracts.InferRequest) (json.RawMessage, contracts.InferResponse, error) {
	var raw json.RawMessage
	var parsed contracts.InferResponse
	if err := apiclient.PostJSON(ctx, c.hc, c.base+"/v1/infer", nil, req, &raw); err != nil {
		return nil, parsed, err
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, parsed, err
	}
	return raw, parsed, nil
}
