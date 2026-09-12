import { GoTrueClient } from "@supabase/auth-js";
import { PostgrestClient } from "@supabase/postgrest-js";
import { FunctionsClient } from "@supabase/functions-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Monta o client a partir dos pacotes menores (@supabase/{auth,postgrest,functions}-js)
// em vez do createClient() do @supabase/supabase-js "guarda-chuva" -- esse último
// sempre instancia RealtimeClient e StorageClient (WebSocket/canais, buckets de
// arquivo, catálogo Iceberg, WebAuthn/passkeys, login via carteira Web3...) dentro
// do próprio construtor, e o Rollup não consegue eliminar esse código morto por
// tree-shaking (tudo fica referenciado a partir da classe que de fato usamos). Este
// app só usa autenticação (link mágico), leitura de tabelas (PostgREST) e Edge
// Functions -- nunca Realtime, Storage, passkeys nem Web3 -- então montamos só essas
// três peças. Isso derrubou o bundle de produção de ~387kB para bem menos.
// Documentado como padrão oficial ("Standalone import for bundle-sensitive
// environments") em cada um dos três pacotes.
function buildClient() {
  const authUrl = `${url}/auth/v1`;
  const restUrl = `${url}/rest/v1`;
  const functionsUrl = `${url}/functions/v1`;
  // Mesmo formato de storageKey que o createClient() do supabase-js usa
  // (sb-<project-ref>-auth-token) -- preserva sessões já salvas no navegador.
  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

  const auth = new GoTrueClient({
    url: authUrl,
    headers: { apikey: anonKey },
    storageKey,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  });

  // Injeta apikey/Authorization em toda chamada ao PostgREST e às Edge Functions,
  // usando o token da sessão atual (ou a anon key, se ninguém estiver logado) --
  // mesmo comportamento do fetch interno do supabase-js.
  const authenticatedFetch = async (input, init = {}) => {
    const { data } = await auth.getSession();
    const token = data.session?.access_token ?? anonKey;
    const headers = new Headers(init.headers);
    if (!headers.has("apikey")) headers.set("apikey", anonKey);
    if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  const rest = new PostgrestClient(restUrl, {
    headers: { apikey: anonKey },
    fetch: authenticatedFetch,
  });

  const functions = new FunctionsClient(functionsUrl, {
    headers: { apikey: anonKey },
    customFetch: authenticatedFetch,
  });

  return {
    auth,
    functions,
    from: (table) => rest.from(table),
    rpc: (fn, args, options) => rest.rpc(fn, args, options),
  };
}

export const supabase = url && anonKey ? buildClient() : null;
