#!/bin/bash
# SessionStart: instala as dependências para lint, typecheck, testes e build
# funcionarem em sessões do Claude Code na web. Só roda no ambiente remoto.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# `npm install --no-save` (e não `npm ci`) de propósito: reaproveita o node_modules que o
# estado do contêiner guarda entre sessões, é idempotente e não reescreve o package-lock.json.
npm install --no-save --no-audit --no-fund --loglevel=error
