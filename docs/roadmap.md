# Roadmap

## Entregue (fundação)

- Monorepo com Next.js, NestJS, Prisma/PostgreSQL, worker Go, serviço Python, Docker Compose.
- Autenticação JWT + refresh rotativo, sessões, RBAC, multiempresa.
- Planos, trial, assinaturas, limites, Stripe test mode com webhooks via worker.
- Fila Redis Streams com retry, DLQ, reassunção e jobs periódicos.
- Três serviços de visão (qualidade, EPI, contagem) com backend YOLO plugável e fallback OpenCV.
- Auditoria, painel administrativo, dashboard, landing com sobrevoo 3D.
- Testes unitários, de integração, de fila, de visão e E2E; CI com proteção de branch; deploy semi-automático.

## Próximos incrementos

| Prioridade | Incremento | Valor |
|---|---|---|
| 1 | **Ordens de serviço e manutenção** — abrir OS a partir de uma não conformidade, responsável, prazo, status | fecha o ciclo "detectou → corrigiu" |
| 1 | **Registro de não conformidades** com causa, ação corretiva e evidência (imagem da análise) | auditoria ISO 9001 / NR |
| 1 | **Notificações** (e-mail e WhatsApp) para achados críticos, entregues pelo worker | reação em minutos |
| 2 | **Leitura de etiquetas** (4º serviço): OCR (PaddleOCR/Tesseract) + códigos de barras e QR (ZXing/pyzbar) | rastreabilidade de lote |
| 2 | **Câmeras IP (RTSP)**: captura agendada por ponto de inspeção, com recorte de região de interesse | inspeção contínua sem operador |
| 2 | **Inspeções de qualidade por lote** com plano de amostragem e relatório PDF | substitui planilha |
| 2 | **Convite por e-mail** e redefinição de senha | onboarding sem compartilhar senha |
| 3 | **Treino por cliente**: rotular achados na própria tela (confirmar/corrigir) e retreinar o YOLO com esses dados | modelos melhores a cada mês |
| 3 | **Múltiplas plantas/linhas** por empresa, com indicadores por linha | clientes maiores |
| 3 | **Métricas e tracing** (OpenTelemetry), alertas da DLQ | operação |
| 3 | **Eventos de domínio** com outbox transacional (substitui a transação entre contextos no cadastro) | desacoplamento |
| 3 | **SSO** (Google/Microsoft) e 2FA | segurança corporativa |
