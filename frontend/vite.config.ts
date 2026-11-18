import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
  build: { assetsDir: "assets/electricity" },

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
