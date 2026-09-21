// Rigenera supabase/functions/_shared/iconePreventivo.ts dalle icone di lucide-react.
// Uso: node scripts/genera-icone-preventivo.mjs
// Per aggiungere un'icona: una riga nella mappa qui sotto (nome nel preventivo → nome Lucide).
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const versione = require("lucide-react/package.json").version;
const base = "node_modules/lucide-react/dist/esm/icons/";
const mappa = {
  sopralluogo: "clipboard-list", misura: "ruler", progettazione: "pencil-ruler", trasporto: "truck", materiali: "package",
  installazione: "wrench", demolizione: "hammer", protezione: "shield-check", smaltimento: "recycle", pulizia: "sparkles",
  collaudo: "circle-check-big", documenti: "file-text", assistenza: "headset", garanzia: "badge-check", calendario: "calendar-days",
  pagamento: "euro", firma: "pen-line", tecnico: "hard-hat", foto: "camera", conformita: "file-check", risparmio: "piggy-bank",
  energia: "zap", sole: "sun", batteria: "battery-charging", detrazione: "percent", contatto: "phone", acqua: "droplets",
  polvere: "wind", porta: "door-closed", escluso: "ban", pratiche: "stamp", casa: "house", temperatura: "thermometer",
  rete: "plug-zap", monitoraggio: "smartphone", ventilazione: "fan", strati: "layers", fiamma: "flame", chiavi: "key-round",
  verifica: "square-check-big", no: "circle-x", finiture: "paint-roller", muratura: "brick-wall",
};
const out = {};
for (const [nome, file] of Object.entries(mappa)) {
  const src = fs.readFileSync(`${base}${file}.js`, "utf8");
  const m = src.match(/createLucideIcon\("[^"]+",\s*(\[[\s\S]*\])\);/);
  if (!m) throw new Error(`icona non trovata: ${file}`);
  out[nome] = vm.runInNewContext(`(${m[1]})`).map(([tag, attrs]) => {
    const { key: _chiave, ...resto } = attrs;
    return [tag, resto];
  });
}
const righe = Object.entries(out).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join("\n");
const ts = `/**
 * Le icone delle pagine del preventivo, uguali in tutti i motori (react-pdf e HTML).
 *
 * Sono i disegni di Lucide (lucide-react ${versione}, licenza ISC, © Lucide
 * Contributors): gli stessi dell'interfaccia dell'app, a tratto, su una griglia di
 * 24 × 24, colorati dal documento col colore dell'azienda. Le icone del pacchetto
 * di immagini avevano la scritta dentro e un blu fisso: qui le disegna il PDF.
 *
 * File generato da scripts/genera-icone-preventivo.mjs: non modificarlo a mano.
 */

export type TagIcona = "path" | "circle" | "rect" | "line" | "polyline" | "polygon" | "ellipse";
export type NodoIcona = [TagIcona, Record<string, string | number>];

export const ICONE = {
${righe}
} satisfies Record<string, NodoIcona[]>;

export type NomeIcona = keyof typeof ICONE;

export const eIcona = (v: unknown): v is NomeIcona => typeof v === "string" && v in ICONE;

/** L'icona come SVG in linea, per le pagine HTML (Fotovoltaico, pagina online dei Serramenti). */
export function iconaSvg(nome: NomeIcona, colore: string, lato = 18, spessore = 2): string {
  const attr = (a: Record<string, string | number>) =>
    Object.entries(a).map(([k, v]) => \`\${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}="\${String(v).replace(/"/g, "&quot;")}"\`).join(" ");
  const corpo = (ICONE[nome] as NodoIcona[]).map(([tag, a]) => \`<\${tag} \${attr(a)}/>\`).join("");
  return \`<svg xmlns="http://www.w3.org/2000/svg" width="\${lato}" height="\${lato}" viewBox="0 0 24 24" fill="none" stroke="\${colore}" stroke-width="\${spessore}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">\${corpo}</svg>\`;
}
`;
fs.writeFileSync("supabase/functions/_shared/iconePreventivo.ts", ts);
console.log(`${Object.keys(out).length} icone scritte in supabase/functions/_shared/iconePreventivo.ts`);
