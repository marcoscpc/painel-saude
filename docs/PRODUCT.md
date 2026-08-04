# Painel-Saúde — Documento de Produto

**Versão:** 1.1 · **Data:** 04/08/2026 · **Autor:** Marcos (produto) com apoio de Claude (desenvolvimento)
**Repositório:** github.com/marcoscpc/painel-saude · **Deploy:** Vercel (produção: `painel-saude-six.vercel.app`, automático a cada push em `main`)

---

## 1. Sumário executivo

Painel-Saúde é o terceiro app da família de projetos pessoais de saúde de Marcos, ao lado do [Forja](../../app-forja/docs/PRODUCT.md) (treino, peso, medidas) e do `registro-pa` (pressão arterial). Diferente dos outros dois, ele **não registra nada** — é um painel de **leitura**, que junta os dados que os outros dois apps já enviam para a nuvem (Supabase) e mostra tudo num só lugar: pressão arterial, peso corporal e frequência de treino, cruzados na mesma linha do tempo.

Existe por um motivo direto: hoje, para ver o quadro completo de saúde, Marcos e a esposa (52 anos) precisam abrir dois apps separados. O Painel-Saúde junta isso, e ainda gera relatórios prontos para levar à fisioterapeuta e à cardiologista.

Não é um produto comercial. É a Fase D de um plano maior (ver §12 do documento de produto do Forja), construído sobre a base de sincronização já validada nas Fases A, B e C.

---

## 2. Contexto e motivação

Forja e registro-pa nasceram como apps independentes, cada um resolvendo um problema específico (registrar treino; registrar pressão). Os dois guardam dado localmente no aparelho (`localStorage`) e, desde 01/08/2026, cada um **também** envia uma cópia para um banco compartilhado no Supabase quando o usuário conecta um e-mail — sem isso mudar o funcionamento local de nenhum dos dois.

Essa sincronização não existe por si só: ela alimenta este painel. Sem o Painel-Saúde, o dado que chega na nuvem não tem para onde ir — fica só armazenado. Este app é o motivo de a sincronização existir.

A motivação de fundo (discutida em 01/08/2026): tratar a saúde física do casal como algo a acompanhar por ~20 anos, com dado histórico consultável e relatórios prontos para os especialistas que já acompanham os dois (fisioterapeuta e cardiologista).

---

## 3. Público-alvo

| Persona | Descrição |
|---|---|
| **Marcos** | Usuário principal. Conecta o mesmo e-mail que já usa no Forja e no registro-pa para ver seu próprio painel. |
| **Esposa** | Segunda usuária, com seu próprio e-mail/login — vê só o próprio painel (nunca o de Marcos, e vice-versa). |
| **Fisioterapeuta** (indireta) | Não usa o app. Recebe um relatório (peso, medidas, frequência de treino) gerado e compartilhado por Marcos ou pela esposa. |
| **Cardiologista** (indireta) | Não usa o app. Recebe um relatório (pressão arterial + peso) gerado e compartilhado por Marcos ou pela esposa. |

Não há cadastro público, não há plano de terceiros usarem o app — é estritamente para as duas pessoas que já usam Forja e registro-pa.

---

## 4. Proposta de valor

- **Um só lugar para ver o quadro completo** — pressão, peso e frequência de treino na mesma linha do tempo, em vez de dois apps separados.
- **Cruzamento de tendências** — dá para notar, por exemplo, se a pressão sobe em períodos de menos treino, algo que nenhum dos dois apps sozinho mostra.
- **Relatório pronto por especialista** — a fisioterapeuta recebe o que interessa a ela (peso, medidas, frequência); a cardiologista recebe o que interessa a ela (pressão, peso) — sem montar isso na mão toda vez.
- **Atalhos diretos** — links para abrir o Forja ou o registro-pa quando o usuário quiser registrar algo novo (o Painel-Saúde não registra nada, só mostra).
- **Não muda nada nos outros dois apps** — quem não conecta e-mail no Forja ou no registro-pa nunca aparece aqui; a sincronização continua 100% opcional nos dois.

---

## 5. Arquitetura técnica

