# Deploy sem custo inicial

## Arquitetura recomendada

| Peça | Serviço | Plano gratuito (verifique os limites atuais no site de cada provedor) | Por quê |
|---|---|---|---|
| Web (Next.js) | **Vercel** | Hobby | suporte nativo ao Next.js, deploy por push, preview por PR |
| API (NestJS) | **Render** (Web Service, Docker) | Free | roda o mesmo Dockerfile do ambiente local; sem cartão |
| Worker (Go) | **Render** (Web Service, Docker) | Free | o worker expõe HTTP (webhook + health), então cabe como web service |
| Visão (Python) | **Hugging Face Spaces** (Docker) | CPU básica gratuita | mais memória que os PaaS gratuitos comuns, suficiente para OpenCV e YOLO pequeno em CPU |
| PostgreSQL | **Supabase** | Free | Postgres gerenciado + Storage para as imagens |
| Imagens | **Supabase Storage** | Free | bucket privado; a fila leva URLs assinadas temporárias |
| Redis | **Upstash** | Free | Redis gerenciado com suporte a Streams, conexão TLS (`rediss://`) |

### Por que não tudo em um lugar só

- **Cloudflare Workers/Pages** não roda NestJS com `pg`/`ioredis` nativos nem processos longos (consumidor de fila).
- **Fly.io** e **Railway** funcionam bem para API/worker, mas hoje não oferecem plano gratuito permanente para contas novas (trial/créditos).
- **Vercel** para a API: funções serverless não mantêm o consumidor/conexões; serve só para o front.

### Limitações do plano gratuito (e como o sistema lida)

| Limitação | Efeito | Mitigação no projeto |
|---|---|---|
| Render Free hiberna após ~15 min sem tráfego | primeira requisição lenta (cold start); worker parado não consome a fila | mensagens ficam no Redis Streams e são processadas quando o worker acorda; webhooks do Stripe com retry acordam o worker; `requeue-stale-analyses` cobre o resto. Para uso real: plano pago do worker ou um ping de saúde periódico |
| Supabase Free: ~500 MB de banco, ~1 GB de storage, pausa após 1 semana sem atividade | dados de demonstração cabem com folga | retenção de imagens (`FILE_RETENTION_DAYS`), resultados em JSONB compactos |
| Upstash Free: limite mensal de comandos | `XREADGROUP BLOCK` consome comandos continuamente | `WORKER_CONCURRENCY` baixo; em uso real, plano pago ou Redis próprio |
| HF Spaces gratuito hiberna sem uso | primeira inferência lenta | retry do worker absorve o tempo de boot (503 → retry) |

## Variáveis de ambiente

### API (Render)

| Variável | Exemplo | Observação |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.xxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres` | pooler (transação) do Supabase |
| `DIRECT_DATABASE_URL` | `postgresql://postgres:SENHA@db.xxx.supabase.co:5432/postgres` | conexão direta, usada pelas migrations |
| `REDIS_URL` | `rediss://default:TOKEN@xxx.upstash.io:6379` | |
| `APP_URL` / `CORS_ORIGINS` | `https://vision-inspect.vercel.app` | |
| `JWT_ACCESS_SECRET` | 48+ bytes aleatórios | o Render gera automaticamente pelo blueprint |
| `INTERNAL_API_TOKEN` | aleatório, **igual** no worker | |
| `COOKIE_SECURE` | `true` | |
| `STORAGE_DRIVER` | `supabase` | |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | | crie o bucket `inspections` **privado** |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` | `sk_test_...` | somente teste |

### Worker (Render)

`REDIS_URL`, `API_INTERNAL_URL` (URL pública da API no Render), `VISION_URL` (URL do Space), `INTERNAL_API_TOKEN`, `STRIPE_WEBHOOK_SECRET`.

### Visão (Hugging Face Space)

`VISION_BACKEND=auto`. Com storage Supabase não é preciso volume: a imagem chega por URL assinada.

### Web (Vercel)

`API_URL` = URL pública da API. Root directory do projeto na Vercel: `apps/web`. `NEXT_PUBLIC_DEMO_MODE=true` só se o ambiente for uma demonstração pública com dados fictícios.

## Segredos: checklist antes de publicar

- Nunca versione `.env` (já está no `.gitignore`); use as variáveis do painel de cada provedor e os *secrets* do GitHub.
- `JWT_ACCESS_SECRET` e `INTERNAL_API_TOKEN`: valores aleatórios exclusivos (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`). A API recusa subir em produção com os valores de exemplo.
- `SEED_ADMIN_PASSWORD`: obrigatório em produção; as senhas do README valem só para o ambiente local.
- Supabase: a `service_role` key fica **só** na API (nunca no front, nunca com prefixo `NEXT_PUBLIC_`).
- Stripe: somente chaves de teste; o `whsec_` fica só no worker.

## Passo a passo

1. **Supabase**: crie o projeto (região São Paulo), copie as duas connection strings, crie o bucket privado `inspections`.
2. **Migrations e seed** (da sua máquina, uma vez):
   ```bash
   DATABASE_URL="<pooler>" DIRECT_DATABASE_URL="<direta>" npm run prisma:migrate -w apps/api
   # opcional: dados de demonstração — em produção a senha do admin da plataforma é obrigatória
   NODE_ENV=production SEED_ADMIN_PASSWORD="<senha forte>" DATABASE_URL="<direta>" npm run prisma:seed -w apps/api
   ```
3. **Upstash**: crie um Redis e copie a URL `rediss://`.
4. **Render**: *New → Blueprint* apontando para o repositório (usa `render.yaml`); preencha as variáveis marcadas como `sync: false`. Copie os **Deploy Hooks** de cada serviço para os secrets do GitHub.
5. **Hugging Face**: crie um Space do tipo Docker; gere um token com escrita; configure `HF_TOKEN` (secret) e `HF_SPACE` (variável, ex.: `seu-usuario/vision-inspect-vision`) no GitHub.
6. **Vercel**: importe o repositório, root directory `apps/web`, variável `API_URL`.
7. **Stripe (teste)**: rode `npm run stripe:bootstrap -w apps/api` com a chave de teste; em *Developers → Webhooks* crie um endpoint `https://<worker>.onrender.com/webhooks/stripe` com os 5 eventos tratados (ver [stripe.md](stripe.md)) e copie o `whsec_` para o worker.
8. Faça merge na `main`: o CI roda e, verde, o workflow **Deploy** dispara os hooks.

## Domínio e HTTPS

Todos os provedores acima entregam HTTPS automático. Para domínio próprio, aponte `app.` para a Vercel e `api.`/`worker.` para o Render; ajuste `APP_URL`, `CORS_ORIGINS` e a URL do webhook no Stripe.
