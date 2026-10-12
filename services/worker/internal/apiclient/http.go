// Package apiclient fala com as rotas /internal da API NestJS.
package apiclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/vision-inspect/worker/internal/stream"
)

// HTTPError carrega o status para o chamador decidir entre retry e falha permanente.
type HTTPError struct {
	Status int
	Body   string
}

func (e *HTTPError) Error() string { return fmt.Sprintf("HTTP %d: %s", e.Status, e.Body) }

// Classify: 4xx (exceto 408/429) é permanente; 5xx, 408, 429 e erros de rede são transitórios.
func Classify(err error) error {
	if he, ok := err.(*HTTPError); ok && he.Status >= 400 && he.Status < 500 && he.Status != 408 && he.Status != 429 {
		return fmt.Errorf("%w: %w", stream.ErrPermanent, he)
	}
	return err
}

// PostJSON envia JSON e decodifica a resposta em out (se não for nil).
func PostJSON(ctx context.Context, hc *http.Client, url string, headers map[string]string, in, out any) error {
	body, err := json.Marshal(in)
	if err != nil {
		return stream.Permanent("serializando payload: %v", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return &HTTPError{Status: res.StatusCode, Body: truncate(string(raw), 300)}
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("resposta inválida: %w", err)
		}
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n] + "…"
	}
	return s
}

// Client para a API.
type Client struct {
	base  string
	token string
	hc    *http.Client
}

func New(base, token string) *Client {
	return &Client{base: base, token: token, hc: &http.Client{Timeout: 15 * time.Second}}
}

func (c *Client) post(ctx context.Context, path string, in, out any) error {
	return PostJSON(ctx, c.hc, c.base+path, map[string]string{"X-Internal-Token": c.token}, in, out)
}

type CallbackResult struct {
	Status  string `json:"status"`
	Changed bool   `json:"changed"`
}

func (c *Client) AnalysisStarted(ctx context.Context, id string, attempt int, workerID string) (CallbackResult, error) {
	var r CallbackResult
	err := c.post(ctx, "/internal/analyses/"+id+"/started", map[string]any{"attempt": attempt, "workerId": workerID}, &r)
	return r, err
}

func (c *Client) AnalysisCompleted(ctx context.Context, id string, attempt int, result json.RawMessage) error {
	return c.post(ctx, "/internal/analyses/"+id+"/completed", map[string]any{"attempt": attempt, "result": result}, nil)
}

func (c *Client) AnalysisFailed(ctx context.Context, id string, attempt int, reason string) error {
	return c.post(ctx, "/internal/analyses/"+id+"/failed", map[string]any{"attempt": attempt, "reason": reason}, nil)
}

func (c *Client) BillingEvent(ctx context.Context, e any) (string, error) {
	var r struct {
		Result string `json:"result"`
	}
	err := c.post(ctx, "/internal/billing/events", e, &r)
	return r.Result, err
}

func (c *Client) RunJob(ctx context.Context, name string) (map[string]any, error) {
	var r map[string]any
	err := c.post(ctx, "/internal/jobs/"+name, map[string]any{}, &r)
	return r, err
}
