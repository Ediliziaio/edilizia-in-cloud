import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['src/test/logic/commessePrioritaDatabase.test.ts'], testTimeout: 20000, hookTimeout: 30000 } });
