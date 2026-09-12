import { useState, useEffect } from "react";
import { watchSession, consumeAuthError } from "./lib/auth";
import { supabase } from "./lib/supabaseClient";
import MissingConfig from "./components/MissingConfig";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando sessão
  const [authError, setAuthError] = useState(null);
  // Captura ?strava=... na primeira renderização, antes do watchSession limpar
  // a query string da URL (ele faz isso assim que resolve a sessão).
  const [stravaFlash] = useState(() => new URLSearchParams(window.location.search).get("strava"));
  useEffect(() => watchSession(setSession), []);
  useEffect(() => { setAuthError(consumeAuthError()); }, []);

  return (
    <div className="ps">
      {session === undefined ? (
        <div className="splash">Carregando…</div>
      ) : !supabase ? (
        <MissingConfig />
      ) : !session ? (
        <Login authError={authError} />
      ) : (
        <Dashboard session={session} stravaFlash={stravaFlash} />
      )}
    </div>
  );
}
