import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.js"],
    setupFiles: ["tests/setup.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      include: [
        "db.js",
        "server/**/*.js",
        "public/js/core/**/*.js",
        "public/js/ui/**/*.js",
        "public/js/features/**/*.js",
        "public/js/panels/**/*.js",
      ],
      exclude: ["node_modules/**", "e2e/**", "tests/**"],
    },
    environmentMatchGlobs: [
      ["tests/unit/frontend/**", "happy-dom"],
    ],
  },
});
