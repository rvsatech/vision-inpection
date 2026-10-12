# Guia de desenvolvimento

Do zero até o primeiro PR: como subir o projeto, onde mexer para cada tipo de mudança e como testar.

> Comandos escritos para **Git Bash** (Windows), Linux e macOS. Quando o Windows exigir algo diferente, está indicado.

---

## 1. Pré-requisitos

| Ferramenta | Versão | Para quê |
|---|---|---|
| Node.js | 22 (ver `.nvmrc`) | API (NestJS) e Web (Next.js) |
| Docker Desktop | recente | Postgres e Redis (ou a stack inteira) |
| Go | 1.24+ | worker |
| Python | 3.11 ou 3.12 | serviço de visão |
| Git Bash | — | rodar os comandos deste guia no Windows |
| Stripe CLI | opcional | testar webhooks de pagamento |

> **Windows:** mantenha o projeto **fora do OneDrive** (ex.: `C:\Projects\vision-inspection`). A sincronização da `node_modules` deixa o `npm install` lento e trava arquivos.

---

## 2. Primeira vez

### 2.1 Configuração

```bash
git clone <url-do-repo> vision-inspection && cd vision-inspection
cp .env.example .env
```

Gere segredos próprios e cole no `.env` (em `JWT_ACCESS_SECRET` e `INTERNAL_API_TOKEN`):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 2.2 Caminho rápido — tudo em Docker

Bom para **ver o sistema funcionando**. Não tem hot reload.

```bash
docker compose up -d --build     # sobe tudo, aplica migrations e seed
docker compose ps                # todos "running"/"healthy"; "migrate" fica "exited (0)"
```

Abra <http://localhost:3000> e entre com `carla@horizonte.ind.br` / `Horizonte@2026`.

```bash
docker compose logs -f api worker     # acompanhar logs
docker compose down                   # parar (mantém os dados)
docker compose down -v                # parar e APAGAR banco, fila e imagens
```

### 2.3 Caminho de desenvolvimento — com hot reload

Infra no Docker; cada serviço no seu terminal.

```bash
# Terminal 0 — infraestrutura (uma vez por sessão)
docker compose up -d postgres redis

# Uma vez só (e sempre que mudar dependências ou o schema):
npm install                            # instala api + web e gera o Prisma Client
npm run prisma:migrate -w apps/api     # cria as tabelas
npm run prisma:seed -w apps/api        # planos, empresa demo, análises de exemplo
```

```bash
# Terminal 1 — API (http://localhost:4000)
npm run dev:api

# Terminal 2 — Web (http://localhost:3000)
npm run dev:web
```

```bash
# Terminal 3 — Visão (http://localhost:8000)
cd services/vision
python -m venv .venv
source .venv/Scripts/activate          # Git Bash no Windows
# source .venv/bin/activate            # Linux/macOS
# .venv\Scripts\activate               # CMD/PowerShell
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 4 — Worker (http://localhost:8080)
cd services/worker
set -a && source ../../.env && set +a
go run ./cmd/worker
```

### 2.4 Endereços

| Serviço | URL | Checagem |
|---|---|---|
| Web | http://localhost:3000 | — |
| API | http://localhost:4000 | `curl localhost:4000/health/ready` |
| Visão | http://localhost:8000 | `curl localhost:8000/health` · docs interativas em `/docs` |
| Worker | http://localhost:8080 | `curl localhost:8080/readyz` · métricas em `/metrics` |
| Postgres | localhost:5432 | usuário/senha/banco `vision` |
| Redis | localhost:6379 | `docker compose exec redis redis-cli` |

### 2.5 Ver os dados

```bash
cd apps/api && npx prisma studio            # editor visual do banco em http://localhost:5555
docker compose exec redis redis-cli XLEN vision.analysis.requested   # mensagens no stream
docker compose exec redis redis-cli XRANGE vision.analysis.requested.dlq - +   # falhas definitivas
```

---

## 3. Dia a dia: onde mexer

### 3.1 Mudar o banco (Prisma)

1. Edite `apps/api/prisma/schema.prisma`.
2. Gere a migration (aplica no banco local e atualiza o Prisma Client):
   ```bash
   cd apps/api
   npx prisma migrate dev --name adiciona_ordens_de_servico
   ```
