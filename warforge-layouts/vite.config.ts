import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  base: mode === "github-pages" ? "/List-Building/layouts/" : "/",
  plugins: [react()],
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"] },
}));
