# Modelo de domínio

## Entidades principais

| Entidade | Contexto | Descrição | Invariantes principais |
|---|---|---|---|
| **Tenant** | tenancy | empresa cliente | slug único; CNPJ com dígitos verificadores válidos; empresa suspensa não autentica |
| **User** | identity | pessoa com acesso | e-mail único e normalizado; não altera o próprio papel nem se desativa; a empresa mantém ≥ 1 proprietário ativo |
| **RefreshSession** | identity | sessão de login (família de refresh tokens) | token guardado só como hash; rotação a cada uso; reuso revoga a família |
| **Plan** | billing | oferta comercial e seus limites | `-1` = ilimitado |
| **Subscription** | billing | contrato da empresa com um plano | uma por empresa; transições validadas (ver [stripe.md](stripe.md)) |
| **BillingEvent** | billing | evento de cobrança já aplicado | chave = id do evento Stripe (idempotência) |
| **Analysis** | inspection | uma imagem submetida a um serviço de visão | `QUEUED → PROCESSING → COMPLETED/FAILED`; estado final imutável; resultado precisa corresponder à análise |
| **AuditLog** | audit | registro de ação relevante | sem FKs, sobrevive a mudanças nas entidades |

Value objects / políticas: `Role` + matriz de permissões, `PlanLimitsPolicy`, política de senha, validação de imagem por *magic bytes*, catálogo `VisionService`.

## Diagrama ER

```mermaid
erDiagram
    tenants ||--o{ users : "tem"
    tenants ||--o| subscriptions : "assina"
    plans ||--o{ subscriptions : "define limites de"
    tenants ||--o{ analyses : "possui"
    users ||--o{ analyses : "solicita"
    users ||--o{ refresh_sessions : "mantém"

    tenants {
        uuid id PK
        text name
        text slug UK
        text document "CNPJ"
        text segment
        enum status "ACTIVE | SUSPENDED"
        text stripeCustomerId UK
        bigint storageBytesUsed
    }
    users {
        uuid id PK
        uuid tenantId FK
        text email UK
        text name
        text passwordHash
        enum role "PLATFORM_ADMIN | OWNER | ADMIN | OPERATOR | VIEWER"
        enum status "ACTIVE | INACTIVE"
        timestamp lastLoginAt
    }
    refresh_sessions {
        uuid id PK
        uuid userId FK
        uuid familyId
        text tokenHash UK
        text userAgent
        text ip
        timestamp expiresAt
        timestamp revokedAt
    }
    plans {
        uuid id PK
        text code UK
        text name
        int priceCents
        text stripePriceId
        int maxUsers
        int maxAnalysesPerMonth
        int maxStorageMb
        enum_array services
    }
    subscriptions {
        uuid id PK
        uuid tenantId FK,UK
        uuid planId FK
        enum status "TRIALING | ACTIVE | PAST_DUE | CANCELED | EXPIRED"
        timestamp trialEndsAt
        timestamp currentPeriodEnd
        bool cancelAtPeriodEnd
        timestamp pastDueSince
        text stripeSubscriptionId UK
    }
    analyses {
        uuid id PK
        uuid tenantId FK
        uuid requestedById FK
        enum service "QUALITY_DEFECT | PPE_COMPLIANCE | OBJECT_COUNT"
        enum status "QUEUED | PROCESSING | COMPLETED | FAILED"
        text imageKey
        int attempts
        enum verdict "PASS | FAIL | INFO"
        text headline
        jsonb result
        text failureReason
    }
    billing_events {
        text id PK "evt_..."
        uuid tenantId
        text type
        jsonb payload
    }
    audit_logs {
        uuid id PK
        uuid tenantId
        uuid actorId
        text action
        text entityType
        text entityId
        jsonb metadata
        text ip
    }
```

Schema completo: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma). Migrations versionadas em `apps/api/prisma/migrations`.

## Papéis e permissões

| Permissão | Proprietário | Administrador | Operador/Inspetor | Leitura | Admin da plataforma |
|---|:-:|:-:|:-:|:-:|:-:|
| Ver painel, análises, plano | ✔ | ✔ | ✔ | ✔ | ✔ |
| Enviar e reprocessar análises | ✔ | ✔ | ✔ | | ✔ |
| Ver e gerenciar usuários | ✔ | ✔ | | | ✔ |
| Editar dados da empresa | ✔ | ✔ | | | ✔ |
| Ver auditoria | ✔ | ✔ | | | ✔ |
| Assinar plano, portal de cobrança | ✔ | | | | ✔ |
| Gerenciar empresas e ver cobrança da plataforma | | | | | ✔ |

Regras adicionais (no domínio, `identity/domain/role.ts` e `user.ts`):

- Só se atribui papel **abaixo** do próprio — exceto o proprietário, que pode promover outro proprietário.
- Administrador não gerencia proprietários nem outros administradores.
- Ninguém altera o próprio papel nem desativa a própria conta.
- `PLATFORM_ADMIN` nunca é atribuído pela API de empresas.
- Desativar usuário ou trocar senha **encerra todas as sessões** dele.

A API é a fonte da verdade (guard global + `@RequirePermissions`); o frontend apenas esconde o que não se aplica.
