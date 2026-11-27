/**
 * Cricchetto: `e instanceof Error ? e.message : String(e)` non torna in `src/`.
 *
 * Su un PostgrestError (`if (error) throw error`) quell'espressione dà «[object Object]»:
 * il 27/11/2026 un'impresa cliente l'ha letto al posto di «Questa fattura è stata incassata
 * dallo scadenzario: annulla prima l'incasso dallo scadenzario.». Al suo posto:
 * - `messaggioErrore(e)` per mostrare l'errore all'utente;
 * - `testoGrezzoErrore(e)` per riconoscerlo (`msg.includes(…)`), senza traduzioni.
 * Entrambe in `src/lib/messaggioErrore.ts`.
 *
 * Il conteggio comprende anche i file che altre sessioni avevano in lavorazione il 27/11
 * (BankMovementDetail, RipartizioneMovimento, FattureRicevutePage, PagamentiSegnatiDaSistemare):
 * non c'è eccezione per nessuno.
 *
 * Se il numero scende, abbassa SOGLIA. Se sale, usa messaggioErrore: non alzarla.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOGLIA = 0;

const SCHEMA = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s+instanceof\s+Error\s*\?\s*\1\.message\s*:\s*String\(/g;

function fileSorgente(cartella: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(cartella)) {
    if (nome === "node_modules") continue;
    const percorso = join(cartella, nome);
    if (statSync(percorso).isDirectory()) out.push(...fileSorgente(percorso));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(nome)) out.push(percorso);
  }
  return out;
}

describe("cricchetto: niente «[object Object]» negli errori", () => {
  it(`al massimo ${SOGLIA} occorrenze di «X instanceof Error ? X.message : String(X)» in src/`, () => {
    const trovate: string[] = [];
    for (const file of fileSorgente("src")) {
      if (file.endsWith("erroriObjectObjectCricchetto.test.ts")) continue; // i suoi esempi
      const testo = readFileSync(file, "utf8");
      for (const m of testo.matchAll(SCHEMA)) {
        const riga = testo.slice(0, m.index).split("\n").length;
        trovate.push(`${file}:${riga}`);
      }
    }
    expect(trovate.length, `Usa messaggioErrore(e) (o testoGrezzoErrore(e) per riconoscere l'errore):\n${trovate.join("\n")}`)
      .toBeLessThanOrEqual(SOGLIA);
  });

  it("lo schema riconosce le varianti che portano a «[object Object]»", () => {
    const casi = [
      "e instanceof Error ? e.message : String(e)",
      "err instanceof Error?err.message:String(err)",
      "result.reason instanceof Error ? result.reason.message : String(result.reason)",
      "e instanceof Error\n  ? e.message\n  : String((e as { message?: string })?.message ?? e)",
    ];
    for (const c of casi) expect([...c.matchAll(SCHEMA)].length, c).toBe(1);
    expect([..."e instanceof Error ? e.message : t(\"Non riuscito\")".matchAll(SCHEMA)].length).toBe(0);
  });
});
