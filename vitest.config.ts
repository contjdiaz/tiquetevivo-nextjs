import { defineConfig, configDefaults } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./")
    }
  },
  test: {
    globals: true,
    environment: "node",
    // Isolate each test file in its own forked process so per-file vi.mock
    // factories for shared @/lib/api modules never leak across files.
    pool: "forks",
    isolate: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: [
      ...configDefaults.exclude,
      "tests/playwright/**",
      "**/*playwright*.spec.*"
    ]
  }
});
