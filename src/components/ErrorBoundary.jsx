import { Component } from "react";

// Rede de segurança: sem isso, qualquer exceção não tratada ao renderizar
// (ex.: um dado inesperado vindo do Supabase) derruba a árvore React inteira
// e deixa a tela em branco, sem nenhuma pista pro usuário.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Painel-Saúde: erro não tratado", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="main">
          <div className="card">
            <h2 className="sec">Algo deu errado</h2>
            <p className="small muted">
              Ocorreu um erro inesperado ao exibir esta tela. Recarregue a página; se persistir, tente novamente mais tarde.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
