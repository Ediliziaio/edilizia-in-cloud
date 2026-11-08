/**
 * Revisioni dei documenti di commessa. La regola «approvando una revisione,
 * quella approvata prima con lo stesso codice diventa superata» sta nel
 * database (documento_commessa_revisione, 20281222220000) ed è stata provata il
 * 07/11/2026: rev. A approvata, rev. B dello stesso codice approvata → A
 * superata, B sostituisce A; un cliente non può segnarle.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { etichettaStato, haRevisione, testoRevisione } from "@/lib/commesse/revisioniDocumenti";

describe("revisioni dei documenti di commessa", () => {
  it("l'etichetta dice tipo, codice e revisione", () => {
    expect(testoRevisione({ tipo_documento: "tavola", codice_elaborato: "A-01", revisione: "B" })).toBe("Tavola A-01 · Rev. B");
    expect(testoRevisione({ tipo_documento: "computo" })).toBe("Computo metrico");
    expect(testoRevisione({ revisione: "02" })).toBe("Rev. 02");
  });

  it("stato e presenza dei dati", () => {
    expect(etichettaStato("approvato")).toBe("Approvato");
    expect(etichettaStato("superato")).toBe("Superato");
    expect(etichettaStato(null)).toBeNull();
    expect(haRevisione({})).toBe(false);
    expect(haRevisione({ codice_elaborato: "  " })).toBe(false);
    expect(haRevisione({ stato_revisione: "in_lavorazione" })).toBe(true);
  });

  it("nel database: l'approvazione rende superata la revisione di prima, solo per chi modifica la commessa", () => {
    const sql = readFileSync("supabase/migrations/20281222220000_documenti_commessa_revisioni.sql", "utf8");
    expect(sql).toMatch(/set stato_revisione = 'superato'/);
    expect(sql).toMatch(/puo_modificare_commessa\(doc\.order_id\)/);
    expect(sql).toMatch(/revoke all on function public\.documento_commessa_revisione\(uuid, text, text, text, text\) from public, anon/);
  });
});