3. **Faça commit** da pasta nova em `prisma/migrations/`. Nunca edite uma migration que já foi para a `main`; crie outra.

Outros comandos úteis:

```bash
npx prisma generate            # só regenerar o client (ex.: depois de um git pull)
npx prisma migrate reset       # APAGA o banco local, reaplica tudo e roda o seed
npx prisma migrate status      # o que falta aplicar
```

### 3.2 Novo endpoint ou módulo na API (DDD)

Siga o padrão de um módulo existente (`src/modules/billing` é o mais completo):

```
src/modules/<contexto>/
├── domain/            1. regras e entidades (TypeScript puro, sem Nest/Prisma)
│   └── ports.ts          interfaces dos repositórios/gateways
├── application/       2. caso de uso (orquestra domínio + portas, audita)
├── infrastructure/    3. implementação das portas (Prisma, APIs externas)
├── interfaces/http/   4. controller + DTO com class-validator
└── <contexto>.module.ts   5. liga portas → implementações e registra o controller
```

Depois:

1. importe o módulo em `src/app.module.ts`;
2. proteja a rota com `@RequirePermissions('...')`, ou use `@Public()` para rotas abertas;
3. escreva o teste unitário ao lado da regra (`*.spec.ts`) e, se envolver HTTP ou banco, um teste em `test/*.int-spec.ts`.

> A camada `domain/` não pode importar Nest, Prisma, Redis nem Stripe. O lint bloqueia isso.

### 3.3 Nova permissão ou papel

`apps/api/src/modules/identity/domain/role.ts` (fonte da verdade) e o espelho de exibição em `apps/web/src/lib/auth.tsx`. Atualize a tabela em `docs/dominio.md`.

### 3.4 Nova tela no frontend

- Páginas em `apps/web/src/app/...`: a área logada fica em `app/app/<rota>/page.tsx`, e o menu lateral em `src/components/app/AppShell.tsx`.
- Chamadas à API: `api('/rota')` de `src/lib/api.ts` (o token e a renovação de sessão já são tratados).
- Estilo: CSS Modules, com tokens de cor e tipografia em `src/app/globals.css`.
- Cena 3D da landing: `src/components/drone/scene.tsx` (objetos e trajeto da câmera) e `DroneSection.tsx` (HUD e marcadores).

### 3.5 Mudar um evento entre serviços

A ordem importa, porque os três serviços validam o mesmo contrato:

1. `packages/contracts/schemas/*.json` e o exemplo em `packages/contracts/examples/`;
2. API: tipos em `src/modules/*/domain/ports.ts` ou no DTO interno;
3. Worker: structs em `services/worker/internal/contracts/contracts.go`;
4. Visão: modelos em `services/vision/app/schemas.py`;
5. rode os testes dos três (cada um valida o exemplo).

Mudança incompatível = **nova versão** (`.v2.json`). Mantenha a v1 até todos os produtores e consumidores migrarem.

### 3.6 Worker (Go)

- Novo consumidor de fila: crie um `stream.NewRunner(...)` em `cmd/worker/main.go` com um handler; retry e DLQ vêm prontos.
- Novo job periódico: adicione em `scheduler.DefaultJobs()` e crie a rota `POST /internal/jobs/<nome>` na API.
- Antes de commitar:
  ```bash
  cd services/worker && gofmt -w . && go vet ./... && go test -race ./...
  ```

### 3.7 Visão computacional

```bash
cd services/vision && source .venv/Scripts/activate
python scripts/generate_synthetic.py          # regenerar imagens de exemplo + gabarito
python scripts/build_demo_results.py          # resultados usados pelo seed
python scripts/export_web_demo.py             # imagens/detecções da landing
```

Para usar YOLO, coloque os pesos em `services/vision/models/` (ver `training/README.md`) e reinicie. O serviço troca de backend sozinho.

### 3.8 Stripe (modo de teste)

