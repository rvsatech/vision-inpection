# Contratos entre serviços

Fonte única de verdade dos payloads trocados entre **API (NestJS)**, **worker (Go)** e **serviço de visão (Python)**.

| Contrato | Produtor → Consumidor | Transporte | Schema |
|---|---|---|---|
| `vision.analysis.requested` v1 | API → Worker | Redis Stream `vision.analysis.requested` | [`schemas/vision.analysis.requested.v1.json`](schemas/vision.analysis.requested.v1.json) |
| Inferência | Worker → Visão | HTTP `POST /v1/infer` | [`schemas/vision.infer.request.v1.json`](schemas/vision.infer.request.v1.json) / [`schemas/vision.infer.response.v1.json`](schemas/vision.infer.response.v1.json) |
| Callbacks de análise | Worker → API | HTTP interno `POST /internal/analyses/:id/{started,completed,failed}` | [`schemas/analysis.callback.v1.json`](schemas/analysis.callback.v1.json) |
| `billing.stripe.event` v1 | Worker → API | HTTP interno `POST /internal/billing/events` | [`schemas/billing.stripe.event.v1.json`](schemas/billing.stripe.event.v1.json) |

Regras:

1. **Versão no envelope.** Toda mensagem tem `version`. Mudança incompatível = nova versão + novo schema; produtores e consumidores convivem com as duas durante a migração.
2. **Idempotência.** Todo evento tem `eventId` (UUID). Consumidores devem tolerar entrega duplicada (*at-least-once*).
3. **Exemplos são testados.** Os arquivos em `examples/` são validados pelos testes de cada serviço (Jest, `go test`, `pytest`). Se você mudar um schema, atualize o exemplo e os testes quebram onde houver divergência.
