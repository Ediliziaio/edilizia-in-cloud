import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config";

// Deliberately separate from the normal suite: never inherits a developer's
// Supabase URL and never sends requests to external services.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    setupFiles: ["./src/test/setup.ts", "./src/test/preventivatore/offlineSetup.ts"],
    maxWorkers: 2,
    env: {
      VITE_PREVENTIVATORE_OFFLINE: "true",
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    },
    include: [
      "src/test/preventivatore/**/*.{test,spec}.{ts,tsx}",
      "src/test/logic/quoteTotalsParity.test.ts",
      "src/test/logic/quoteTotaliScalaDatabase.test.ts",
      "src/test/logic/quoteWriteVersion.test.ts",
      "src/test/logic/quoteDraft.test.ts",
      "src/test/logic/quoteDraftRigheDalListino.test.ts",
      "src/test/logic/quoteConversionAtomic.test.ts",
      "src/test/logic/preventivoGenericoGestori.test.ts",
      "src/test/logic/newQuoteDialog.test.tsx",
      "src/test/logic/quoteSaveHandlers.test.ts",
      "src/test/logic/quoteBuilderDuplicaRiga.test.ts",
      "src/test/logic/prezzoFamigliaAi.test.ts",
      "src/test/ui/quoteLivePreview.test.tsx",
      "src/test/logic/quoteTemplatePreview.test.ts",
      "src/test/logic/quoteTemplateComposer.test.ts",
    ],
  },
});
