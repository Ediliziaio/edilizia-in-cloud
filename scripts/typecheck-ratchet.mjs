#!/usr/bin/env node
/**
 * Controllo dei tipi con cricchetto (ratchet).
 *
 * PERCHE' NON UN SEMPLICE `tsc --noEmit`: il job CI lo faceva già, ma sul
 * tsconfig di radice, che è un contenitore vuoto (`files: []` + `references`).
 * Senza `--build` TypeScript non segue i rimandi: compilava ZERO file in meno
 * di un secondo ed era verde per costruzione. Gli errori di tipo sono entrati
 * per mesi senza che nessuno li vedesse — al primo controllo vero erano 1.542.
 *
 * Rimetterli a zero è un lavoro lungo. Nel frattempo questo script fa la cosa
 * che conta di più: **impedisce che il numero cresca**. Confronta gli errori
 * di oggi con la fotografia in `typecheck-baseline.json`, file per file:
 *
 *   - errori in più su un file  → CI ROSSA, con l'elenco di cosa è peggiorato
 *   - errori in meno            → CI VERDE, e ricorda di abbassare la soglia
 *   - file nuovo con errori     → CI ROSSA
 *
 * Il confronto è PER FILE e non solo sul totale: altrimenti sistemarne dieci
 * in un posto darebbe via libera a dieci nuovi da un'altra parte.
 *
 * Uso:
 *   node scripts/typecheck-ratchet.mjs             verifica (quello che fa la CI)
 *   node scripts/typecheck-ratchet.mjs --update    riscrive la fotografia
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const RADICE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(RADICE, "typecheck-baseline.json");
const AGGIORNA = process.argv.includes("--update");
const COMPILATORE = createRequire(import.meta.url).resolve("typescript/lib/tsc.js");

/** Esegue tsc e restituisce le righe di errore. tsc esce con 2 se ne trova.
 *  TYPECHECK_OUTPUT_FILE riusa l'output di una corsa gia' fatta: serve a
 *  provare lo script senza rifare venti minuti di compilazione. */
function eseguiTsc() {
  const gia = process.env.TYPECHECK_OUTPUT_FILE;
  if (gia) return readFileSync(gia, "utf8");
  try {
    execFileSync(
      process.execPath,
      [COMPILATORE, "--noEmit", "-p", "tsconfig.app.json", "--incremental", "false", "--pretty", "false"],
      { cwd: RADICE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=12288" } },
    );
    return "";
  } catch (e) {
    const output = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    // Only a completed compiler run with per-file diagnostics can be compared
    // with the baseline. A killed/OOM compiler or a broken tsconfig is NOT a
    // clean build, even when it emitted no diagnostics (or only a partial set).
    const completedWithDiagnostics = (e.status === 1 || e.status === 2)
      && !e.signal && !e.code
      && /^.+?\(\d+,\d+\): error TS\d+:/m.test(output)
      && !/^error TS\d+:/m.test(output);
    if (!completedWithDiagnostics) {
      throw new Error(`Controllo TypeScript non completato (exit=${e.status ?? "n/a"}, signal=${e.signal ?? "nessuno"}). ${output.slice(-1000)}`, { cause: e });
    }
    return output;
  }
}

/** { "src/foo.ts": 3, ... } — quanti errori per file. */
function contaPerFile(output) {
  const conta = {};
  for (const riga of output.split("\n")) {
    const m = riga.match(/^(.+?)\((\d+),(\d+)\): error TS\d+:/);
    if (!m) continue;
    const file = m[1].replace(/\\/g, "/");
    conta[file] = (conta[file] ?? 0) + 1;
  }
  return conta;
}

const output = eseguiTsc();
const attuale = contaPerFile(output);
const totale = Object.values(attuale).reduce((s, n) => s + n, 0);

if (AGGIORNA) {
  const ordinato = Object.fromEntries(Object.entries(attuale).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, `${JSON.stringify({ totale, file: ordinato }, null, 2)}\n`);
  console.log(`Fotografia aggiornata: ${totale} errori su ${Object.keys(attuale).length} file.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`Manca ${BASELINE}. Crealo con: node scripts/typecheck-ratchet.mjs --update`);
  process.exit(1);
}

const riferimento = JSON.parse(readFileSync(BASELINE, "utf8"));
const atteso = riferimento.file ?? {};

const peggiorati = [];
for (const [file, n] of Object.entries(attuale)) {
  const prima = atteso[file] ?? 0;
  if (n > prima) peggiorati.push({ file, prima, ora: n });
}
const migliorati = Object.entries(atteso)
  .filter(([file, prima]) => (attuale[file] ?? 0) < prima)
  .length;

console.log(`Errori di tipo: ${totale} (soglia: ${riferimento.totale ?? 0})`);

if (peggiorati.length > 0) {
  console.error("\nQuesti file hanno PIU' errori di prima:\n");
  for (const p of peggiorati.sort((a, b) => (b.ora - b.prima) - (a.ora - a.prima))) {
    console.error(`  ${p.file}: ${p.prima} → ${p.ora}  (+${p.ora - p.prima})`);
  }
  console.error("\nGli errori nuovi, per esteso:\n");
  const soloPeggiorati = new Set(peggiorati.map((p) => p.file));
  for (const riga of output.split("\n")) {
    const m = riga.match(/^(.+?)\(\d+,\d+\): error TS\d+:/);
    if (m && soloPeggiorati.has(m[1].replace(/\\/g, "/"))) console.error(`  ${riga}`);
  }
  console.error("\nIl debito di tipi esistente è tollerato, quello nuovo no.");
  process.exit(1);
}

if (migliorati > 0 || totale < (riferimento.totale ?? 0)) {
  console.log(
    `\nBene: ${migliorati} file migliorati, ${(riferimento.totale ?? 0) - totale} errori in meno.\n` +
    "Abbassa la soglia con:  node scripts/typecheck-ratchet.mjs --update",
  );
}
process.exit(0);
