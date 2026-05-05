import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoBase = process.env.DEMO_BASE || "/";
const normalizedBase = repoBase.endsWith("/") ? repoBase : `${repoBase}/`;

export default defineConfig({
  base: normalizedBase,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
