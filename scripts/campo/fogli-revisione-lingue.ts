#!/usr/bin/env bun
/**
 * Fogli di revisione per i madrelingua (piano 2026-11-23-lingua-piattaforma, punto 7).
 *
 * Dai dizionari dell'area operai genera, in docs/lingua/revisione/:
 * - un foglio per lingua (CSV, si apre con Excel o Numbers): italiano, traduzione, OK, correzione, note;
 * - glossario.csv: le parole e frasi brevi (fino a 3 parole) in tutte le lingue una accanto all'altra,
 *   da rivedere PRIMA del resto: se «rapportino» è giusto lì, è giusto ovunque.
 * Le varianti (spagnolo argentino e peruviano) hanno solo le righe che cambiano rispetto allo spagnolo.
 *
 * Uso: bun scripts/campo/fogli-revisione-lingue.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LINGUE } from "../../src/lib/campo/lingua/lingue";
import ro from "../../src/lib/campo/lingua/dizionari/ro";
import sq from "../../src/lib/campo/lingua/dizionari/sq";
import arMA from "../../src/lib/campo/lingua/dizionari/arMA";
import arEG from "../../src/lib/campo/lingua/dizionari/arEG";
import de from "../../src/lib/campo/lingua/dizionari/de";
import fr from "../../src/lib/campo/lingua/dizionari/fr";
import en from "../../src/lib/campo/lingua/dizionari/en";
import es from "../../src/lib/campo/lingua/dizionari/es";
import esAR from "../../src/lib/campo/lingua/dizionari/esAR";
import esPE from "../../src/lib/campo/lingua/dizionari/esPE";

const DIZ: Record<string, Readonly<Record<string, string>>> = {
  ro, sq, "ar-MA": arMA, "ar-EG": arEG, de, fr, en, es, "es-AR": esAR, "es-PE": esPE,
};
const USCITA = join(import.meta.dir, "../../docs/lingua/revisione");
const cella = (s: string) => `"${s.replace(/"/g, '""')}"`;
const riga = (celle: string[]) => celle.map(cella).join(";");
// Il punto e virgola e il BOM fanno aprire bene il file all'Excel italiano, accenti e arabo compresi.
const csv = (righe: string[][]) => "﻿" + righe.map(riga).join("\r\n") + "\r\n";

mkdirSync(USCITA, { recursive: true });
const tutte = [...new Set(Object.values(DIZ).flatMap(d => Object.keys(d)))].sort((a, b) => a.localeCompare(b, "it"));

for (const l of LINGUE) {
  if (l.codice === "it") continue;
  const d = DIZ[l.codice];
  const variante = l.codice === "es-AR" || l.codice === "es-PE";
  const chiavi = variante ? tutte.filter(k => d[k] !== undefined && d[k] !== es[k]) : tutte;
  const righe = [["Italiano", `${l.nome} (${l.nomeItaliano})`, "OK? (sì/no)", "Correzione", "Note"]];
  for (const k of chiavi) righe.push([k, d[k] ?? "— MANCA —", "", "", ""]);
  writeFileSync(join(USCITA, `${l.codice}.csv`), csv(righe));
  console.log(`${l.codice}.csv: ${chiavi.length} righe${variante ? " (solo quelle diverse dallo spagnolo)" : ""}`);
}

const brevi = tutte.filter(k => !/[{}.?!:]/.test(k) && k.trim().split(/\s+/).length <= 3);
const codici = LINGUE.filter(l => l.codice !== "it").map(l => l.codice);
writeFileSync(
  join(USCITA, "glossario.csv"),
  csv([["Italiano", ...LINGUE.filter(l => l.codice !== "it").map(l => l.nomeItaliano)], ...brevi.map(k => [k, ...codici.map(c => DIZ[c][k] ?? "")])]),
);
console.log(`glossario.csv: ${brevi.length} parole e frasi brevi`);
