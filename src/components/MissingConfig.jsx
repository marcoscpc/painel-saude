export default function MissingConfig() {
  return (
    <div className="main">
      <div className="card">
        <h2 className="sec">Configuração pendente</h2>
        <p className="small muted">
          Faltam as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (arquivo <code>.env.local</code>). Veja o <code>README.md</code>.
        </p>
      </div>
    </div>
  );
}
