import { useState } from "react";
import { sendMagicLink } from "../lib/auth";

export default function Login({ authError }) {
  const [email, setEmail] = useState("");
  const [keep, setKeep] = useState(true);
  const [status, setStatus] = useState(
    authError ? { kind: "err", text: "Link inválido ou expirado: " + authError } : null
  );
  const [sending, setSending] = useState(false);

  const send = async () => {
    const e = email.trim();
    if (!e) { setStatus({ kind: "err", text: "Digite um e-mail." }); return; }
    setSending(true); setStatus(null);
    try {
      const { error } = await sendMagicLink(e, keep);
      setStatus(error
        ? { kind: "err", text: "Erro: " + error.message }
        : { kind: "ok", text: "Link enviado! Confira seu e-mail e abra o link neste mesmo aparelho." });
    } catch {
      setStatus({ kind: "err", text: "Não foi possível enviar agora. Tente de novo." });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <header>
        <div className="brand">Painel-Saúde<span className="sub">Fase D</span></div>
      </header>
      <div className="main">
        <div className="card">
          <h2 className="sec">Entrar</h2>
          <p className="small muted" style={{ marginBottom: 12 }}>
            Use o mesmo e-mail que você já conectou no Forja ou no registro-pa — é lá que os dados são enviados.
          </p>
          <div className="row" style={{ marginBottom: 10 }}>
            <input className="inp" type="email" placeholder="seu@email.com" value={email}
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          </div>
          <label className="row small" style={{ gap: 8, marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            Manter-me conectado por 15 dias
          </label>
          <button className="btn pri blk" disabled={sending} onClick={send}>
            {sending ? "Enviando…" : "Enviar link mágico"}
          </button>
          {!keep && (
            <p className="small muted" style={{ marginTop: 8 }}>
              Sem marcar essa opção, o app vai pedir login de novo em cerca de 1 dia.
            </p>
          )}
          {status && (
            <p className="small" style={{ marginTop: 10, color: status.kind === "err" ? "var(--bad)" : "var(--good)" }}>
              {status.text}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
