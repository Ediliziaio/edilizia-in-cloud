/**
 * Un preventivo spostato nel Cestino non è più un preventivo: non sta nell'elenco unico
 * né nei suoi numeri (pipeline, ricavo, tasso di conversione).
 *
 * Il 27/08/2026 la query dei Pavimenti perse il filtro `deleted_at` perché la colonna non
 * c'era («pav_progetti non ha soft-delete»); la colonna è arrivata il 30/08
 * (20280248000000_pav_progetti_cestino, presente in produzione) e il filtro non è mai
 * tornato: un progetto pavimenti cestinato restava in elenco, e nei KPI, finché il
 * cestino non lo eliminava davvero (30 giorni dopo).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SORGENTE = readFileSync(join(__dirname, "../../../components/marketing/preventivi/UnifiedPreventiviList.tsx"), "utf8");
const TABELLE = ["rst", "bgn", "tet", "clm", "ele", "idr", "pav", "pis"].map((s) => `${s}_progetti`);

/** La catena di una query: da `.from("<tabella>")` fino al `.limit(` che la chiude. */
function catena(tabella: string): string {
  const inizio = SORGENTE.indexOf(`.from("${tabella}")`);
  expect(inizio, `la query di ${tabella} non c'è più nell'elenco`).toBeGreaterThan(-1);
  const fine = SORGENTE.indexOf(".limit(", inizio);
  expect(fine).toBeGreaterThan(inizio);
  return SORGENTE.slice(inizio, fine);
}

describe("l'elenco unico dei preventivi edili", () => {
  it.each(TABELLE)("%s: la query esclude i preventivi nel Cestino", (tabella) => {
    expect(catena(tabella)).toContain('.is("deleted_at", null)');
  });
});
