import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { wardrobeImportApi } from "./scripts/import-job-api.mjs";
import { responsiveImageApi } from "./scripts/responsive-image-api.mjs";
import { studioApi } from "./scripts/studio-api.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const platformApiUrl = env.PLATFORM_API_URL || "http://127.0.0.1:8787";
  return {
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      proxy: {
        "/platform-api": {
          target: platformApiUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/platform-api/, ""),
        },
      },
      warmup: {
        clientFiles: ["./src/main.jsx"],
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 4173,
      allowedHosts: ["localhost"],
    },
    plugins: [react(), responsiveImageApi(), studioApi(), wardrobeImportApi({ env })],
  };
});
