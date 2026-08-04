// Usado pela Fase 3 (sincronização diária): devolve um access_token válido
// para o usuário, renovando via refresh_token quando estiver perto de expirar
// (o access_token do Strava dura ~6h). Sem isso, o sync pararia de funcionar
// sozinho depois da primeira janela de 6h.
//
// Ainda não é importado por nenhuma função deployada — fica aqui como
// referência pronta pra Fase 3. Quando escrevermos a função de sync, ela vai
// precisar desse código inline (mesma razão do comentário em
// strava-connect/index.ts: deploy função-por-função pelo editor do Supabase
// Dashboard não enxerga pastas fora da própria função), a menos que a essa
// altura já estejamos usando a CLI do Supabase pra deploy.
import { createClient } from "npm:@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

export async function getValidStravaAccessToken(
  admin: SupabaseClient,
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

  const expiresAtMs = new Date(row.expires_at as string).getTime();
  const soon = Date.now() + 5 * 60 * 1000;
  if (expiresAtMs > soon) return row.access_token as string;

  const resp = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.access_token) return null;

  await admin
    .from("strava_tokens")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(data.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return data.access_token as string;
}
