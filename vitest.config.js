import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./tests/helpers/setup.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
    },
  },
});
