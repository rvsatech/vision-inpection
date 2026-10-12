package scheduler

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

type fakeAPI struct {
	calls int
	err   error
}

func (f *fakeAPI) RunJob(context.Context, string) (map[string]any, error) {
	f.calls++
	return map[string]any{"ok": true}, f.err
}

func TestLockPreventsDuplicateRunsAcrossReplicas(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	api := &fakeAPI{}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	job := Job{Name: "expire-subscriptions", Every: time.Hour, Timeout: time.Second}
	a := &Scheduler{Redis: rdb, API: api, Owner: "replica-a", Log: log}
	b := &Scheduler{Redis: rdb, API: api, Owner: "replica-b", Log: log}

	if !a.RunOnce(context.Background(), job) {
		t.Fatal("primeira réplica deveria executar")
	}
	if b.RunOnce(context.Background(), job) {
		t.Fatal("segunda réplica não deveria executar no mesmo ciclo")
	}
	mr.FastForward(time.Hour)
	if !b.RunOnce(context.Background(), job) {
		t.Fatal("após o ciclo, outra réplica pode executar")
	}
	if api.calls != 2 {
		t.Fatalf("calls=%d", api.calls)
	}
}

func TestFailedJobReleasesLock(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	api := &fakeAPI{err: errors.New("api fora")}
	s := &Scheduler{Redis: rdb, API: api, Owner: "a", Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	job := Job{Name: "cleanup-files", Every: time.Hour, Timeout: time.Second}
	s.RunOnce(context.Background(), job)
	api.err = nil
	if !s.RunOnce(context.Background(), job) {
		t.Fatal("lock deveria ter sido liberado após a falha")
	}
}
