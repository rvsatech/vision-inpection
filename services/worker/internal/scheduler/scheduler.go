// Package scheduler dispara jobs periódicos na API. Um lock no Redis garante
// que, com várias réplicas do worker, cada execução aconteça uma única vez.
package scheduler

import (
	"context"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

type Job struct {
	Name    string        // nome da rota /internal/jobs/<Name>
	Every   time.Duration // intervalo
	Timeout time.Duration
	Jitter  time.Duration // atraso inicial para não disparar tudo junto no boot
}

type Runner interface {
	RunJob(ctx context.Context, name string) (map[string]any, error)
}

type Scheduler struct {
	Redis *redis.Client
	API   Runner
	Jobs  []Job
	Owner string
	Log   *slog.Logger
}

// DefaultJobs são os jobs de manutenção do sistema.
func DefaultJobs() []Job {
	return []Job{
		{Name: "requeue-stale-analyses", Every: 5 * time.Minute, Timeout: time.Minute, Jitter: 20 * time.Second},
		{Name: "expire-subscriptions", Every: time.Hour, Timeout: 2 * time.Minute, Jitter: 40 * time.Second},
		{Name: "cleanup-files", Every: 24 * time.Hour, Timeout: 10 * time.Minute, Jitter: 2 * time.Minute},
	}
}

func (s *Scheduler) Run(ctx context.Context) {
	for _, j := range s.Jobs {
		go s.loop(ctx, j)
	}
	<-ctx.Done()
}

func (s *Scheduler) loop(ctx context.Context, j Job) {
	select {
	case <-ctx.Done():
		return
	case <-time.After(j.Jitter):
	}
	s.RunOnce(ctx, j)
	t := time.NewTicker(j.Every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.RunOnce(ctx, j)
		}
	}
}

// RunOnce executa o job se conseguir o lock. Retorna true se executou.
func (s *Scheduler) RunOnce(ctx context.Context, j Job) bool {
	lockKey := "lock:job:" + j.Name
	// O lock dura quase um intervalo inteiro: outra réplica não repete o job no mesmo ciclo.
	ttl := j.Every - j.Every/10
	got, err := s.Redis.SetNX(ctx, lockKey, s.Owner, ttl).Result()
	if err != nil || !got {
		return false
	}
	jctx, cancel := context.WithTimeout(ctx, j.Timeout)
	defer cancel()
	start := time.Now()
	res, err := s.API.RunJob(jctx, j.Name)
	if err != nil {
		s.Log.Error("job falhou", "job", j.Name, "err", err)
		_ = s.Redis.Del(context.WithoutCancel(ctx), lockKey).Err() // permite nova tentativa no próximo tick
		return false
	}
	s.Log.Info("job executado", "job", j.Name, "result", res, "took", time.Since(start).String())
	return true
}
