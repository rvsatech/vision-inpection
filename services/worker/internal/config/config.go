// Package config carrega a configuração do worker a partir de variáveis de ambiente.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPAddr            string
	RedisURL            string
	APIInternalURL      string
	InternalToken       string
	VisionURL           string
	StripeWebhookSecret string
	WorkerID            string
	Concurrency         int
	MaxAttempts         int
	BaseBackoff         time.Duration
	MaxBackoff          time.Duration
	VisionTimeout       time.Duration
	ReclaimIdle         time.Duration
	SchedulerEnabled    bool
}

func Load() (Config, error) {
	host, _ := os.Hostname()
	c := Config{
		HTTPAddr:            env("WORKER_HTTP_ADDR", ":"+env("PORT", "8080")), // PORT: convenção de PaaS (Render, Fly)
		RedisURL:            env("REDIS_URL", "redis://localhost:6379"),
		APIInternalURL:      env("API_INTERNAL_URL", "http://localhost:4000"),
		InternalToken:       os.Getenv("INTERNAL_API_TOKEN"),
		VisionURL:           env("VISION_URL", "http://localhost:8000"),
		StripeWebhookSecret: os.Getenv("STRIPE_WEBHOOK_SECRET"),
		WorkerID:            env("WORKER_ID", "worker-"+host),
		Concurrency:         envInt("WORKER_CONCURRENCY", 4),
		MaxAttempts:         envInt("WORKER_MAX_ATTEMPTS", 3),
		BaseBackoff:         envDuration("WORKER_BASE_BACKOFF", 2*time.Second),
		MaxBackoff:          envDuration("WORKER_MAX_BACKOFF", 2*time.Minute),
		VisionTimeout:       envDuration("VISION_TIMEOUT", 60*time.Second),
		ReclaimIdle:         envDuration("WORKER_RECLAIM_IDLE", 90*time.Second),
		SchedulerEnabled:    env("WORKER_SCHEDULER", "true") == "true",
	}
	if c.InternalToken == "" {
		return c, fmt.Errorf("INTERNAL_API_TOKEN é obrigatório")
	}
	if c.Concurrency < 1 || c.MaxAttempts < 1 {
		return c, fmt.Errorf("WORKER_CONCURRENCY e WORKER_MAX_ATTEMPTS devem ser >= 1")
	}
	return c, nil
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil {
		return v
	}
	return def
}

func envDuration(k string, def time.Duration) time.Duration {
	if v, err := time.ParseDuration(os.Getenv(k)); err == nil {
		return v
	}
	return def
}
