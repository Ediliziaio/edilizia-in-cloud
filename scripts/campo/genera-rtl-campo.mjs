#!/usr/bin/env node
/**
 * Genera src/lib/campo/lingua/rtlCampo.css: le classi «fisiche» (ml-, pr-, left-, text-left, rounded-l…) che le
 * schermate dell'area operai usano, girate dall'altro lato quando la pagina è in arabo (`<html dir="rtl">`).
 *
 * Perché un foglio e non le classi logiche (ms-/me-/start-) nelle schermate: le schermate le sta traducendo
 * un'altra sessione (23/11/2026), toccarle insieme vuol dire pestarsi i piedi. In italiano questo foglio non fa
 * niente (vale solo sotto [dir="rtl"]). Quando le schermate passeranno alle classi logiche, si toglie.
 *
 * Specificità: lo spostamento `html[dir=rtl] body .ml-2 { mr }` (0,2,2) batte il suo azzeramento
 * `html[dir=rtl] .ml-2 { ml: 0 }` (0,2,1), che batte la classe di Tailwind (0,1,0) in qualunque ordine si
 * carichino i fogli. Così `ml-2 mr-4` diventa correttamente `mr-2 ml-4`.
 *
 * Uso: node scripts/campo/genera-rtl-campo.mjs        (scrive il foglio)
 *      node scripts/campo/genera-rtl-campo.mjs --json (stampa le classi trovate; lo usa il test)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Due livelli sopra questo file. (Niente `new URL(…, import.meta.url)`: Vite lo riscrive come indirizzo web.)
const RADICE = import.meta.url.startsWith("file:") ? join(dirname(fileURLToPath(import.meta.url)), "..", "..") : process.cwd();
export const SORGENTI = [
  "src/pages/campo",
  "src/components/campo",
  "src/components/layouts/CampoLayout.tsx",
  "src/pages/azienda/impostazioni/MioProfilo.tsx",
  "src/components/notifications/NotificheSuQuestoDispositivo.tsx",
  "src/components/ui",
  // Anche queste le vede l'operaio (tradotte dalla sessione di collaudo il 23/11/2026).
  "src/components/calendar/mappa",
  "src/pages/azienda/InternalChat.tsx",
  // Editor del sopralluogo (l'operaio lo apre da /campo/sopralluoghi/:id).
  "src/pages/azienda/sopralluoghi/SopralluogoEditor.tsx",
  "src/components/sopralluoghi",
  "src/components/surveys/engine",
  // Campanella comune (nel campo è tradotta).
  "src/components/notifications/NotificationsBellPopover.tsx",
  "src/components/notifications/PannelloNotifiche.tsx",
];
const USCITA = "src/lib/campo/lingua/rtlCampo.css";

const PREFISSI = ["", "sm:", "md:", "lg:", "xl:", "max-sm:", "max-md:", "max-lg:"];
const VAL = String.raw`(?:\d+(?:\.5)?|px|auto|full|1\/2|1\/3|2\/3|1\/4|3\/4|\[[^\]\s"'\`]+\])`;
const FAMIGLIE = [
  { re: String.raw`-?[mp][lr]-${VAL}` },
  { re: String.raw`-?(?:left|right)-${VAL}` },
  { re: String.raw`text-(?:left|right)` },
  { re: String.raw`border-[lr](?:-(?:0|2|4|8|\[[^\]\s]+\]))?` },
  { re: String.raw`rounded-(?:[lr]|tl|tr|bl|br)(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|\[[^\]\s]+\]))?` },
  { re: String.raw`space-x-${VAL}` },
  { re: String.raw`float-(?:left|right)` },
];
const PREFISSO_RE = String.raw`(?:sm:|md:|lg:|xl:|max-sm:|max-md:|max-lg:)?`;
const TOKEN = new RegExp(String.raw`(?<=^|[\s"'\`{(])(${PREFISSO_RE}(?:${FAMIGLIE.map(f => f.re).join("|")}))(?=$|[\s"'\`})])`, "gm");

function file(dir) {
  const pieno = join(RADICE, dir);
  if (statSync(pieno).isFile()) return [pieno];
  return readdirSync(pieno, { withFileTypes: true }).flatMap(v => {
    const p = join(pieno, v.name);
    if (v.isDirectory()) return file(relative(RADICE, p));
    return /\.(tsx?|jsx?)$/.test(v.name) && !/\.test\./.test(v.name) ? [p] : [];
  });
}

export function classiFisiche(sorgenti = SORGENTI) {
  const trovate = new Set();
  for (const d of sorgenti) {
    for (const f of file(d)) {
      for (const m of readFileSync(f, "utf8").matchAll(TOKEN)) trovate.add(m[1]);
    }
  }
  return [...trovate].sort((a, b) => ordine(a) - ordine(b) || a.localeCompare(b));
}

function ordine(c) {
  const p = PREFISSI.findIndex(x => x && c.startsWith(x));
  return p < 0 ? 0 : p;
}

const MEDIA = {
  "sm:": "(min-width: 640px)", "md:": "(min-width: 768px)", "lg:": "(min-width: 1024px)", "xl:": "(min-width: 1280px)",
  "max-sm:": "not all and (min-width: 640px)", "max-md:": "not all and (min-width: 768px)", "max-lg:": "not all and (min-width: 1024px)",
};
const FRAZIONI = { "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "3/4": "75%" };
const RAGGI = { none: "0px", sm: "0.125rem", "": "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", full: "9999px" };

/** Il valore CSS di una misura di Tailwind (scala standard: n × 0,25rem). */
export function misura(v, negativo = false) {
  let x;
  if (v.startsWith("[")) x = v.slice(1, -1).replace(/_/g, " ");
  else if (v === "px") x = "1px";
  else if (v === "auto") return "auto";
  else if (v === "full") x = "100%";
  else if (FRAZIONI[v]) x = FRAZIONI[v];
  else if (/^\d+(\.5)?$/.test(v)) x = v === "0" ? "0px" : `${Number(v) * 0.25}rem`;
  else throw new Error(`Misura non prevista: ${v}`);
  return negativo ? `calc(${x} * -1)` : x;
}

