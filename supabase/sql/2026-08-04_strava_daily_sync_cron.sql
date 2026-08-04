-- Fase 3 da integração Strava -> painel-saude: agenda a Edge Function
-- `strava-sync` pra rodar 1x por dia sozinha.
--
-- ANTES DE RODAR: troque COLE_AQUI_A_SERVICE_ROLE_KEY pela "service_role"
-- key do projeto (Project Settings -> API -> Project API keys -> service_role
-- -- é diferente da "anon" key que o painel-saude usa). Essa chave é o que
-- prova pra função que quem está chamando é o cron, não um visitante
-- qualquer do site.
--
-- Cole só o bloco que quiser rodar (o de agendar OU o de testar agora),
-- separadamente, no SQL Editor -> New query -> Run.

-- 1) Habilita as extensões necessárias (só precisa rodar uma vez).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 2) Agenda a sincronização diária às 06:00 UTC (~03:00 no horário de
-- Brasília), fora do horário em que o painel costuma ser usado.
select cron.schedule(
  'strava-daily-sync',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://vedzwowifiggnxvcrhvi.supabase.co/functions/v1/strava-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer COLE_AQUI_A_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3) OPCIONAL, só pra testar agora sem esperar o cron rodar de madrugada:
-- dispara a sincronização uma vez, na hora. Cole isso sozinho numa query nova
-- (sem o bloco do cron.schedule acima) sempre que quiser forçar um sync manual.
-- select net.http_post(
--   url := 'https://vedzwowifiggnxvcrhvi.supabase.co/functions/v1/strava-sync',
--   headers := jsonb_build_object(
--     'Authorization', 'Bearer COLE_AQUI_A_SERVICE_ROLE_KEY',
--     'Content-Type', 'application/json'
--   ),
--   body := '{}'::jsonb
-- );

-- Pra remover o agendamento no futuro, se precisar:
-- select cron.unschedule('strava-daily-sync');
