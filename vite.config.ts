import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { diagramProxyPlugin } from "./server/proxy";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [diagramProxyPlugin(), react()],
    define: {
      "import.meta.env.OMNIROUTE_MODEL": JSON.stringify(
        (env.OMNIROUTE_MODEL ?? "").trim(),
      ),
    },
  };
});
