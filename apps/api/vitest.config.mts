import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    setupFiles: ["./src/test-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
