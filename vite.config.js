import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Minifica com terser (JS puro) em vez do minificador padrão do esbuild --
// o ambiente de build da Vercel bloqueia o script de pós-instalação do
// esbuild (aviso "npm warn allow-scripts"), o que faz a minificação via
// esbuild degradar silenciosamente pra um bundle ~2,7x maior sem o build
// falhar. terser não depende de binário nativo instalado via postinstall,
// então não é afetado por esse bloqueio.
export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
  build: { minify: "terser" },
});
