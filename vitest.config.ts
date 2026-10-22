import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/core/src/**/*.test.ts', 'apps/parsiword/src/**/*.test.ts', 'apps/vscode/src/**/*.test.ts'] } });
