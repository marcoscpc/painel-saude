#!/usr/bin/env bash
# PostToolUse (Agent): registra que o revisor-qualidade rodou nesta sessão.
# O hook exigir-revisor.sh consulta esse registro antes de um merge/deploy.
command -v jq >/dev/null 2>&1 || exit 0
input=$(cat)
agente=$(printf '%s' "$input" | jq -r '.tool_input.subagent_type // empty')
[ "$agente" = "revisor-qualidade" ] || exit 0
sid=$(printf '%s' "$input" | jq -r '.session_id // "sem-sessao"' | tr -cd 'A-Za-z0-9_-')
dir="${TMPDIR:-/tmp}/claude-revisor"
mkdir -p "$dir" && date +%s > "$dir/${sid:-sem-sessao}"
exit 0
