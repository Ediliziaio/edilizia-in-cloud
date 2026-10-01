// Bundla il render del MODELLO BAGNO VERO (@react-pdf, DocumentoEdilePDF) in un
// modulo Deno-caricabile, per l'edge `bgn-genera-pdf`. (28/09/2026)
//
// Perché: @react-pdf gira anche fuori dal browser (Node/Deno), ma il grafo del
// componente usa gli alias `@/` e due dipendenze browser (toDataUrl via canvas,
// il client supabase). Qui si risolve `@/` col tsconfig e si sostituiscono quelle
// due dipendenze con shim server (scripts/bgn-render/shims). I builtin di Node
// diventano specificatori `node:` per Deno. Output → _render.mjs nell'edge.
//
// Rigenerare dopo aver toccato DocumentoEdilePDF/BagniPDF/enrichBagniPdf:
//   node scripts/bgn-render/build.mjs   (serve node/bun con esbuild in node_modules)

import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const EIC = path.resolve(here, "..", ".."); // radice repo
const SH = path.join(here, "shims");

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
  outfile: path.join(EIC, "supabase/functions/bgn-genera-pdf/_render.mjs"),
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
      'import {createRequire as __bgnCreateRequire} from "node:module"; if(!globalThis.require) globalThis.require=__bgnCreateRequire(import.meta.url);',
    ].join("\n"),
  },
  logLevel: "info",
  plugins: [nodePrefix],
});
console.log("bgn render bundle: fatto");
