// Misure della fase 0: peso del .wasm, caricamento, scrittura e lettura DXF.
// Uso: node tools/planimetrie-wasm/misura.mjs [cartella-wasm] [pianta.json]
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const qui = dirname(fileURLToPath(import.meta.url));
const cartella = process.argv[2] ?? join(qui, "../../dev/planimetria-motore/wasm");
const pianta = readFileSync(process.argv[3] ?? join(qui, "esempi/trilocale.json"), "utf8");
const byte = readFileSync(join(cartella, "planimetrie_wasm_bg.wasm"));
const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
console.log("wasm grezzo", kb(byte.length));
console.log("wasm gzip -9", kb(gzipSync(byte, { level: 9 }).length));
console.log("wasm brotli 11", kb(brotliCompressSync(byte, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length));

const mod = await import(join(cartella, "planimetrie_wasm.js"));
let t = performance.now();
const compilato = await WebAssembly.compile(byte);
const tCompila = performance.now() - t;
t = performance.now();
mod.initSync({ module: compilato });
console.log(`compilazione ${tCompila.toFixed(1)} ms, istanza ${(performance.now() - t).toFixed(1)} ms`);

const media = (f, n = 50) => {
  f();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) f();
  return (performance.now() - t0) / n;
};
const dxf = mod.scrivi_dxf(pianta);
console.log(`scrivi_dxf ${media(() => mod.scrivi_dxf(pianta)).toFixed(2)} ms (${kb(dxf.length)})`);
console.log(`esporta_svg ${media(() => mod.esporta_svg(pianta)).toFixed(2)} ms`);
console.log(`leggi_dxf ${media(() => mod.leggi_dxf(dxf)).toFixed(2)} ms`);
if (mod.esporta_pdf) {
  const opz = JSON.stringify({ paper: "A3", landscape: true, fit: false, scale: 0.1 });
  console.log(`esporta_pdf ${media(() => mod.esporta_pdf(pianta, opz), 10).toFixed(2)} ms`);
}

// Un DXF grande: la stessa pianta ripetuta 10×10 (cento appartamenti, un condominio).
const p = JSON.parse(pianta);
const grande = { ...p, muri: [], aperture: [], testi: [], quote: [] };
for (let i = 0; i < 10; i++)
  for (let j = 0; j < 10; j++) {
    const dx = i * 1200, dy = j * 1000, id = (s) => `${s}_${i}_${j}`;
    const sp = (q) => [q[0] + dx, q[1] + dy];
    grande.muri.push(...p.muri.map((m) => ({ ...m, id: id(m.id), p1: sp(m.p1), p2: sp(m.p2) })));
    grande.aperture.push(...p.aperture.map((a) => ({ ...a, muro: id(a.muro) })));
    grande.testi.push(...p.testi.map((x) => ({ ...x, p: sp(x.p) })));
    grande.quote.push(...p.quote.map((q) => ({ ...q, p1: sp(q.p1), p2: sp(q.p2) })));
  }
const gj = JSON.stringify(grande);
const gdxf = mod.scrivi_dxf(gj);
console.log(`100 appartamenti: scrivi_dxf ${media(() => mod.scrivi_dxf(gj), 3).toFixed(0)} ms (${kb(gdxf.length)}), leggi_dxf ${media(() => mod.leggi_dxf(gdxf), 3).toFixed(0)} ms`);
if (process.env.SALVA) writeFileSync(process.env.SALVA, dxf);
