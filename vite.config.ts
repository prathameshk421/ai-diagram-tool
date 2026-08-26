import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { diagramProxyPlugin } from "./server/proxy";

export default defineConfig({
  plugins: [diagramProxyPlugin(), react()],
});
