import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";

export default tseslint.config(
  // Esclusi dal linting:
  // - dist/ → output di build (no sorgenti)
  // - ios/App/build/ + android/app/build/ → artefatti Capacitor (es. native-bridge.js
  //   copiato in 4 path), generano falsi positivi su rule non disponibili
  // - node_modules → dependencies di terze parti
  // - supabase/functions/ → Deno runtime con regole proprie (linting separato)
  {
    ignores: [
      "dist",
      "ios/App/build",
      "ios/App/Pods",
      "ios/App/build/**",
      "android/app/build",
      "android/app/build/**",
      "node_modules",
      "supabase/functions",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "unused-imports": unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Legacy SaaS codebase: payload Supabase/AI/Edge dinamici vengono
      // tipizzati gradualmente. Il warning resta visibile senza bloccare
      // cleanup e fix runtime realmente bloccanti.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],
    },
  },
);
