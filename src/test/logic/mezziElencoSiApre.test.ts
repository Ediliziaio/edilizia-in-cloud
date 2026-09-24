/**
 * «Mezzi e attrezzature» si apre (24/09/2026).
 *
 * L'elenco e la scheda del mezzo leggono anche il mezzo su cui viaggia
 * (su_mezzo_id → mezzi). Scritto col nome del vincolo,
 * `sopra:mezzi!mezzi_su_mezzo_id_fkey(nome)`, PostgREST non trova la relazione
 * di una tabella con sé stessa e rifiuta TUTTA la query (PGRST200 «Could not
 * find a relationship between 'mezzi' and 'mezzi'»): «Non riesco a caricare i
 * mezzi» per ogni azienda, anche dopo il reload della cache. Con la colonna
 * (`mezzi!su_mezzo_id`) la stessa query passa: provato sull'API vera.
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

  it("la relazione con sé stessa passa dalla colonna, non dal nome del vincolo", () => {
    expect(select).toContain("sopra:mezzi!su_mezzo_id(nome)");
    expect(select).not.toMatch(/mezzi!mezzi_[a-z_]+_fkey/);
  });
});
