import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The end-to-end suite starts a local Worker, which takes a few seconds.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
