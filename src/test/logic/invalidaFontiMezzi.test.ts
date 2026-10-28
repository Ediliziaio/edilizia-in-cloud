import { QueryClient } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import { invalidaFontiSicurezzaMezzi } from "@/lib/sicurezza/invalidaFontiMezzi";
describe("Riallineamento inventario, Sicurezza e POS", () => {
  it("invalida tutte le commesse dell’azienda interessata senza toccare altre aziende o altri archivi", async () => {
    const qc = new QueryClient();
    const coinvolte = [
      ["pos-mezzi", "az", "c1"],
      ["pos-mezzi", "az", "c2"],
      ["pos-documenti-mezzo", "az", "c1", "m1"],
      ["sicurezza-commessa-ponteggi", "az", "c1", "2026-11-10"],
    ];
    const altre = [
      ["pos-mezzi", "altra", "c1"],
      ["pos-documenti-mezzo", "altra", "c1", "m1"],
      ["verifiche-itp", "az", "c1"],
    ];
    for (const k of [...coinvolte, ...altre])
      qc.setQueryData(k, { versione: 1 });
    await invalidaFontiSicurezzaMezzi(qc, "az");
    for (const k of coinvolte)
      expect(qc.getQueryState(k)?.isInvalidated).toBe(true);
    for (const k of altre)
      expect(qc.getQueryState(k)?.isInvalidated).toBe(false);
    qc.clear();
  });
  it("senza azienda non invalida indiscriminatamente tutti i dati", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["pos-mezzi", "az", "c1"], {});
    await invalidaFontiSicurezzaMezzi(qc, null);
    expect(qc.getQueryState(["pos-mezzi", "az", "c1"])?.isInvalidated).toBe(
      false,
    );
    qc.clear();
  });
});