| Camada | Escolha | Observação |
|---|---|---|
| Front-end | React 18 + Vite 5 | Mesmo padrão do Forja — facilita montar os gráficos combinados e as telas de relatório. |
| Gráficos | A definir na implementação (ex.: biblioteca de charts React) | Precisa sobrepor 3 séries (pressão, peso, frequência de treino) na mesma linha do tempo. |
| Formato do app | Página web comum, **não é PWA** | Diferente do Forja e do registro-pa: uso esperado é consultar de vez em quando (não o dia todo com o celular na mão), então não precisa de ícone na tela inicial nem de funcionar offline. |
| Dados | Supabase (Postgres + Auth), **somente leitura nas tabelas** | Painel-Saúde nunca escreve direto nas tabelas — só lê o que Forja e registro-pa já enviaram. Mesmo projeto Supabase dos outros dois apps (schema criado na Fase A). Única exceção, desde 04/08/2026: o botão "Conectar com Strava" (ver §6 e §9), que aciona uma Edge Function — o app em si continua sem gravar nada. |
| Autenticação | Login por link mágico (e-mail, sem senha) | Mesmo padrão já usado no Forja e no registro-pa. Cada usuário só enxerga os próprios dados (Row Level Security, já configurado na Fase A). |
| Hospedagem | Vercel | Deploy automático a cada `git push` em `main`, mesmo padrão dos outros dois projetos. |
| Repositório | `github.com/marcoscpc/painel-saude` | Projeto irmão de `App-Forja` e `registro-pa`, mesma conta. |

**Por que somente leitura:** simplifica bastante o app — não precisa lidar com conflitos de escrita, validação de entrada nem duplicar as regras de negócio que já existem no Forja e no registro-pa. Qualquer correção de dado é feita no app de origem.

---

## 6. Modelo de dados

O Painel-Saúde não tem modelo de dados próprio — ele só **lê** as tabelas do Supabase já criadas na Fase A e alimentadas pelas Fases B e C, todas isoladas por usuário (RLS por `user_id` = usuário logado):

| Tabela | Alimentada por | Campos relevantes |
|---|---|---|
| `bp_readings` | registro-pa | `ts`, `sys`, `dia`, `pul`, `ctx`, `deleted_at` |
| `body_weight` | Forja | `date`, `kg` |
| `body_measurements` | Forja | `date`, `quadril`, `cintura`, `busto`, `abaixo_busto`, `braco_esq`, `braco_dir` |
| `workout_sessions` | Forja | `date`, `ficha_id`, `ficha_name`, `exercise_count`, `done` |
| `workout_exercises` | Forja | Detalhe por exercício de cada sessão concluída: `date`, `ficha_name`, `exercise_name`, `top_kg` (exercícios com peso), `top_duration_secs` (exercícios de tempo, ex.: prancha), `top_reps` (exercícios só de repetições, sem peso, ex.: flexão de braço — desde 03/08/2026), `sets_count`, `notes`. Cada linha só preenche **um** dos três campos de valor (`top_kg`/`top_duration_secs`/`top_reps`), conforme o tipo do exercício no Forja — os outros dois ficam `null` |
| `profiles` | Forja | `birth_date`, `height_cm` (usados para dar contexto no relatório, ex. idade) |

Observação importante: **o dado só existe aqui a partir do momento em que a sincronização foi ligada** em cada app (01/08/2026 em diante) — com uma exceção: do lado do Forja, quem conecta um e-mail depois de já ter usado o app pode enviar o histórico local completo de uma vez (botão "Enviar histórico completo" em Configurações → Sincronização, ver `app-forja/docs/PRODUCT.md` §12), então histórico anterior a essa data também pode aparecer aqui, se essa pessoa já tiver feito isso. Sem esse envio manual, ainda não há como recuperar dado anterior à sincronização — ver §12.

