import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { shosaiApi } from "./server/api";

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(process.env.VITEST ? [] : [shosaiApi()])],
  server: {
    port: 13002,
    strictPort: true,
    // tailscale serve などの別名から開けるようにする
    allowedHosts: true,
  },
});
