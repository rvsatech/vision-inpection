#!/usr/bin/env bash
# Protege a branch main: PR obrigatório e checks do CI precisam passar antes do merge.
# Requer GitHub CLI autenticado com permissão de admin no repositório.
#   ./scripts/setup-branch-protection.sh owner/repo
set -euo pipefail
REPO="${1:?uso: $0 owner/repo}"
BRANCH="${2:-main}"

gh api -X PUT "repos/${REPO}/branches/${BRANCH}/protection" \
  -H "Accept: application/vnd.github+json" \
  --input - <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "API (NestJS)",
      "Web (Next.js)",
      "Worker (Go)",
      "Visão (Python)",
      "Build das imagens Docker",
      "E2E (Playwright)"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "dismiss_stale_reviews": true },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
echo "Proteção aplicada em ${REPO}@${BRANCH}."