**Cardio (Strava), desde 04/08/2026 — em construção, ver §12:** duas tabelas novas alimentam essa frente, ainda não lidas pelo painel (isso é a Fase 4): `activities` (corridas/caminhadas trazidas do Strava — `type`, `start_date`, `distance_m`, `moving_time_s`, `average_heartrate`, `max_heartrate`, `average_speed`) e `strava_tokens` (token OAuth por usuário — **sem nenhuma política de leitura liberada pro cliente**, nem pro dono da linha; só uma Edge Function com privilégio de servidor consegue ler/escrever ali, e uma função `strava_connection_status()` expõe só "conectado ou não + desde quando" pro painel, sem nunca passar o token pelo navegador).

---

## 7. Funcionalidades por área

### 7.1 Login

- Tela única de entrada: campo de e-mail, checkbox **"Manter-me conectado por 15 dias"** e botão "enviar link mágico" — mesmo fluxo já usado no Forja e no registro-pa. Sempre foi obrigatório entrar antes de ver qualquer dado (nunca existiu modo "sem login" aqui, diferente dos outros dois apps) — o que mudou em 04/08/2026 foi só o controle de por quanto tempo a sessão fica válida sem pedir login de novo.
- Checkbox marcada: sessão válida por 15 dias sem pedir login de novo; desmarcada: cerca de 1 dia. Prazo controlado pelo próprio app (independente da validade do token do Supabase em si, que sozinho duraria bem mais).
- Link mágico expirado ou já usado mostra um aviso claro na tela de login, em vez de falhar em silêncio.
- Ao logar, o painel mostra os dados do usuário logado (Marcos ou esposa, conforme o e-mail) — cada um no próprio celular, sem conceito de perfil compartilhado (nunca existiu aqui).

### 7.2 Painel combinado (tela principal)

- Gráfico único cruzando, na mesma linha do tempo: pressão arterial (sistólica/diastólica), peso corporal e frequência de treino (treinos concluídos por semana).
- Filtro por período (ex.: 30 / 90 / 365 dias — mesma lógica de filtro de período já usada no Insights do Forja).
- Indicação visual clara de lacunas (períodos sem sincronização ligada ou sem registro).

### 7.3 Relatório por especialista

- **Relatório para fisioterapeuta**: peso, medidas corporais e frequência/volume de treino no período escolhido.
- **Relatório para cardiologista**: pressão arterial (com a classificação já usada no registro-pa) e peso no período escolhido.
- Filtro de data inicial/final, com opção de compartilhar (menu nativo de compartilhamento do celular, ou cópia de texto/link) — mesmo padrão do relatório de peso e medidas já existente no Forja.

### 7.4 Atalhos

- Botões diretos para abrir o Forja (`forja-five.vercel.app`) e o registro-pa (`registro-pa.vercel.app`) em outra aba, para quando o usuário quiser registrar algo novo.

---

## 8. Jornada principal de uso

1. Marcos (ou a esposa) abre o link do Painel-Saúde no navegador — não precisa instalar nada.
2. Faz login com o mesmo e-mail já conectado no Forja e no registro-pa (link mágico).
3. Vê o gráfico combinado do período recente — pressão, peso e frequência de treino juntos.
4. Antes de uma consulta, entra na tela de Relatório, escolhe o período e gera o relatório da fisioterapeuta ou da cardiologista.
5. Compartilha o relatório (WhatsApp, e-mail, etc.) direto do celular.
6. Se quiser registrar um treino ou uma medição nova, usa os atalhos para abrir o Forja ou o registro-pa.

---

## 9. Decisões de produto notáveis

- **Somente leitura, sem edição**: o Painel-Saúde não duplica as regras de registro/validação do Forja e do registro-pa — qualquer correção é feita no app de origem. Mantém o painel simples e evita dado divergente entre apps.
- **Não é PWA**: ao contrário dos outros dois, o uso esperado é esporádico (revisar tendência, gerar relatório antes de uma consulta) — não precisa de ícone na tela inicial nem de funcionar offline.
- **Relatório por especialista já na Fase D**: decidido em 02/08/2026 incluir os relatórios (fisio/cardiologista) já nesta fase, junto com o gráfico combinado, em vez de deixar para depois — é a parte que mais interessa ao uso real com os especialistas.
- **Mesmo projeto Supabase, mesma autenticação**: reaproveita integralmente o que já foi validado nas Fases A-C, sem criar um sistema de login/dado paralelo.
- **Exceção deliberada ao "somente leitura", 04/08/2026**: o botão "Conectar com Strava" (aba Atalhos) é a primeira ação que o Painel-Saúde dispara. Decidido morar aqui (e não no Forja, nem como link avulso) porque é aqui que o cardio vai aparecer depois de sincronizado. O app continua sem gravar em nenhuma tabela diretamente — quem grava é uma Edge Function no Supabase, que troca o código do Strava por um token e nunca devolve esse token pro navegador.

