// Package stream implementa um consumidor confiável sobre Redis Streams:
//
//   - consumer groups (XREADGROUP) para distribuir mensagens entre réplicas;
//   - XACK somente após o processamento (entrega at-least-once);
//   - retry com backoff via sorted set "<stream>.retry" (mensagem atrasada);
//   - DLQ em "<stream>.dlq" após esgotar tentativas ou em falha permanente;
//   - XAUTOCLAIM para reassumir mensagens de consumidores que morreram.
package stream

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/vision-inspect/worker/internal/metrics"
)

// Message é uma entrada do stream já decodificada.
type Message struct {
	ID      string
	Type    string
	Payload []byte
	// Attempt é o número desta tentativa (1 = primeira entrega).
	Attempt int
}

// Handler processa uma mensagem. nil → ACK; erro permanente → DLQ; outro erro → retry.
type Handler func(ctx context.Context, msg Message) error

// DeadLetterHook é chamado quando uma mensagem vai para a DLQ (ex.: avisar a API).
type DeadLetterHook func(ctx context.Context, msg Message, cause error)

type Options struct {
	Stream       string
	Group        string
	Consumer     string
	Concurrency  int
	MaxAttempts  int
	BaseBackoff  time.Duration
	MaxBackoff   time.Duration
	Block        time.Duration
	ReclaimIdle  time.Duration
	ReclaimEvery time.Duration
	PromoteEvery time.Duration
}

type Runner struct {
	rdb     *redis.Client
	opt     Options
	handle  Handler
	onDead  DeadLetterHook
	log     *slog.Logger
	metrics *metrics.Registry
	wg      sync.WaitGroup
}

func NewRunner(rdb *redis.Client, opt Options, h Handler, onDead DeadLetterHook, log *slog.Logger, m *metrics.Registry) *Runner {
	if opt.Concurrency < 1 {
		opt.Concurrency = 1
	}
	if opt.Block == 0 {
		opt.Block = 5 * time.Second
	}
	if opt.ReclaimIdle == 0 {
		opt.ReclaimIdle = 90 * time.Second
	}
	if opt.ReclaimEvery == 0 {
		opt.ReclaimEvery = 30 * time.Second
	}
	if opt.PromoteEvery == 0 {
		opt.PromoteEvery = time.Second
	}
	if m == nil {
		m = metrics.New()
	}
	return &Runner{rdb: rdb, opt: opt, handle: h, onDead: onDead, log: log.With("stream", opt.Stream), metrics: m}
}

func (r *Runner) RetryKey() string { return r.opt.Stream + ".retry" }
func (r *Runner) DLQKey() string   { return r.opt.Stream + ".dlq" }

// EnsureGroup cria o consumer group (e o stream) se não existirem.
func (r *Runner) EnsureGroup(ctx context.Context) error {
	err := r.rdb.XGroupCreateMkStream(ctx, r.opt.Stream, r.opt.Group, "0").Err()
	if err != nil && !isBusyGroup(err) {
		return fmt.Errorf("criando grupo %s: %w", r.opt.Group, err)
	}
	return nil
}

// Run bloqueia até ctx ser cancelado; espera o processamento em andamento terminar.
func (r *Runner) Run(ctx context.Context) error {
	if err := r.EnsureGroup(ctx); err != nil {
		return err
	}
	sem := make(chan struct{}, r.opt.Concurrency)
	go r.loop(ctx, r.opt.PromoteEvery, r.promoteDue)
	go r.loop(ctx, r.opt.ReclaimEvery, func(ctx context.Context) error { return r.reclaim(ctx, sem) })

	r.log.Info("consumidor iniciado", "group", r.opt.Group, "consumer", r.opt.Consumer, "concurrency", r.opt.Concurrency)
	for ctx.Err() == nil {
		res, err := r.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    r.opt.Group,
			Consumer: r.opt.Consumer,
			Streams:  []string{r.opt.Stream, ">"},
			Count:    int64(r.opt.Concurrency),
			Block:    r.opt.Block,
		}).Result()
		if err != nil {
			if errors.Is(err, redis.Nil) || ctx.Err() != nil {
				continue
			}
			if isNoGroup(err) {
				_ = r.EnsureGroup(ctx)
				continue
			}
			r.log.Error("XREADGROUP falhou", "err", err)
			sleep(ctx, time.Second)
			continue
		}
		for _, s := range res {
			for _, m := range s.Messages {
				r.dispatch(ctx, sem, m)
			}
		}
	}
	r.wg.Wait()
	r.log.Info("consumidor encerrado")
	return nil
}

func (r *Runner) dispatch(ctx context.Context, sem chan struct{}, xm redis.XMessage) {
	select {
	case sem <- struct{}{}:
	case <-ctx.Done():
		return // fica pendente; outro consumidor reassume via XAUTOCLAIM
	}
	r.wg.Add(1)
	go func() {
		defer func() { <-sem; r.wg.Done() }()
		// Contexto próprio: um shutdown não interrompe a mensagem no meio do caminho.
		hctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Minute)
		defer cancel()
		r.process(hctx, xm)
	}()
}

