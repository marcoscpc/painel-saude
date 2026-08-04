// Chamada diretamente pelo Strava (navegação do navegador, sem cabeçalho de
// autenticação do Supabase) depois que o usuário autoriza ou recusa. Troca o
// "code" por tokens, grava em strava_tokens usando a service role key
// (ignora RLS de propósito -- RLS dessa tabela não libera nem o dono via
// cliente comum) e redireciona de volta pro painel-saude com o resultado.
//
// Nota: código de verificação do "state" duplicado de strava-connect/index.ts
// de propósito -- ver o comentário lá sobre o deploy função-por-função pelo
// editor do Supabase Dashboard.
import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
}

async function verifyState(state: string, secret: string): Promise<string | null> {
  const [payloadB64, sigB64] = state.split(".");
  if (!payloadB64 || !sigB64) return null;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify("HMAC", key, base64UrlDecode(sigB64), encoder.encode(payloadB64));
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

const PAINEL_SAUDE_URL = Deno.env.get("PAINEL_SAUDE_URL") || "https://painel-saude-six.vercel.app";

function redirectTo(status: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${PAINEL_SAUDE_URL}/?strava=${status}` },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("STRAVA_CLIENT_ID");
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");

  if (error || !code || !state) return redirectTo("denied");
  if (!clientId || !clientSecret) return redirectTo("error");

  const userId = await verifyState(state, serviceRoleKey);
  if (!userId) return redirectTo("error");

  const tokenResp = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code" }),
  });
  if (!tokenResp.ok) return redirectTo("error");
  const tokenData = await tokenResp.json();
  if (!tokenData.access_token || !tokenData.athlete?.id) return redirectTo("error");

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { error: upsertError } = await admin.from("strava_tokens").upsert(
    {
      user_id: userId,
      athlete_id: tokenData.athlete.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (upsertError) return redirectTo("error");

  return redirectTo("connected");
});
