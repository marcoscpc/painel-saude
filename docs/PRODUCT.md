# Painel-Saúde — Documento de Produto

**Versão:** 0.1 (rascunho — Fase D ainda não implementada) · **Data:** 02/08/2026 · **Autor:** Marcos (produto) com apoio de Claude (desenvolvimento)
**Repositório:** a criar · **Deploy:** Vercel (planejado, mesmo padrão de `app-forja` e `registro-pa`)

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
| Dados | Supabase (Postgres + Auth), **somente leitura** | Painel-Saúde nunca escreve nas tabelas — só lê o que Forja e registro-pa já enviaram. Mesmo projeto Supabase dos outros dois apps (schema criado na Fase A). |
| Autenticação | Login por link mágico (e-mail, sem senha) | Mesmo padrão já usado no Forja e no registro-pa. Cada usuário só enxerga os próprios dados (Row Level Security, já configurado na Fase A). |
| Hospedagem | Vercel | Deploy automático a cada `git push` em `main`, mesmo padrão dos outros dois projetos. |
| Repositório | Novo repositório GitHub `painel-saude` (a criar) | Projeto irmão de `App-Forja` e `registro-pa`, mesma conta. |

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
| `profiles` | Forja | `birth_date`, `height_cm` (usados para dar contexto no relatório, ex. idade) |

Observação importante: **o dado só existe aqui a partir do momento em que a sincronização foi ligada** em cada app (01/08/2026 em diante). Histórico anterior a essa data não aparece — isso é o que a Fase E pretende resolver (ver §12), enviando o histórico já registrado antes de existir sincronização.

---

## 7. Funcionalidades por área

### 7.1 Login

- Tela única de entrada: campo de e-mail, botão "enviar link mágico" — mesmo fluxo já usado no Forja e no registro-pa.
- Ao logar, o painel mostra os dados do usuário logado (Marcos ou esposa, conforme o e-mail).

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

---

## 10. Limitações e riscos conhecidos

- **Depende dos outros dois apps terem sincronização ligada**: sem e-mail conectado no Forja e no registro-pa, não há dado nenhum para mostrar aqui.
- **Sem histórico anterior à sincronização** (antes de 01/08/2026) até a Fase E ser implementada.
- **Sem edição/correção de dado**: erro de registro precisa ser corrigido no app de origem (Forja ou registro-pa), não aqui.
- **Sem modo offline**: precisa de internet para logar e carregar os dados (coerente com a decisão de não ser PWA).
- **Sem testes automatizados**: mesmo padrão dos outros dois projetos pessoais — validação é manual, feita por Marcos após o deploy.

---

## 11. Histórico de evolução

| Data | Entrega |
|---|---|
| 02/08/2026 | Documento de produto criado — Fase D iniciada pela definição do produto, antes de qualquer código. |

---

## 12. Roadmap

- **Fase D (esta fase, ainda não implementada)**: criar o app, tela de login, painel combinado e relatórios por especialista, conforme descrito acima.
- **Fase E (depois)**: envio do histórico já registrado nos dois apps antes de a sincronização existir; fila de reenvio para quando a sincronização falhar por estar offline no momento do registro.

---

## 13. Métricas de sucesso (informais)

Como projeto pessoal, sucesso aqui significa:

- O painel realmente ser consultado antes das consultas com fisio/cardiologista (em vez de montar o relatório na mão como hoje).
- O gráfico combinado revelar alguma correlação útil entre treino, peso e pressão ao longo do tempo.
- Nenhum atrito extra nos apps de origem (Forja e registro-pa) por causa deste painel — a sincronização continua opcional e invisível para quem não usa.

---

*Documento de produto elaborado antes da primeira linha de código do Painel-Saúde, como ponto de partida da Fase D do plano descrito em `app-forja/docs/PRODUCT.md` §12.*
