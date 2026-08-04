import { supabase } from "./supabaseClient";

const AUTH_EXP_KEY = "ps-authExp";
const DAY_MS = 24 * 60 * 60 * 1000;
export const SHORT_SESSION_DAYS = 1;
export const LONG_SESSION_DAYS = 15;

// "expiresAt" próprio do app controla quando volta a pedir login (1 ou 15
// dias, conforme "manter-me conectado") — independente de quanto tempo o
// token do Supabase em si ainda dura (aqui persistSession:true, então o
// Supabase sozinho manteria a sessão válida por muito mais tempo).
const authExpiryValid = () => {
  const raw = localStorage.getItem(AUTH_EXP_KEY);
  return !!raw && Date.now() < +raw;
};
const setAuthExpiry = (keep) => {
  localStorage.setItem(AUTH_EXP_KEY, String(Date.now() + (keep ? LONG_SESSION_DAYS : SHORT_SESSION_DAYS) * DAY_MS));
};
const clearAuthExpiry = () => localStorage.removeItem(AUTH_EXP_KEY);

// Erro de link mágico expirado/já usado vem como #error=...&error_description=...
// na URL — o Supabase processa e limpa isso sozinho, de forma assíncrona,
// quase sempre antes do primeiro efeito do React rodar — por isso um script
// inline no index.html guarda uma cópia em sessionStorage bem cedo, antes de
// qualquer módulo carregar; aqui só lemos essa cópia (com a hash atual como
// respaldo, caso ainda não tenha sido limpa).
export const consumeAuthError = () => {
  let hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  let stored = null;
  if (!hash.includes("error_description=")) {
    try {
      stored = sessionStorage.getItem("ps-authErr");
    } catch {
      stored = null;
    }
    if (stored) hash = stored.startsWith("#") ? stored.slice(1) : stored;
  }
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const desc = params.get("error_description");
  if (!desc) return null;
  if (stored) {
    try {
      sessionStorage.removeItem("ps-authErr");
    } catch {
      /* ignora */
    }
  }
  return desc.replace(/\+/g, " ");
};

export const sendMagicLink = (email, keepConnected) => {
  if (!supabase) return Promise.reject(new Error("Supabase não configurado"));
  // Usa a raiz do site, não window.location.pathname — evita depender de como
  // a URL atual está formada (lição do registro-pa, 04/08/2026: usar o path
  // atual podia resolver pra uma URL que a hospedagem redireciona sozinha,
  // derrubando parâmetros de query no caminho).
  const redirectTo = `${window.location.origin}/?keep=${keepConnected ? 1 : 0}`;
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
};

export const signOut = async () => {
  clearAuthExpiry();
  if (!supabase) return;
  await supabase.auth.signOut();
};

// Chama onChange(session) uma vez de cara e a cada mudança de login/logout.
// Só repassa a sessão se ainda estiver dentro do prazo de "manter-me
// conectado" — do contrário, mesmo com um token do Supabase tecnicamente
// válido, trata como deslogado (pede o login de novo).
// Retorna a função de unsubscribe.
export const watchSession = (onChange) => {
  if (!supabase) { onChange(null); return () => {}; }

  const keepParam = new URLSearchParams(window.location.search).get("keep");
  const isMagicLinkReturn = keepParam !== null || /access_token=|error_description=/.test(window.location.hash);

  supabase.auth.getSession().then(({ data }) => {
    const session = data.session;
    if (session && isMagicLinkReturn) setAuthExpiry(keepParam === null ? true : keepParam !== "0");
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    onChange(session && authExpiryValid() ? session : null);
  });

  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) {
      setAuthExpiry(keepParam === null ? true : keepParam !== "0");
      onChange(session);
    } else if (event === "SIGNED_OUT") {
      clearAuthExpiry();
      onChange(null);
    } else {
      onChange(session && authExpiryValid() ? session : null);
    }
  });
  return () => sub.subscription.unsubscribe();
};
