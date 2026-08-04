// Chamada pelo painel-saude (usuário já logado) quando clica "Conectar com
// Strava". Confere quem está logado pelo próprio token do Supabase e devolve
// a URL de autorização do Strava pra o navegador ser redirecionado.
//
// Nota: o código de assinatura do "state" está duplicado aqui e em
// strava-callback/index.ts (não importado de um arquivo compartilhado) de
// propósito — cada função é colada isoladamente no editor do Supabase
// Dashboard (Edge Functions -> New function -> Via Editor), que não enxerga
// pastas fora da própria função. Se algum dia passarmos a usar a CLI do
// Supabase pra fazer deploy (supabase functions deploy), dá pra voltar a
// compartilhar via _shared/.
import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos para completar o fluxo no Strava

function base64UrlEncode(bytes: Uint8Array): string {
  const str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function signState(userId: string, secret: string): Promise<string> {
  const payload = JSON.stringify({ uid: userId, exp: Date.now() + STATE_TTL_MS });
  const payloadB64 = base64UrlEncode(encoder.encode(payload));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${base64UrlEncode(new Uint8Array(sig))}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("STRAVA_CLIENT_ID");
    if (!clientId) {
      return new Response(JSON.stringify({ error: "STRAVA_CLIENT_ID não configurado" }), { status: 500, headers: jsonHeaders });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: jsonHeaders });
    }

    const state = await signState(userData.user.id, serviceRoleKey);
    const authorizeUrl = new URL("https://www.strava.com/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", `${supabaseUrl}/functions/v1/strava-callback`);
    authorizeUrl.searchParams.set("approval_prompt", "auto");
    authorizeUrl.searchParams.set("scope", "activity:read_all");
    authorizeUrl.searchParams.set("state", state);

    return new Response(JSON.stringify({ url: authorizeUrl.toString() }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: jsonHeaders });
  }
});
