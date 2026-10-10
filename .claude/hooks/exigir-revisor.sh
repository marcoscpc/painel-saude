#!/usr/bin/env bash
# PreToolUse (Bash e merge de PR): barra o merge/deploy se o agente
# revisor-qualidade não rodou nesta sessão na última hora.
# Vale para: mcp__github__merge_pull_request e `git push` na branch de deploy.
command -v jq >/dev/null 2>&1 || exit 0   # sem jq não dá para decidir: não bloqueia
JANELA=3600                               # segundos de validade da revisão
BRANCH_DEPLOY="main"

input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
alvo=""

case "$tool" in
  mcp__github__merge_pull_request)
    alvo=$(printf '%s' "$input" | jq -r '"o merge do PR #\(.tool_input.pullNumber) de \(.tool_input.owner)/\(.tool_input.repo)"')
    ;;
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
    # `git push` (inclusive `git -C dir push`) que cita a branch de deploy como palavra inteira,
    # ou qualquer `git push` feito com a branch de deploy já em uso.
    if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push([[:space:]]|$)'; then
      atual=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
      if printf '%s' "$cmd" | grep -Eq "${BRANCH_DEPLOY}([^A-Za-z0-9_-]|\$)" || [ "$atual" = "$BRANCH_DEPLOY" ]; then
        alvo="o push na branch de deploy (${BRANCH_DEPLOY})"
      fi
    # merge de PR pela CLI do GitHub
    elif printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)'; then
      alvo="o merge de PR pela CLI (gh pr merge)"
    fi
    ;;
esac

[ -n "$alvo" ] || exit 0

sid=$(printf '%s' "$input" | jq -r '.session_id // "sem-sessao"' | tr -cd 'A-Za-z0-9_-')
marca="${TMPDIR:-/tmp}/claude-revisor/${sid:-sem-sessao}"
if [ -f "$marca" ]; then
  idade=$(( $(date +%s) - $(cat "$marca" 2>/dev/null || echo 0) ))
  [ "$idade" -le "$JANELA" ] && exit 0
fi

motivo="Bloqueado: ${alvo} exige a revisão do agente revisor-qualidade nesta sessão (última hora), conforme o CLAUDE.md. Rode o revisor sobre o diff (Agent, subagent_type revisor-qualidade), trate o que ele apontar e repita a ação."
jq -n --arg r "$motivo" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 0
