/**
 * «Mezzi e attrezzature» si apre, e dice su quale mezzo viaggia l'attrezzo (24/09/2026).
 *
 * L'elenco e la scheda leggono anche il mezzo su cui è caricato un attrezzo
 * (su_mezzo_id → mezzi, la stessa tabella). Due modi sbagliati, visti nello
 * stesso giorno:
 * - col nome del vincolo, `sopra:mezzi!mezzi_su_mezzo_id_fkey(nome)`, PostgREST
 *   non trova la relazione di una tabella con sé stessa e rifiuta TUTTA la
 *   query (PGRST200): «Non riesco a caricare i mezzi» per ogni azienda;
 * - con `sopra:mezzi!su_mezzo_id(nome)` la query passa, ma è la direzione
 *   opposta: gli attrezzi caricati SU questo mezzo (un elenco), e il nome del
 *   mezzo sopra resta sempre vuoto.
 * Quello giusto, un oggetto: `sopra:su_mezzo_id(nome)`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sorgente = readFileSync(join(__dirname, "../../hooks/useMezzi.ts"), "utf8");
const select = sorgente.match(/const SELECT_CON_ASSEGNAZIONE =\s*"([^"]+)"/)?.[1] ?? "";

describe("la query di elenco e scheda mezzi", () => {
  it("c'è ancora, e legge il mezzo su cui viaggia", () => {
    expect(select).toContain("sopra:");
  });

  it("il mezzo sopra si legge dalla colonna, nella direzione giusta", () => {
    expect(select).toContain("sopra:su_mezzo_id(nome)");
    // Il nome del vincolo fa rifiutare tutta la query…
    expect(select).not.toMatch(/mezzi!mezzi_[a-z_]+_fkey/);
    // …e «mezzi!su_mezzo_id» restituisce gli attrezzi caricati sopra, non il mezzo.
    expect(select).not.toContain("mezzi!su_mezzo_id");
  });
});