// process aplica o handler e decide ACK / retry / DLQ.
func (r *Runner) process(ctx context.Context, xm redis.XMessage) {
	msg := decode(xm)
	log := r.log.With("msgId", msg.ID, "attempt", msg.Attempt, "type", msg.Type)

	var err error
	func() {
		defer func() {
			if p := recover(); p != nil {
				err = fmt.Errorf("panic no handler: %v", p)
			}
		}()
		err = r.handle(ctx, msg)
	}()

	switch {
	case err == nil:
		r.metrics.Inc(r.opt.Stream + ".processed")
		log.Info("mensagem processada")
	case IsPermanent(err) || msg.Attempt >= r.opt.MaxAttempts:
		r.metrics.Inc(r.opt.Stream + ".dead_lettered")
		log.Error("mensagem enviada à DLQ", "err", err)
		r.deadLetter(ctx, msg, err)
	default:
		delay := Backoff(msg.Attempt, r.opt.BaseBackoff, r.opt.MaxBackoff)
		r.metrics.Inc(r.opt.Stream + ".retried")
		log.Warn("falha transitória; agendando retry", "err", err, "in", delay.String())
		if serr := r.scheduleRetry(ctx, msg, delay); serr != nil {
			// Sem ACK: a mensagem continua pendente e será reassumida pelo XAUTOCLAIM.
			log.Error("não foi possível agendar retry", "err", serr)
			return
		}
	}
	if err := r.rdb.XAck(ctx, r.opt.Stream, r.opt.Group, msg.ID).Err(); err != nil {
		log.Error("XACK falhou", "err", err)
	}
}

type delayed struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
	Attempt int    `json:"attempt"` // tentativas já feitas
	Origin  string `json:"origin"`
}

func (r *Runner) scheduleRetry(ctx context.Context, msg Message, delay time.Duration) error {
	b, _ := json.Marshal(delayed{Type: msg.Type, Payload: string(msg.Payload), Attempt: msg.Attempt, Origin: msg.ID})
	return r.rdb.ZAdd(ctx, r.RetryKey(), redis.Z{Score: float64(time.Now().Add(delay).UnixMilli()), Member: string(b)}).Err()
}

func (r *Runner) deadLetter(ctx context.Context, msg Message, cause error) {
	reason := "erro desconhecido"
	if cause != nil {
		reason = cause.Error()
	}
	err := r.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: r.DLQKey(),
		MaxLen: 10000,
		Approx: true,
		Values: map[string]any{
			"type": msg.Type, "payload": string(msg.Payload), "attempt": msg.Attempt,
			"error": reason, "origin": msg.ID, "failedAt": time.Now().UTC().Format(time.RFC3339),
		},
	}).Err()
	if err != nil {
		r.log.Error("falha ao gravar na DLQ", "err", err)
	}
	if r.onDead != nil {
		r.onDead(ctx, msg, cause)
	}
}

// promoteScript move atomicamente as mensagens vencidas do sorted set de retry
// de volta para o stream principal, já com o contador de tentativas.
var promoteScript = redis.NewScript(`
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 100)
for _, raw in ipairs(due) do
  local m = cjson.decode(raw)
  redis.call('XADD', KEYS[2], '*', 'type', m.type, 'payload', m.payload, 'attempt', tostring(m.attempt))
  redis.call('ZREM', KEYS[1], raw)
end
return #due
`)

func (r *Runner) promoteDue(ctx context.Context) error {
	n, err := promoteScript.Run(ctx, r.rdb, []string{r.RetryKey(), r.opt.Stream}, time.Now().UnixMilli()).Int()
	if err == nil && n > 0 {
		r.log.Info("retries reenfileirados", "count", n)
	}
	return err
}

// reclaim reassume mensagens pendentes há muito tempo (consumidor caiu antes do ACK).
func (r *Runner) reclaim(ctx context.Context, sem chan struct{}) error {
	msgs, _, err := r.rdb.XAutoClaim(ctx, &redis.XAutoClaimArgs{
		Stream:   r.opt.Stream,
		Group:    r.opt.Group,
		Consumer: r.opt.Consumer,
		MinIdle:  r.opt.ReclaimIdle,
		Start:    "0-0",
		Count:    50,
	}).Result()
	if err != nil {
		return err
	}
	for _, m := range msgs {
		r.metrics.Inc(r.opt.Stream + ".reclaimed")
		r.log.Warn("mensagem reassumida", "msgId", m.ID)
		r.dispatch(ctx, sem, m)
	}
	return nil
}

func (r *Runner) loop(ctx context.Context, every time.Duration, fn func(context.Context) error) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := fn(ctx); err != nil && ctx.Err() == nil {
				r.log.Error("tarefa periódica do consumidor falhou", "err", err)
			}
		}
	}
}

func decode(xm redis.XMessage) Message {
	str := func(k string) string {
		if v, ok := xm.Values[k].(string); ok {
			return v
		}
		return ""
	}
	prev, _ := strconv.Atoi(str("attempt"))
	return Message{ID: xm.ID, Type: str("type"), Payload: []byte(str("payload")), Attempt: prev + 1}
}

func isBusyGroup(err error) bool { return err != nil && strings.Contains(err.Error(), "BUSYGROUP") }
func isNoGroup(err error) bool   { return err != nil && strings.Contains(err.Error(), "NOGROUP") }

func sleep(ctx context.Context, d time.Duration) {
	select {
	case <-ctx.Done():
	case <-time.After(d):
	}
}
