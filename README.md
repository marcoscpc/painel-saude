# Painel-Saúde

Painel pessoal, **só de leitura**, que junta os dados que o [Forja](https://github.com/marcoscpc/App-Forja) (treino, peso, medidas) e o [registro-pa](https://github.com/marcoscpc/registro-pa) (pressão arterial) já enviam para um banco compartilhado (Supabase), quando o usuário conecta um e-mail em cada um deles.

Não registra nada — quem registra continua sendo o Forja e o registro-pa. Ver [`docs/PRODUCT.md`](docs/PRODUCT.md) para o documento de produto completo.

## Rodar localmente

```
npm install
npm run dev
```

Precisa de um arquivo `.env.local` (não versionado) com:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Mesmos valores usados no Forja e no registro-pa (mesmo projeto Supabase).

## Build e deploy

```
npm run build
```

Hospedado no Vercel, deploy automático a cada `git push` em `main` — mesmo padrão do Forja e do registro-pa. As variáveis de ambiente acima precisam estar configuradas no projeto Vercel também.

## Estrutura

    src/App.jsx           app inteiro: login, painel combinado, relatórios, atalhos
    src/lib/supabaseClient.js   cliente Supabase (lê VITE_SUPABASE_URL/ANON_KEY)
    src/lib/auth.js        login por link mágico, sessão
    src/lib/data.js        leitura das tabelas (bp_readings, body_weight, body_measurements, workout_sessions, profiles)

Não é PWA (diferente do Forja e do registro-pa) — uso esperado é esporádico, não precisa de ícone na tela inicial nem de funcionar offline.