```bash
# 1. sk_test_... no .env, depois:
npm run stripe:bootstrap -w apps/api           # cria produtos/preços → copie STRIPE_PRICE_* para o .env
npm run prisma:seed -w apps/api                # grava os price IDs nos planos

# 2. webhooks para o worker local
stripe listen --forward-to localhost:8080/webhooks/stripe   # copie o whsec_ para STRIPE_WEBHOOK_SECRET
# reinicie a API e o worker

# 3. simular eventos
stripe trigger invoice.payment_failed
```

Cartão de teste: `4242 4242 4242 4242`, data futura, qualquer CVC.

---

## 4. Testes

| O quê | Comando | Precisa de |
|---|---|---|
| API — unitários | `npm test -w apps/api` | nada |
| API — um arquivo | `npm test -w apps/api -- subscription.spec` | nada |
| API — modo watch | `npm test -w apps/api -- --watch` | nada |
| API — integração | `npm run test:integration -w apps/api` | Postgres + Redis (`docker compose up -d postgres redis`) |
| Worker | `cd services/worker && go test -race ./...` | nada (Redis em memória) |
| Worker — um teste | `go test ./internal/stream -run TestMaxAttempts -v` | nada |
| Visão | `cd services/vision && pytest` | venv ativo |
| Visão — um teste | `pytest tests/test_api.py -k contract -v` | venv ativo |
| E2E | `npm run test:e2e -w apps/web` | stack completa rodando |
| E2E — com navegador visível | `npx playwright test --headed` (em `apps/web`) | stack completa |
| E2E — relatório | `npx playwright show-report` (em `apps/web`) | — |

Primeira vez no E2E: `cd apps/web && npx playwright install chromium`.

### Checagem completa antes do PR

```bash
npm run lint && npm run typecheck && npm test
npm run test:integration -w apps/api
(cd services/worker && gofmt -l . && go vet ./... && go test -race ./...)
(cd services/vision && ruff check . && ruff format --check . && pytest)
```

Formatadores automáticos: `cd services/vision && ruff format .` e `cd services/worker && gofmt -w .`.

---

## 5. Fluxo com Git

```bash
git checkout -b feat/ordens-de-servico
# ... código + testes ...
git add -A && git commit -m "feat(api): ordens de serviço a partir de não conformidades"
git push -u origin feat/ordens-de-servico
```

1. Abra o Pull Request para `main`.
2. O CI roda API, Web, Worker, Visão, Docker e E2E. O merge fica bloqueado até tudo passar (depois de aplicar `scripts/setup-branch-protection.sh`).
3. Depois do merge, o workflow **Deploy** publica (se os secrets estiverem configurados).

Sugestão de prefixos de commit: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`.

---

## 6. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Cannot find module '.../generated/prisma/client'` | Prisma Client não gerado | `npm run prisma:generate -w apps/api` |
| API não sobe: "Variável de ambiente obrigatória ausente" | `.env` faltando ou incompleto | `cp .env.example .env` e preencha |
| API não sobe: "ainda está com o valor de exemplo" | `NODE_ENV=production` com segredos de exemplo | gere segredos novos ou use `NODE_ENV=development` localmente |
| `EADDRINUSE :3000` / `:4000` | outro processo na porta | feche o terminal antigo; no Windows: `netstat -ano \| findstr :3000` e `taskkill /PID <pid> /F` |
| Análise fica "Na fila" para sempre | worker ou visão parados | suba os terminais 3 e 4; veja `localhost:8080/metrics` |
| Análise "Falhou" com "Serviço de visão indisponível" | visão estava fora durante as tentativas | suba a visão e clique em **Reprocessar** |
| Testes de integração: `database "vision_test" does not exist` | volume do Postgres criado antes do `init.sql` | `docker compose exec postgres createdb -U vision vision_test` |
| `npm install` muito lento ou com `EPERM` no Windows | projeto dentro do OneDrive / antivírus | mova o projeto para fora do OneDrive |
| Arquivos aparecem todos modificados no Git (Windows) | quebra de linha CRLF | `git config core.autocrlf false` (o `.gitattributes` já força LF) |
| Página 3D lenta | GPU fraca / modo economia | o sobrevoo reduz a qualidade em telas pequenas e respeita "reduzir movimento" do sistema |
