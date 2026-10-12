package stream

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func setup(t *testing.T, h Handler, onDead DeadLetterHook) (*Runner, *redis.Client, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	r := NewRunner(rdb, Options{
		Stream: "test.stream", Group: "g", Consumer: "c1", Concurrency: 2, MaxAttempts: 3,
		BaseBackoff: time.Millisecond, MaxBackoff: 5 * time.Millisecond, Block: 50 * time.Millisecond,
		ReclaimIdle: time.Second, ReclaimEvery: time.Hour, PromoteEvery: time.Hour,
	}, h, onDead, slog.New(slog.NewTextHandler(io.Discard, nil)), nil)
	if err := r.EnsureGroup(context.Background()); err != nil {
		t.Fatal(err)
	}
	return r, rdb, mr
}

func publish(t *testing.T, rdb *redis.Client, attempt int) string {
	t.Helper()
	id, err := rdb.XAdd(context.Background(), &redis.XAddArgs{Stream: "test.stream", Values: map[string]any{"type": "t", "payload": `{"x":1}`, "attempt": attempt}}).Result()
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func readOne(t *testing.T, rdb *redis.Client, consumer string) redis.XMessage {
	t.Helper()
	res, err := rdb.XReadGroup(context.Background(), &redis.XReadGroupArgs{Group: "g", Consumer: consumer, Streams: []string{"test.stream", ">"}, Count: 1}).Result()
	if err != nil || len(res) == 0 || len(res[0].Messages) == 0 {
		t.Fatalf("nada para ler: %v", err)
	}
	return res[0].Messages[0]
}

func pending(t *testing.T, rdb *redis.Client) int64 {
	p, err := rdb.XPending(context.Background(), "test.stream", "g").Result()
	if err != nil {
		t.Fatal(err)
	}
	return p.Count
}

func TestSuccessAcks(t *testing.T) {
	var calls int32
	r, rdb, _ := setup(t, func(_ context.Context, m Message) error {
		atomic.AddInt32(&calls, 1)
		if m.Attempt != 1 || string(m.Payload) != `{"x":1}` {
			t.Errorf("mensagem inesperada: %+v", m)
		}
		return nil
	}, nil)
	publish(t, rdb, 0)
	r.process(context.Background(), readOne(t, rdb, "c1"))
	if calls != 1 || pending(t, rdb) != 0 {
		t.Fatalf("calls=%d pending=%d", calls, pending(t, rdb))
	}
}

func TestTransientErrorSchedulesRetryAndPromotes(t *testing.T) {
	var attempts []int
	r, rdb, _ := setup(t, func(_ context.Context, m Message) error {
		attempts = append(attempts, m.Attempt)
		if m.Attempt == 1 {
			return errors.New("serviço de visão 503")
		}
		return nil
	}, nil)
	ctx := context.Background()
	publish(t, rdb, 0)
	r.process(ctx, readOne(t, rdb, "c1"))

	if n := rdb.ZCard(ctx, r.RetryKey()).Val(); n != 1 {
		t.Fatalf("esperava 1 retry agendado, veio %d", n)
	}
	if pending(t, rdb) != 0 {
		t.Fatal("mensagem original deveria ter sido confirmada")
	}
	time.Sleep(10 * time.Millisecond)
	if err := r.promoteDue(ctx); err != nil {
		t.Fatal(err)
	}
	if n := rdb.ZCard(ctx, r.RetryKey()).Val(); n != 0 {
		t.Fatalf("retry deveria ter saído do sorted set, restam %d", n)
	}
	r.process(ctx, readOne(t, rdb, "c1"))
	if len(attempts) != 2 || attempts[1] != 2 {
		t.Fatalf("tentativas = %v", attempts)
	}
}

func TestMaxAttemptsGoesToDLQ(t *testing.T) {
	var dead int32
	r, rdb, _ := setup(t, func(context.Context, Message) error { return errors.New("timeout") }, func(_ context.Context, m Message, _ error) {
		atomic.AddInt32(&dead, 1)
		if m.Attempt != 3 {
			t.Errorf("DLQ na tentativa %d", m.Attempt)
		}
	})
	ctx := context.Background()
	publish(t, rdb, 2) // já falhou 2 vezes → esta é a 3ª e última
	r.process(ctx, readOne(t, rdb, "c1"))
	if dead != 1 || rdb.XLen(ctx, r.DLQKey()).Val() != 1 || rdb.ZCard(ctx, r.RetryKey()).Val() != 0 {
		t.Fatalf("dead=%d dlq=%d retry=%d", dead, rdb.XLen(ctx, r.DLQKey()).Val(), rdb.ZCard(ctx, r.RetryKey()).Val())
	}
	entry := rdb.XRange(ctx, r.DLQKey(), "-", "+").Val()[0]
	if entry.Values["error"] != "timeout" {
		t.Fatalf("motivo não registrado: %v", entry.Values)
	}
}

func TestPermanentErrorSkipsRetries(t *testing.T) {
	r, rdb, _ := setup(t, func(context.Context, Message) error { return Permanent("imagem corrompida") }, nil)
	ctx := context.Background()
	publish(t, rdb, 0)
	r.process(ctx, readOne(t, rdb, "c1"))
	if rdb.XLen(ctx, r.DLQKey()).Val() != 1 || rdb.ZCard(ctx, r.RetryKey()).Val() != 0 {
		t.Fatal("falha permanente deveria ir direto à DLQ")
	}
}

func TestPanicIsTreatedAsFailure(t *testing.T) {
	r, rdb, _ := setup(t, func(context.Context, Message) error { panic("bug") }, nil)
	ctx := context.Background()
	publish(t, rdb, 0)
	r.process(ctx, readOne(t, rdb, "c1"))
	if rdb.ZCard(ctx, r.RetryKey()).Val() != 1 {
		t.Fatal("panic deveria virar retry, não derrubar o worker")
	}
}

func TestReclaimFromDeadConsumer(t *testing.T) {
	var got int32
	r, rdb, mr := setup(t, func(context.Context, Message) error { atomic.AddInt32(&got, 1); return nil }, nil)
	ctx := context.Background()
	start := time.Now()
	mr.SetTime(start)
	publish(t, rdb, 0)
	_ = readOne(t, rdb, "consumidor-que-caiu") // lido e nunca confirmado
	mr.SetTime(start.Add(2 * time.Second))

	sem := make(chan struct{}, 1)
	if err := r.reclaim(ctx, sem); err != nil {
		t.Fatal(err)
	}
	r.wg.Wait()
	if got != 1 || pending(t, rdb) != 0 {
		t.Fatalf("got=%d pending=%d", got, pending(t, rdb))
	}
}

func TestRunEndToEnd(t *testing.T) {
	done := make(chan struct{}, 3)
	r, rdb, _ := setup(t, func(context.Context, Message) error { done <- struct{}{}; return nil }, nil)
	ctx, cancel := context.WithCancel(context.Background())
	go func() { _ = r.Run(ctx) }()
	for i := 0; i < 3; i++ {
		publish(t, rdb, 0)
	}
	for i := 0; i < 3; i++ {
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			t.Fatal("mensagens não processadas")
		}
	}
	cancel()
	time.Sleep(100 * time.Millisecond)
	if pending(t, rdb) != 0 {
		t.Fatal("restaram pendentes")
	}
}

func TestBackoffGrowsAndIsCapped(t *testing.T) {
	base, max := 100*time.Millisecond, time.Second
	for attempt := 1; attempt <= 10; attempt++ {
		d := Backoff(attempt, base, max)
		upper := base << (attempt - 1)
		if upper > max || upper <= 0 {
			upper = max
		}
		if d < upper/2 || d > upper {
			t.Fatalf("attempt %d: %v fora de [%v, %v]", attempt, d, upper/2, upper)
		}
	}
}
