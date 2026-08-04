// Chamada 1x por dia por um cron (ver supabase/sql/2026-08-04_strava_daily_sync_cron.sql).
// Para cada usuario com token do Strava salvo, renova o token se precisar,
// busca corridas/caminhadas novas desde a ultima sincronizada e grava em
// activities de forma idempotente (upsert por user_id+strava_activity_id --
// rodar de novo nao duplica).
//
// So aceita chamadas com a service_role key (nao a anon key, que fica publica
// dentro do bundle do painel-saude) -- sem isso, qualquer um que inspecionasse
// o site poderia ficar disparando sincronizacoes a vontade.
//
// Nota: helpers duplicados aqui (nao importados de _shared/) pelo mesmo
// motivo das outras funcoes -- deploy pelo editor do Supabase Dashboard, um
// arquivo por funcao.
import { createClient } from "npm:@supabase/supabase-js@2";

// Compara o token recebido direto com a chave de servidor do próprio
// projeto (SUPABASE_SERVICE_ROLE_KEY é injetada automaticamente pelo
// Supabase em toda Edge Function, sempre com o valor certo pra esse
// projeto -- seja no formato antigo (JWT "service_role") ou no novo
// ("Secret key", sb_secret_...). Comparação direta de string em vez de
// decodificar como JWT, pra não depender de qual dos dois formatos está
// em uso.
function callerIsServiceRole(req: Request): boolean {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return !!expected && token === expected;
}

async function getValidAccessToken(
  admin: ReturnType<typeof createClient>,
  userId: string,
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  const { data: row, error } = await admin
    .from("strava_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !row) return null;

  if (new Date(row.expires_at as string).getTime() > Date.now() + 5 * 60 * 1000) {
    return row.access_token as string;
  }

  const resp = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: row.refresh_token, grant_type: "refresh_token" }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.access_token) return null;

  await admin.from("strava_tokens").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(data.expires_at * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  return data.access_token as string;
}

async function syncUser(admin: ReturnType<typeof createClient>, userId: string, accessToken: string) {
  const { data: last } = await admin
    .from("activities")
    .select("start_date")
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const after = last ? Math.floor(new Date(last.start_date as string).getTime() / 1000) : 0;

  const perPage = 200;
  const maxPages = 20; // guarda contra historico gigante ou loop indevido
  let page = 1;
  let upserted = 0;

  while (page <= maxPages) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("after", String(after));
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));

    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (resp.status === 429) return { upserted, rateLimited: true };
    if (!resp.ok) return { upserted, error: `Strava respondeu ${resp.status}` };

    const items = await resp.json();
    if (!Array.isArray(items) || items.length === 0) break;

    const rows = items
      .filter((a: any) => a.type === "Run" || a.type === "Walk")
      .map((a: any) => ({
        user_id: userId,
        strava_activity_id: a.id,
        type: a.type,
        start_date: a.start_date,
        distance_m: a.distance,
        moving_time_s: a.moving_time,
        average_heartrate: a.average_heartrate ?? null,
        max_heartrate: a.max_heartrate ?? null,
        average_speed: a.average_speed ?? null,
      }));

    if (rows.length) {
      const { error: upsertError } = await admin.from("activities").upsert(rows, { onConflict: "user_id,strava_activity_id" });
      if (upsertError) return { upserted, error: upsertError.message };
      upserted += rows.length;
    }

    if (items.length < perPage) break;
    page++;
  }

  return { upserted };
}

Deno.serve(async (req) => {
  if (!callerIsServiceRole(req)) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("STRAVA_CLIENT_ID");
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: "STRAVA_CLIENT_ID/SECRET não configurados" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: tokens, error } = await admin.from("strava_tokens").select("user_id");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const results = [];
  for (const t of tokens ?? []) {
    const accessToken = await getValidAccessToken(admin, t.user_id as string, clientId, clientSecret);
    if (!accessToken) {
      results.push({ user_id: t.user_id, error: "sem token válido" });
      continue;
    }
    const r = await syncUser(admin, t.user_id as string, accessToken);
    results.push({ user_id: t.user_id, ...r });
  }

  return new Response(JSON.stringify({ results }), { headers: { "Content-Type": "application/json" } });
});
