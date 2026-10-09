# painel-saude — Registro de correções

Uma entrada curta por bug corrigido (versão, data, sintoma, causa, correção, teste).
O `docs/PRODUCT.md` descreve o comportamento atual.

| Versão | Data | Sintoma | Causa | Correção | Teste |
|---|---|---|---|---|---|
| 0.2.2 | 09/10/2026 | Relatório da cardiologista escrevia "pulso null" nas medições sem pulso | Pulso é opcional (registro-pa) e era interpolado direto no texto | `pulseSuffix` (`src/lib/bloodPressure.js`) omite o trecho sem pulso | `bloodPressure.test.js` |
| 0.2.1 | 08/10/2026 | App podia ficar em "Carregando…" para sempre se a leitura da sessão falhasse; erro de carga do painel sem como tentar de novo | `getSession()` sem `catch`; tela de erro sem ação | Falha vira "deslogado" (tela de login); botão "Tentar de novo" no painel | — (comportamento de tela; sem teste de componente neste app) |
| 0.2.0 | 08/10/2026 | Falhas do `strava-callback` eram silenciosas; `strava-sync` devolvia `error.message` ao chamador | Sem `console.error`; erro técnico na resposta | Log no servidor e mensagem genérica na resposta (funções redeployadas) | — |
