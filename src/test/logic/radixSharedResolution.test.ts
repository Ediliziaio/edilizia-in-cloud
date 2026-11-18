import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

// Vite/esbuild needs Node's own typed arrays, rather than jsdom's copies.
// Exercise the actual resolver in a Node child, for previews and production.
it("Dialog, Select e Popover condividono gli stessi contesti in sviluppo e produzione", () => {
  const script = `
    import { resolveConfig } from 'vite';
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    const importers = ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-popover', 'cmdk'].map(name => require.resolve(name));
    const shared = ['@radix-ui/react-dismissable-layer', '@radix-ui/react-focus-scope', '@radix-ui/react-portal', '@radix-ui/react-popper', '@radix-ui/react-collection', 'react-remove-scroll'];
    const result = {};
    for (const command of ['serve', 'build']) {
      const config = await resolveConfig({configFile: 'vite.config.ts', logLevel: 'silent'}, command);
      const resolver = config.createResolver();
      result[command] = {};
      for (const name of shared) result[command][name] = await Promise.all(importers.map(importer => resolver(name, importer)));
    }
    process.stdout.write(JSON.stringify(result));
  `;
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: resolve(__dirname, "../../.."), encoding: "utf8", timeout: 15000,
  })) as Record<string, Record<string, string[]>>;
  for (const [command, dependencies] of Object.entries(result)) {
    for (const [name, paths] of Object.entries(dependencies)) {
      expect(paths.every(Boolean), `${command}: ${name}`).toBe(true);
      expect(new Set(paths).size, `${command}: ${name}`).toBe(1);
    }
  }
}, 20000);
