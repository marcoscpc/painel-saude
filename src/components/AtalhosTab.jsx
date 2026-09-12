import { useEffect, useState } from "react";
import { fmtBRFull } from "../lib/dates";
import { connectStrava, getStravaStatus } from "../lib/strava";

const FORJA_URL = "https://forja-five.vercel.app";
const PA_URL = "https://registro-pa.vercel.app";

/* ---------- Atalhos ---------- */
export default function AtalhosTab({ stravaFlash }) {
  return (
    <>
      <div className="card">
        <h2 className="sec">Registrar em outro app</h2>
        <p className="small muted" style={{ marginBottom: 14 }}>
          O Painel-Saúde só mostra dados — para registrar um treino novo, peso ou uma medição de pressão, use o app de origem.
        </p>
        <div className="row" style={{ marginBottom: 10 }}>
          <a className="btn blk" style={{ textDecoration: "none" }} href={FORJA_URL} target="_blank" rel="noopener noreferrer">Abrir Forja</a>
        </div>
        <div className="row">
          <a className="btn blk" style={{ textDecoration: "none" }} href={PA_URL} target="_blank" rel="noopener noreferrer">Abrir registro-pa</a>
        </div>
      </div>
      <StravaCard stravaFlash={stravaFlash} />
    </>
  );
}

const STRAVA_FLASH_MSG = {
  connected: { kind: "ok", text: "Conectado ao Strava com sucesso!" },
  denied: { kind: "err", text: "Conexão cancelada — a autorização não foi concluída no Strava." },
  error: { kind: "err", text: "Não foi possível concluir a conexão com o Strava. Tente de novo." },
};

function StravaCard({ stravaFlash }) {
  const [status, setStatus] = useState(undefined); // undefined = carregando
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState(null);
  const flash = stravaFlash && STRAVA_FLASH_MSG[stravaFlash];

  useEffect(() => {
    let alive = true;
    getStravaStatus().then((s) => alive && setStatus(s)).catch(() => alive && setStatus({ connected: false }));
    return () => { alive = false; };
  }, [stravaFlash]);

  const connect = async () => {
    setErr(null); setConnecting(true);
    try {
      const url = await connectStrava();
      window.location.href = url;
    } catch (e) {
      setErr(e.message || "Não foi possível iniciar a conexão com o Strava.");
      setConnecting(false);
    }
  };

  return (
    <div className="card">
      <h2 className="sec">Cardio (Strava)</h2>
      {flash && (
        <p className="small" style={{ marginBottom: 12, color: flash.kind === "err" ? "var(--bad)" : "var(--good)" }}>
          {flash.text}
        </p>
      )}
      {status === undefined && <p className="small muted">Verificando conexão…</p>}
      {status?.connected && (
        <p className="small muted">
          Conectado desde {fmtBRFull(status.connectedAt.slice(0, 10))} — as corridas e caminhadas do Strava passam a
          entrar automaticamente no painel (sincronização diária).
        </p>
      )}
      {status && !status.connected && (
        <>
          <p className="small muted" style={{ marginBottom: 12 }}>
            Conecte sua conta do Strava para trazer corridas e caminhadas pro painel, junto com o treino de musculação.
          </p>
          <button className="btn pri blk" disabled={connecting} onClick={connect}>
            {connecting ? "Abrindo o Strava…" : "Conectar com Strava"}
          </button>
          {err && <p className="small" style={{ marginTop: 8, color: "var(--bad)" }}>{err}</p>}
        </>
      )}
    </div>
  );
}
