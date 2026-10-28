// Bundle server del preventivo generico. Non sostituisce i layout dedicati
// Fotovoltaico (HTML condiviso) e Serramenti (documento nativo originale).
//
// Perché: @react-pdf gira anche fuori dal browser (Node/Deno), ma il grafo del
// componente usa gli alias `@/` e due dipendenze browser (toDataUrl via canvas,
// il client supabase). Qui si risolve `@/` col tsconfig e si sostituiscono quelle
// due dipendenze con shim server (scripts/bgn-render/shims). I builtin di Node
// diventano specificatori `node:` per Deno. Output: _shared/preventivoRenderer.mjs.
//
// Rigenerare dopo aver toccato il documento comune o gli adattatori:
//   npm run build:preventivi

import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const EIC = path.resolve(here, "..", ".."); // radice repo
const SH = path.join(EIC, "scripts/bgn-render/shims");

// Node builtins → prefisso node: ed esterni (li fornisce Deno via node compat).
const nodePrefix = {
  name: "node-prefix",
  setup(build) {
    const builtins = new Set(["fs", "path", "buffer", "stream", "util", "crypto", "zlib", "events", "os", "http", "https", "url", "assert", "process", "tty", "net", "string_decoder", "punycode", "querystring", "child_process", "module", "perf_hooks", "worker_threads", "async_hooks"]);
    build.onResolve({ filter: /^[a-z_/]+$/ }, (args) => {
      const base = args.path.replace(/^node:/, "");
      if (builtins.has(base)) return { path: "node:" + base, external: true };
      return undefined;
    });
  },
};

await esbuild.build({
  entryPoints: [path.join(here, "entry.tsx")],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  absWorkingDir: EIC,
  tsconfig: path.join(EIC, "tsconfig.app.json"),
  jsx: "automatic",
  outfile: path.join(EIC, "supabase/functions/_shared/preventivoRenderer.mjs"),
  alias: {
    "@/lib/serramenti/pdfImageUtils": path.join(SH, "pdfImageUtils.ts"),
    "@/integrations/supabase/client": path.join(SH, "supabaseClient.ts"),
    "@/lib/pdf/votiOnline": path.join(SH, "votiOnline.ts"),
    "@/hooks/useBagniProgetto": path.join(SH, "useBagniProgetto.ts"),
    "@/lib/storage/fileRiservati": path.join(SH, "fileRiservati.ts"),
  },
  banner: {
    // Nomi lunghi e unici: la minificazione genera nomi corti (_B, a, …) e
    // collideva con quelli del banner.
    js: [
      'import {Buffer as __bgnBuffer} from "node:buffer"; if(!globalThis.Buffer) globalThis.Buffer=__bgnBuffer;',
      'import __bgnProcess from "node:process"; if(!globalThis.process) globalThis.process=__bgnProcess;',
      // js-md5 (dipendenza di @react-pdf) legge `global` appena vede un
      // `process` con `versions.node`: lo shim qui sopra lo fa scattare, e in
      // Deno `global` non esiste. Senza questa riga la generazione del PDF muore
      // con «ReferenceError: global is not defined» (visto il 27/10/2026 su
      // generate-quote-pdf).
      'if(!globalThis.global) globalThis.global=globalThis;',
      'import {createRequire as __bgnCreateRequire} from "node:module"; if(!globalThis.require) globalThis.require=__bgnCreateRequire(import.meta.url);',
    ].join("\n"),
  },
  logLevel: "info",
  plugins: [nodePrefix],
});
console.log("Renderer preventivi comune generato.");

