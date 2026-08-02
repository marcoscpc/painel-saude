import { supabase } from "./supabaseClient";

export const sendMagicLink = (email) => {
  if (!supabase) return Promise.reject(new Error("Supabase não configurado"));
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
};

export const signOut = async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
};

// Chama onChange(session) uma vez de cara e a cada mudança de login/logout.
// Retorna a função de unsubscribe.
export const watchSession = (onChange) => {
  if (!supabase) { onChange(null); return () => {}; }
  supabase.auth.getSession().then(({ data }) => onChange(data.session));
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => onChange(session));
  return () => sub.subscription.unsubscribe();
};
