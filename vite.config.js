import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O prefixo "NODE_ENV=production" no script "build" do package.json não
// alterou o bundle final no ambiente de build da Vercel (mesmo hash de
// arquivo antes/depois) -- provável diferença na forma como o shell da
// Vercel invoca scripts do npm. Força aqui dentro, direto no processo
// Node que carrega este arquivo de config, o que independe de shell.
process.env.NODE_ENV = "production";
console.log("[vite.config.js] NODE_ENV forçado para:", process.env.NODE_ENV);

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
