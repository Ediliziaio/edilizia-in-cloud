import { describe, expect, it } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
import { fvSchedeFirma } from "../../../supabase/functions/_shared/fvSchedeFirma";
describe("Schede autorizzate FV nella copia da firmare", () => {
  it("rispetta prodotti, ordine, autorizzazione e azienda, senza duplicare il legacy", async () => {
    const db = new DbMinimo();
    db.tabelle.fv_componenti_progetto = [{ progetto_id: "p1", articolo_id: "a2", ordinamento: 2 }, { progetto_id: "p1", articolo_id: "a1", ordinamento: 1 }];
    db.tabelle.articoli_native = [{ id: "a1", company_id: "c1", scheda_tecnica_url: "https://example.test/uno.pdf" }, { id: "a2", company_id: "c1", scheda_tecnica_url: "https://example.test/legacy.pdf" }];
    db.tabelle.articoli_native_documenti = [
      { articolo_id: "a1", company_id: "c1", autorizzata: true, url: "https://example.test/uno.pdf", ordine: 1 },
      { articolo_id: "a2", company_id: "c1", autorizzata: true, url: "https://example.test/due.pdf", ordine: 2 },
      { articolo_id: "a1", company_id: "c2", autorizzata: true, url: "https://example.test/altra-azienda.pdf", ordine: 0 },
      { articolo_id: "a1", company_id: "c1", autorizzata: false, url: "https://example.test/non-autorizzata.pdf", ordine: 0 },
    ];
    expect(await fvSchedeFirma(db, "c1", "p1")).toEqual(["https://example.test/uno.pdf", "https://example.test/due.pdf", "https://example.test/legacy.pdf"]);
  });
  it("senza prodotti non aggiunge allegati", async () => {
    expect(await fvSchedeFirma(new DbMinimo(), "c1", "p1")).toEqual([]);
  });
  it("non salta in silenzio un errore di lettura dei prodotti", async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ error: { message: "offline" } }) }) }) }) };
    await expect(fvSchedeFirma(db, "c1", "p1")).rejects.toThrow("Impossibile leggere");
  });
});
