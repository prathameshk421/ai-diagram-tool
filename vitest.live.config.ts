import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/live/**/*.live.test.ts"],
    fileParallelism: false,
    maxConcurrency: 1,
    sequence: { concurrent: false },
    testTimeout: 20_000,
    setupFiles: ["./tests/live/setup.ts"],
  },
});