---

## 10. Limitações e riscos conhecidos

- **Depende dos outros dois apps terem sincronização ligada**: sem e-mail conectado no Forja e no registro-pa, não há dado nenhum para mostrar aqui.
- **Sem histórico anterior à sincronização** (antes de 01/08/2026), a menos que a pessoa tenha usado o envio manual "Enviar histórico completo" do Forja (ver §6) — o registro-pa ainda não tem um recurso equivalente.
- **Sem edição/correção de dado**: erro de registro precisa ser corrigido no app de origem (Forja ou registro-pa), não aqui.
- **Sem modo offline**: precisa de internet para logar e carregar os dados (coerente com a decisão de não ser PWA).
- **Sem testes automatizados**: mesmo padrão dos outros dois projetos pessoais — validação é manual, feita por Marcos após o deploy.

---

## 11. Histórico de evolução

| Data | Entrega |
|---|---|
| 02/08/2026 | Documento de produto elaborado e, no mesmo dia, Fase D implementada e publicada em produção: scaffold React + Vite, login por link mágico, painel combinado, relatórios por especialista (fisioterapeuta e cardiologista) e atalhos pros outros dois apps (`painel-saude-six.vercel.app`) |
| 02/08/2026 | Relatórios por especialista passam a listar cada registro do período dia a dia, em vez de um resumo condensado |
| 02/08/2026 | Relatório da fisioterapeuta passa a listar os exercícios feitos no período e a progressão de carga, lendo a nova tabela `workout_exercises` |
| 02/08/2026 | Gráfico combinado do Painel substituído por um gráfico por métrica, com escala real — pressão, peso e frequência de treino ficam mais fáceis de ler separadamente (antes eram séries normalizadas sobrepostas) |
| 02/08/2026 | Relatório de fisioterapia reorganizado em seções claras (Resumo, Progressão de carga, Peso e medidas por data, Exercícios por sessão), em vez de blocos soltos |
| 02/08/2026 | Eixos adicionados aos gráficos do Painel: linhas de grade com valores no eixo Y e datas no eixo X, em vez de só o máximo/mínimo soltos |
| 02/08/2026 | Chips de período (30/90/365 dias) substituídos por campos de data inicial e final no Painel, mesmo padrão já usado em Relatórios |
| 02/08/2026 | Relatório de cardiologia reformulado: separa medições por manhã/noite (mesma lógica MRPA do registro-pa), destaca os picos do período e alerta quando há medição em HAS estágio 2 ou 3 |
| 02/08/2026 | Relatório da fisio ganha seção "Pontos de atenção" (platô de carga e exercício parado, mesma regra do Forja) e "Observações registradas" (notas por série sincronizadas) |
| 03/08/2026 | Seção "Picos do período" removida do relatório de cardiologia |
| 03/08/2026 | Relatório de fisioterapia passa a reconhecer exercícios do tipo "Repetições (sem peso)" (novo no Forja): progressão e alerta de platô agora comparam repetições quando não há peso nem duração registrados, usando a nova coluna `top_reps` de `workout_exercises`. Corrige também um bug latente em que exercícios sem nenhum dos três valores comparáveis geravam um alerta de platô falso ("mesma carga (0s)"). |
| 04/08/2026 | Tela de login ganha checkbox "Manter-me conectado por 15 dias" — controla por quanto tempo a sessão evita pedir login de novo (15 dias marcada, ~1 dia sem marcar), com prazo próprio do app independente da validade do token do Supabase. Link mágico expirado/já usado agora mostra aviso na tela em vez de falhar em silêncio (mesma correção aplicada no Forja e no registro-pa no mesmo dia) |
| 04/08/2026 | Início da integração com Strava (cardio) — ver §12. Fase 1: tabelas `activities` e `strava_tokens` criadas no Supabase. Fase 2: aba Atalhos ganha card "Cardio (Strava)" com botão "Conectar com Strava" — fluxo OAuth completo via duas Edge Functions (`strava-connect`, `strava-callback`), testado ponta a ponta com a conta de Marcos (conectar, gravar token, ver status "Conectado"). Fase 3: Edge Function `strava-sync` agendada via `pg_cron` pra rodar 1x/dia, testada manualmente (7 atividades trazidas, sem duplicar num segundo disparo). Cardio ainda não aparece no gráfico nem nos relatórios (Fase 4) |

