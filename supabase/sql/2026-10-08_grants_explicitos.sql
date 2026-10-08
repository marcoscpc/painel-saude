-- Grants explícitos para as tabelas do painel-saude criadas neste repositório.
-- A partir de 30/out/2026 o Supabase deixa de conceder acesso automático da
-- Data API a tabela nova do schema public. Rode no SQL Editor (idempotente).
--
-- activities: o cliente só LÊ (RLS limita às linhas do próprio usuário); quem
-- grava é a Edge Function com service_role.
grant select on public.activities to authenticated;
grant select, insert, update, delete on public.activities to service_role;

-- strava_tokens: segredo OAuth. Sem NENHUM grant para authenticated/anon de
-- propósito (RLS ligada e zero policies); só a service_role acessa.
grant select, insert, update, delete on public.strava_tokens to service_role;
