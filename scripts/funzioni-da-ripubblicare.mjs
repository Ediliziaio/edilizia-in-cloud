#!/usr/bin/env node
/**
 * Quali edge function vanno ripubblicate, dato l'elenco dei file cambiati.
 *
 * Il CI ripubblicava solo le funzioni con un file proprio modificato, e
 * saltava `supabase/functions/_shared/`. Ma le librerie condivise finiscono
 * DENTRO il pacchetto di ogni funzione al momento della pubblicazione: se
 * cambia una libreria e non si tocca anche il file della funzione, in
 * produzione resta la versione vecchia. È costato mezza giornata il
 * 10/09/2026: la correzione al client IMAP era su `_shared/imapSmtpClient.ts`,
 * `email-poll-inbox` l'ha presa (aveva anche un file suo modificato) e
 * `email-send` no — la posta si riceveva ma non si riusciva a inviarla.
 *
 * Qui si risale la catena: libreria cambiata → librerie che la importano →
 * funzioni che importano l'una o l'altra.
 *
 * Uso:  node scripts/funzioni-da-ripubblicare.mjs file1 file2 …
 *       git diff --name-only BASE HEAD | node scripts/funzioni-da-ripubblicare.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const RADICE = "supabase/functions";

/** Tutti i file .ts sotto una cartella. */
function fileTs(cartella) {
  const trovati = [];
  const gira = (dir) => {
    let voci;
    try { voci = readdirSync(dir); } catch { return; }
    for (const v of voci) {
      const p = join(dir, v);
      if (statSync(p).isDirectory()) gira(p);
      else if (v.endsWith(".ts")) trovati.push(p);
    }
  };
  gira(cartella);
  return trovati;
}

/**
 * I moduli condivisi importati da un file, per nome (`_shared/x`).
 *
 * Vanno seguiti due modi di scrivere lo stesso import: dalla cartella di una
 * funzione si scrive `../_shared/x`, ma fra librerie della stessa cartella si
 * scrive `./x` — ed è così che `emailProvider` tira dentro il client IMAP.
 */
function importati(percorso) {
  let testo = "";
  try { testo = readFileSync(percorso, "utf8"); } catch { return []; }
  const cartella = dirname(percorso).slice(RADICE.length + 1); // es. "_shared"
  const nomi = new Set();
  for (const m of testo.matchAll(/["']((?:\.{1,2}\/)+[A-Za-z0-9_./-]+?)(?:\.ts)?["']/g)) {
    const riferimento = m[1];
    const risolto = normalize(join(cartella, riferimento)).replace(/\\/g, "/");
    if (risolto.startsWith("_")) nomi.add(risolto);
  }
  return [...nomi];
}

export function funzioniDaRipubblicare(fileCambiati) {
  const dentroFunzioni = fileCambiati
    .map((f) => f.trim())
    .filter((f) => f.startsWith(`${RADICE}/`));

  const dirette = new Set();
  const librerieCambiate = new Set();
  for (const f of dentroFunzioni) {
    const parte = f.slice(RADICE.length + 1).split("/")[0];
    if (!parte) continue;
    if (parte.startsWith("_")) {
      const nome = f.slice(RADICE.length + 1).replace(/\.ts$/, "");
      librerieCambiate.add(nome);
    } else {
      dirette.add(parte);
    }
  }

  if (librerieCambiate.size === 0) return [...dirette].sort();

  // Una libreria che ne importa un'altra cambiata è cambiata anche lei.
  const libFile = fileTs(`${RADICE}/_shared`).concat(
    readdirSync(RADICE)
      .filter((d) => d.startsWith("_") && d !== "_shared")
      .flatMap((d) => fileTs(join(RADICE, d))),
  );
  let cresce = true;
  while (cresce) {
    cresce = false;
    for (const p of libFile) {
      const nome = p.slice(RADICE.length + 1).replace(/\.ts$/, "");
      if (librerieCambiate.has(nome)) continue;
      if (importati(p).some((dip) => librerieCambiate.has(dip))) {
        librerieCambiate.add(nome);
        cresce = true;
      }
    }
  }

  // Le funzioni che importano una qualunque delle librerie toccate.
  for (const cartella of readdirSync(RADICE)) {
    if (cartella.startsWith("_") || cartella.startsWith(".")) continue;
    let statistica;
    try { statistica = statSync(join(RADICE, cartella)); } catch { continue; }
    if (!statistica.isDirectory()) continue;
    const usa = fileTs(join(RADICE, cartella))
      .some((f) => importati(f).some((dip) => librerieCambiate.has(dip)));
    if (usa) dirette.add(cartella);
  }
  return [...dirette].sort();
}

// Eseguito da riga di comando: argomenti o stdin, una funzione per riga.
if (import.meta.url === `file://${process.argv[1]}`) {
  const daArgomenti = process.argv.slice(2);
  const file = daArgomenti.length > 0
    ? daArgomenti
    : readFileSync(0, "utf8").split("\n").filter(Boolean);
  console.log(funzioniDaRipubblicare(file).join(" "));
}
