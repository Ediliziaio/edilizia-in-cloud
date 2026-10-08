/// <reference types="node" />
/**
 * I caratteri del PDF fotovoltaico (HTML stampato dal browser), 07/10/2026.
 * Misurati sul PDF vero con le foto: mediana 9 punti, 43% dei caratteri sotto i 9 e 25% sotto gli 8 (risposte a 8,5,
 * didascalie e note a 6,5–7, schede a 7,5–8). Ora le frasi stanno a 9 punti o più; sotto restano le etichette in
 * maiuscolo e le note brevi, mai sotto i 7,5. I testi legali (condizioni, clausole, recesso) sono impaginati a caratteri
 * e restano come sono: più grandi sborderebbero dalla pagina a misura fissa.
 * Provato anche a occhio e con un browser vero: stesse pagine di prima in sette scenari (12 e 30 componenti, 18 articoli).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve("supabase/functions/_shared/fvHtmlTemplate.ts"), "utf8");

/** Le righe con un corpo: la barra dei comandi (non si stampa) e i testi legali sono fuori dalla scala. */
const ESCLUSE = [".cond-", ".legal-box", ".recesso", ".pdf-action", "dopo averle rilette", "Segue la pagina della firma", "MODULO_RECESSO.istruzioni"];
const corpi = src.split("\n")
  .filter((r) => r.includes("font-size") && !ESCLUSE.some((e) => r.includes(e)))
  .flatMap((r) => Array.from(r.matchAll(/font-size:\s*([0-9.]+)pt/g)).map((m) => ({ pt: Number(m[1]), riga: r.trim().slice(0, 90) })));

/** Il corpo dichiarato per un selettore: `.callout { … font-size: 10pt; … }`. */
const corpoDi = (selettore: string): number => {
  const esc = selettore.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`${esc}\\s*\\{[^}]*font-size:\\s*([0-9.]+)pt`).exec(src);
  if (!m) throw new Error(`selettore non trovato: ${selettore}`);
  return Number(m[1]);
};

describe("fotovoltaico PDF: i caratteri", () => {
  it("nessun corpo sotto i 7,5 punti (etichette in maiuscolo, note brevi comprese), fuori dai testi legali", () => {
    expect(corpi.length).toBeGreaterThan(60);
    expect(corpi.filter((c) => c.pt < 7.5).map((c) => `${c.pt} pt: ${c.riga}`)).toEqual([]);
  });

  it.each([
    ".blocco-voce-testo", ".qa-a", ".callout", ".bullets li", ".tl-desc", ".guarantee-card .g-desc", ".co2-carta .desc",
    ".eq-row .eq-desc", ".product-info p", ".service-title", ".forn-specs", ".sig-box .sig-dich", ".voto-conta",
  ])("le frasi di «%s» si leggono a 9 punti o più", (selettore) => {
    expect(corpoDi(selettore)).toBeGreaterThanOrEqual(9);
  });

  it("le condizioni e il recesso, impaginati a caratteri, non cambiano corpo", () => {
    expect(corpoDi(".cond-testo")).toBe(8.2);
    expect(corpoDi(".cond-testo .cond-art")).toBe(8.6);
    expect(corpoDi(".legal-box")).toBe(7.8);
    expect(corpoDi(".recesso-box")).toBe(9);
  });

  it("la tabella della fornitura tiene la stessa altezza sopra le righe (54 mm), così sette righe per pagina ci stanno come prima", () => {
    // Le stime di altezza (altezzaRigaFornitura, 198 mm) sono tarate su questa testata: caption 8 mm sopra, intestazione di colonna 2,5 mm sotto.
    expect(src).toMatch(/\.forn-caption \{ margin-top: 8mm;/);
    expect(src).toMatch(/\.forn-tabella thead th \{[^}]*padding: 0 4mm 2\.5mm;/);
  });
});
