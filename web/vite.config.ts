import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Alchemy adds the Cloudflare plugin itself when it builds or serves the app (see alchemy.run.ts).
export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
});
