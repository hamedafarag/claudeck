import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/perf/**/*.test.js"],
    setupFiles: ["tests/setup.js"],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    sequence: { concurrent: false },
    reporters: ["verbose"],
    coverage: { enabled: false },
  },
});
