-- Fase 2 da integração Strava -> painel-saude.
-- Cole no Supabase (Dashboard -> SQL Editor -> New query -> Run), depois de já
-- ter rodado 2026-08-04_strava_activities.sql.
--
-- `strava_tokens` não tem nenhuma política de leitura liberada pro cliente
-- (de propósito -- guarda segredo). Essa função dá ao painel-saude uma forma
-- segura de saber "estou conectado?" sem nunca expor access_token/refresh_token
-- no navegador: roda com privilégio (security definer) mas só devolve a linha
-- do próprio usuário logado (auth.uid()), e só as colunas não sensíveis.

create or replace function public.strava_connection_status()
returns table (athlete_id bigint, connected_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select t.athlete_id, t.created_at
  from public.strava_tokens t
  where t.user_id = auth.uid()
  limit 1
$$;

revoke all on function public.strava_connection_status() from public;
grant execute on function public.strava_connection_status() to authenticated;