const OPPOSTO = { left: "right", right: "left" };
const PROP = { m: "margin", p: "padding" };

/**
 * Per una classe: { sposta: dichiarazioni del lato giusto, azzera: dichiarazioni che spengono il lato sbagliato }.
 * null = per l'arabo non serve niente (non esiste).
 */
export function regola(classe) {
  const prefisso = PREFISSI.find(p => p && classe.startsWith(p)) ?? "";
  const corpo = classe.slice(prefisso.length);
  const neg = corpo.startsWith("-");
  const c = neg ? corpo.slice(1) : corpo;
  let m;
  if ((m = c.match(/^([mp])([lr])-(.+)$/))) {
    const lato = m[2] === "l" ? "left" : "right";
    return { sposta: `${PROP[m[1]]}-${OPPOSTO[lato]}: ${misura(m[3], neg)}`, azzera: `${PROP[m[1]]}-${lato}: 0px` };
  }
  // Centrato con translate (finestre di dialogo): è simmetrico, non si gira.
  if (/^(left|right)-(1\/2|\[50%\])$/.test(c)) return { simmetrica: true };
  if ((m = c.match(/^(left|right)-(.+)$/))) return { sposta: `${OPPOSTO[m[1]]}: ${misura(m[2], neg)}`, azzera: `${m[1]}: auto` };
  if ((m = c.match(/^text-(left|right)$/))) return { sposta: `text-align: ${OPPOSTO[m[1]]}`, azzera: null };
  if ((m = c.match(/^float-(left|right)$/))) return { sposta: `float: ${OPPOSTO[m[1]]}`, azzera: null };
  if ((m = c.match(/^border-([lr])(?:-(.+))?$/))) {
    const lato = m[1] === "l" ? "left" : "right";
    const w = m[2] === undefined ? "1px" : m[2].startsWith("[") ? m[2].slice(1, -1) : `${m[2]}px`;
    return { sposta: `border-${OPPOSTO[lato]}-width: ${w}`, azzera: `border-${lato}-width: 0px` };
  }
  if ((m = c.match(/^rounded-([lr]|tl|tr|bl|br)(?:-(.+))?$/))) {
    const r = m[2] === undefined ? RAGGI[""] : m[2].startsWith("[") ? m[2].slice(1, -1) : RAGGI[m[2]];
    const angoli = { l: ["top-left", "bottom-left"], r: ["top-right", "bottom-right"], tl: ["top-left"], tr: ["top-right"], bl: ["bottom-left"], br: ["bottom-right"] }[m[1]];
    const specchio = a => a.replace(/left|right/, x => OPPOSTO[x]);
    return {
      sposta: angoli.map(a => `border-${specchio(a)}-radius: ${r}`).join("; "),
      azzera: angoli.map(a => `border-${a}-radius: 0px`).join("; "),
    };
  }
  if (c.startsWith("space-x-")) return { spazio: true };
  throw new Error(`Classe non prevista: ${classe}`);
}

/** Come Tailwind scrive il nome della classe in un selettore. */
export const selettore = c => "." + c.replace(/([:./\[\]%#(),])/g, "\\$1");

export function generaCss(classi) {
  const righe = [
    "/* GENERATO da scripts/campo/genera-rtl-campo.mjs — non modificare a mano. */",
    "/* Arabo (darija, egiziano): le classi «fisiche» delle schermate del campo girate dall'altro lato. */",
    "/* Vale solo sotto <html dir=\"rtl\">: in italiano e nelle altre lingue non fa niente. */",
    "",
    "/* Frecce e icone con un verso: in arabo «indietro» punta a destra. */",
    'html[dir="rtl"] :is(.lucide-chevron-left, .lucide-chevron-right, .lucide-chevrons-left, .lucide-chevrons-right,',
    "  .lucide-arrow-left, .lucide-arrow-right, .lucide-move-left, .lucide-move-right, .lucide-log-in, .lucide-log-out,",
    "  .lucide-send, .lucide-send-horizontal, .lucide-reply, .lucide-forward, .lucide-undo-2, .lucide-redo-2) {",
    "  scale: -1 1;",
    "}",
    "",
  ];
  for (const c of classi) {
    const r = regola(c);
    const prefisso = PREFISSI.find(p => p && c.startsWith(p)) ?? "";
    const sel = selettore(c);
    const blocco = [];
    if (r.simmetrica) continue;
    if (r.spazio) blocco.push(`html[dir="rtl"] ${sel} > :not([hidden]) ~ :not([hidden]) { --tw-space-x-reverse: 1; }`);
    else {
      blocco.push(`html[dir="rtl"] body ${sel} { ${r.sposta}; }`);
      if (r.azzera) blocco.push(`html[dir="rtl"] ${sel} { ${r.azzera}; }`);
    }
    if (MEDIA[prefisso]) righe.push(`@media ${MEDIA[prefisso]} {`, ...blocco.map(b => `  ${b}`), "}");
    else righe.push(...blocco);
  }
  return righe.join("\n") + "\n";
}

if (import.meta.url.startsWith("file:") && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const classi = classiFisiche();
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(classi));
  } else {
    writeFileSync(join(RADICE, USCITA), generaCss(classi));
    console.log(`${USCITA}: ${classi.length} classi`);
  }
}
