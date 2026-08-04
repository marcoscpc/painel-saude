import { supabase } from "./supabaseClient";

// Chama a Edge Function strava-connect (autenticada, via functions.invoke, que já
// manda o token da sessão atual) e devolve a URL de autorização do Strava.
// Quem navega o navegador pra lá é o chamador (window.location.href).
export async function connectStrava() {
  const { data, error } = await supabase.functions.invoke("strava-connect");
  if (error) throw error;
  if (!data?.url) throw new Error("Resposta inesperada ao conectar com o Strava");
  return data.url;
}

// Lê o status via RPC (não a tabela strava_tokens diretamente — essa não tem
// política de leitura liberada pro cliente, de propósito).
export async function getStravaStatus() {
  const { data, error } = await supabase.rpc("strava_connection_status");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { connected: true, athleteId: row.athlete_id, connectedAt: row.connected_at } : { connected: false };
}