---

## 12. Roadmap

- ✅ **Fase D** — app criado: login por link mágico, painel combinado e relatórios por especialista (fisioterapeuta e cardiologista), conforme descrito acima. Implementada e publicada em produção em 02/08/2026 (`painel-saude-six.vercel.app`), e refinada com vários ajustes de relatório e gráfico nos dias seguintes (ver §11).
- ✅ Envio do histórico já registrado antes da sincronização existir — resolvido do lado do Forja, com o botão manual "Enviar histórico completo" em Configurações → Sincronização (ver `app-forja/docs/PRODUCT.md` §12). Assim que esse histórico chega no Supabase, aparece aqui automaticamente, sem trabalho adicional no Painel-Saúde. O registro-pa ainda não tem um recurso equivalente, então o histórico de pressão anterior à sincronização continua indisponível.
- ⏳ **Fase E (depois)** — fila de reenvio automática para quando a sincronização falhar por estar offline no momento do registro (hoje, se isso acontecer, o registro específico não é reenviado depois). Depende de mudança nos apps de origem (Forja e registro-pa), não no Painel-Saúde.
- **Integração com Strava (cardio)** — traz corrida/caminhada do Strava pro painel, junto da musculação (que já vem do Forja). Plano em 5 fases:
  - ✅ Fase 1 (04/08/2026) — tabelas `activities` e `strava_tokens` no Supabase, isoladas por usuário.
  - ✅ Fase 2 (04/08/2026) — conexão OAuth ponta a ponta pra um usuário (Marcos): botão "Conectar com Strava" na aba Atalhos, Edge Functions `strava-connect`/`strava-callback`, token gravado e status "Conectado" confirmado na conta real.
  - ✅ Fase 3 (04/08/2026) — Edge Function `strava-sync` (renova token quando precisa, busca só atividades novas desde a última sincronizada, upsert idempotente). Agendada via `pg_cron`/`pg_net` pra rodar 1x por dia (06:00 UTC). Testada manualmente: 7 atividades trazidas (corridas e caminhadas, com frequência cardíaca na maioria) e confirmado que rodar de novo não duplica.
  - ⏳ Fase 4 — cardio entra no gráfico combinado do Painel e no relatório da cardiologista (frequência cardíaca é o dado mais relevante ali).
  - ⏳ Fase 5 — segunda conexão OAuth (esposa), mapeada ao usuário dela.

---

## 13. Métricas de sucesso (informais)

Como projeto pessoal, sucesso aqui significa:

- O painel realmente ser consultado antes das consultas com fisio/cardiologista (em vez de montar o relatório na mão como hoje).
- O gráfico combinado revelar alguma correlação útil entre treino, peso e pressão ao longo do tempo.
- Nenhum atrito extra nos apps de origem (Forja e registro-pa) por causa deste painel — a sincronização continua opcional e invisível para quem não usa.

---

*Documento de produto elaborado antes da primeira linha de código do Painel-Saúde, como ponto de partida da Fase D do plano descrito em `app-forja/docs/PRODUCT.md` §12. Atualizado em 03/08/2026 a partir do estado real do código-fonte (`src/App.jsx`) e do histórico de commits do repositório `painel-saude`, já com a Fase D implantada em produção.*
