// Package metrics expõe contadores simples em /metrics (JSON), sem dependências.
package metrics

import (
	"encoding/json"
	"net/http"
	"sync"
)

type Registry struct {
	mu       sync.Mutex
	counters map[string]int64
}

func New() *Registry { return &Registry{counters: map[string]int64{}} }

func (r *Registry) Inc(name string) {
	r.mu.Lock()
	r.counters[name]++
	r.mu.Unlock()
}

func (r *Registry) Snapshot() map[string]int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make(map[string]int64, len(r.counters))
	for k, v := range r.counters {
		out[k] = v
	}
	return out
}

func (r *Registry) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(r.Snapshot())
	})
}
