# Instruções de projeto — painel-saude

Convenções trazidas do Bora Viajar e do Forja (projetos irmãos), adaptadas ao
que este app tem: painel **somente leitura** (React + Vite + Supabase) sobre os
dados do Forja e do registro-pa, mais a integração Strava (3 Edge Functions).

**Este repositório é público**: nada de URL de projeto com chave, token, segredo
ou dado pessoal de saúde em código, exemplos, testes ou histórico. Conferir com
grep antes de todo push.

- **PRD em `docs/PRODUCT.md`**: toda correção ou melhoria atualiza a seção
  relevante (comportamento atual) e o histórico no fim. Não pular em mudança pequena.
- **Toda correção ou melhoria sobe a versão em `package.json`** (semver: `patch`
  correção, `minor` funcionalidade nova, `major` só se combinado).
- **Nunca commitar segredos.** `.env.local` é o único lugar para chaves reais
  (no `.gitignore`). Chave paga/secreta de terceiro (Strava etc.) é sempre
  secret de Edge Function (`Deno.env.get`), nunca `VITE_*`.
- **Deploy**: Vercel, automático a cada push em `main`. Variável `VITE_*` nova
  precisa ser adicionada à mão no Vercel — avisar o usuário.
  **Autorização permanente para mergear em `main`** (dada pelo usuário em
  08/10/2026): ele não é de engenharia e delega a gestão de branch/PR. Depois
  de implementar numa branch `claude/*`, abrir PR, esperar o CI ficar verde e
  mergear sem perguntar; avisar o usuário ao final, em linguagem simples, e
  lembrar de qualquer passo manual (variável no Vercel, SQL no Supabase,
  redeploy de Edge Function).
- **Validar antes de empurrar**: `npm run lint && npm run typecheck && npm test
  && npm run build`. As mesmas quatro rodam no GitHub Actions
  (`.github/workflows/ci.yml`) em todo push e PR. Dependabot avisa semanalmente
  (PR próprio, nada aplicado sozinho).
- **Testes** (Vitest): regra de negócio em `src/lib/` ganha teste `*.test.js` ao
  lado. Função de data roda em 4 fusos (`describe.each` com `process.env.TZ`, ver
  `dates.test.js`). Data "YYYY-MM-DD" sempre via `isoOf`/`todayStr` de
  `src/lib/dates.js`, **nunca** `toISOString().slice(0, 10)`.
- **TypeScript em modo checagem** (`npm run typecheck`): `checkJs` só em
  `src/lib/**/*.js`; baseline zerado; ambiguidade vira JSDoc, nunca `@ts-ignore`.
- **Banco**: RLS sempre ligada. **Toda tabela nova precisa de `grant` explícito**
  na mesma migration em `supabase/sql/` (`authenticated` só se o cliente acessa
  direto; `service_role` sempre) — senão "permission denied" a partir de
  30/out/2026. Tabela com segredo não recebe grant para o cliente.
- **Edge Functions**: erro nunca devolve `String(err)`/`error.message` ao cliente;
  `console.error` do detalhe no servidor e mensagem curta em português na
  resposta. Função que recebe URL do corpo da requisição valida o domínio antes
  do `fetch` (SSRF). Cada função é deployada isolada (colada no editor do
  Supabase), por isso o código de `state` fica duplicado de propósito.
- **Tela com carregamento assíncrono**: `try/catch` + estado de erro com "Tentar
  de novo"; nunca `loading` preso em `true`.
- **Padrões — não reinventar**: datas e formatação em `src/lib/dates.js`;
  classificação de pressão em `src/lib/bloodPressure.js` (mesma regra do
  registro-pa); agregação semanal em `src/lib/aggregations.js`; sessão em
  `src/lib/auth.js`. Antes de criar um helper, `grep` por algo equivalente.
  Componente passando de ~600-700 linhas: extrair na mesma tarefa.
  - **Valor ausente na tela** (pulso, peso, distância, temperatura — qualquer
    campo opcional ou que pode vir `null` do banco/API): nunca interpolar direto
    no texto nem `Math.round(x)`/`Number(x)`/`|| 0` — vira "null" ou um "0"
    plausível e falso. Usar um helper que omita o trecho ou mostre "—" (ex.:
    `pulseSuffix` em `src/lib/bloodPressure.js`); zero legítimo continua aparecendo.

- **Revisor de qualidade** (`.claude/agents/revisor-qualidade.md`, somente
  leitura): obrigatório antes de todo merge — rodar o agente sobre o diff,
  tratar o que ele apontar (ou dizer por que não) e citar o resultado ao
  usuário. As regras continuam só aqui; o agente aponta pra elas, não as copia.
  **Trava automática** (`.claude/settings.json` + `.claude/hooks/`): um hook
  nega `mcp__github__merge_pull_request` e `git push` na `main` se o revisor
  não rodou na sessão na última hora (`registrar-revisor.sh` anota a
  execução, `exigir-revisor.sh` confere). Se a trava negar, rode o revisor e
  repita; não tente contornar o hook. Quem desliga é o usuário, em `/hooks`.
  **Limite conhecido**: o hook só é carregado quando este repositório é o
  principal da sessão — numa sessão com outro repositório como principal e
  este anexado via `add_repo` (ex.: trabalho entre os apps irmãos), nem o
  hook nem o agente ficam disponíveis; a revisão então precisa ser feita à
  mão, lendo o diff contra este checklist antes de mergear.

- **Disseminar toda boa prática nova para os apps irmãos** (regra do usuário,
  08/10/2026): os apps do Marcos compartilham as mesmas práticas e **nenhuma
  melhoria fica só em um app**. Apps irmãos (repositórios `marcoscpc/…`):
  `roteiro` (Bora Viajar, o mais completo — referência), `App-Forja`,
  `registro-pa`, `painel-saude` (público: cuidado extra com segredos) e
  `bora-dividir`. Sempre que, numa tarefa, nascer ou mudar uma prática
  (regra no `CLAUDE.md`, ferramenta de qualidade/CI/teste, padrão de segurança,
  achado de varredura que virou regra), **na mesma sessão**:
  1. Avaliar se se aplica a cada irmão (ex.: regra de Edge Function só vale
     onde há Edge Function; teste de componente só onde há React).
  2. Aplicar nos que se aplicam (adaptando ao que cada app tem), numa branch
     `claude/*` por app, com PR e CI verde, e mergear conforme a autorização
     permanente de cada `CLAUDE.md`. Para repositórios que a sessão ainda não
     tem, usar `list_repos` + `add_repo`.
  3. Registrar a prática em `docs/BOAS-PRATICAS.md` do `roteiro` (tabela
     "prática × app", com o status de cada um) — é a fonte única de consulta.
  4. Ao fim, dizer ao usuário em linguagem simples onde foi aplicado e onde
     não se aplica (e por quê). Se não der para propagar na sessão, listar a
     pendência explicitamente em vez de deixar passar.
  **No início de toda sessão de trabalho**, conferir rapidamente o
  `docs/BOAS-PRATICAS.md` do `roteiro` contra este app e avisar se houver
  lacuna aberta.
