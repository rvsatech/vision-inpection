// Worker do Vision Inspect: consumidores de fila, webhook do Stripe e jobs periódicos.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/vision-inspect/worker/internal/analysis"
	"github.com/vision-inspect/worker/internal/apiclient"
	"github.com/vision-inspect/worker/internal/billing"
	"github.com/vision-inspect/worker/internal/config"
	"github.com/vision-inspect/worker/internal/contracts"
	"github.com/vision-inspect/worker/internal/httpserver"
	"github.com/vision-inspect/worker/internal/metrics"
	"github.com/vision-inspect/worker/internal/scheduler"
	"github.com/vision-inspect/worker/internal/stream"
	"github.com/vision-inspect/worker/internal/visionclient"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg, err := config.Load()
	if err != nil {
		log.Error("configuração inválida", "err", err)
		os.Exit(1)
	}

	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Error("REDIS_URL inválida", "err", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(opts)
	defer rdb.Close()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	m := metrics.New()
	api := apiclient.New(cfg.APIInternalURL, cfg.InternalToken)
	vision := visionclient.New(cfg.VisionURL, cfg.VisionTimeout)

	analysisProc := &analysis.Processor{API: api, Vision: vision, WorkerID: cfg.WorkerID, Log: log.With("component", "analysis")}
	analysisRunner := stream.NewRunner(rdb, stream.Options{
		Stream:      contracts.StreamAnalysisRequested,
		Group:       "vision-workers",
		Consumer:    cfg.WorkerID,
		Concurrency: cfg.Concurrency,
		MaxAttempts: cfg.MaxAttempts,
		BaseBackoff: cfg.BaseBackoff,
		MaxBackoff:  cfg.MaxBackoff,
		ReclaimIdle: cfg.ReclaimIdle,
	}, analysisProc.Handle, analysisProc.OnDeadLetter, log, m)

	billingProc := &billing.Processor{API: api, Log: log.With("component", "billing")}
	billingRunner := stream.NewRunner(rdb, stream.Options{
		Stream:      contracts.StreamStripeEvents,
		Group:       "billing-workers",
		Consumer:    cfg.WorkerID,
		Concurrency: 2,
		MaxAttempts: 8, // eventos de cobrança: insistir mais antes da DLQ
		BaseBackoff: cfg.BaseBackoff,
		MaxBackoff:  10 * time.Minute,
		ReclaimIdle: cfg.ReclaimIdle,
	}, billingProc.Handle, nil, log, m)

	webhook := &billing.WebhookHandler{Redis: rdb, Secret: cfg.StripeWebhookSecret, Tolerance: 5 * time.Minute, Log: log.With("component", "webhook"), Metrics: m}
	srv := httpserver.New(cfg.HTTPAddr, rdb, m, webhook)

	var wg sync.WaitGroup
	run := func(name string, fn func()) {
		wg.Add(1)
		go func() { defer wg.Done(); fn(); log.Info("componente parado", "component", name) }()
	}
	run("analysis-consumer", func() { _ = analysisRunner.Run(ctx) })
	run("billing-consumer", func() { _ = billingRunner.Run(ctx) })
	if cfg.SchedulerEnabled {
		sched := &scheduler.Scheduler{Redis: rdb, API: api, Jobs: scheduler.DefaultJobs(), Owner: cfg.WorkerID, Log: log.With("component", "scheduler")}
		run("scheduler", func() { sched.Run(ctx) })
	}
	run("http", func() {
		log.Info("HTTP ouvindo", "addr", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("servidor HTTP falhou", "err", err)
			stop()
		}
	})
	if cfg.StripeWebhookSecret == "" {
		log.Warn("STRIPE_WEBHOOK_SECRET vazio — /webhooks/stripe responderá 503")
	}

	<-ctx.Done()
	log.Info("encerrando…")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	wg.Wait()
}
