import { describe, expect, it } from "vitest";
import {
  controllaRicevuta, documentoDelCosto, formCostoVuoto, leggiImporto, percorsoRicevuta, rigaCostoCommessa,
} from "@/lib/costi/costoCommessa";

const ids = { companyId: "azienda-1", orderId: "commessa-1" };

describe("costo registrato dalla commessa", () => {
  it("la tassa comunale da 350 € senza IVA entra intera, una tantum, sulla commessa", () => {
    const riga = rigaCostoCommessa({ ...formCostoVuoto("2026-10-29"), descrizione: " Tassa comunale ", importo: "350" }, ids);
    expect(riga).toMatchObject({
      company_id: "azienda-1", order_id: "commessa-1", name: "Tassa comunale",
      amount: 350, vat_rate: 0, cost_type: "variable", recurrence: "once", recurrence_auto: false,
      due_date: "2026-10-29", is_paid: false, senza_fattura: true, order_work_phase_id: null,
    });
    // Senza ripartizione: v_ordine_marginalita lo conta come costo diretto della commessa.
    expect(riga.allocations).toEqual([]);
  });

  it("con IVA nel margine va l'imponibile, non il pagato", () => {
    const riga = rigaCostoCommessa({ ...formCostoVuoto("2026-10-29"), descrizione: "Diritti", importo: "122,00", aliquotaIva: "22" }, ids);
    expect(riga.amount).toBe(100);
    expect(riga.vat_rate).toBe(22);
  });

  it("la fase scelta si porta dietro, vuota resta nulla", () => {
    expect(rigaCostoCommessa({ ...formCostoVuoto("2026-10-29"), descrizione: "Bollo", importo: "16", faseId: "fase-9" }, ids).order_work_phase_id).toBe("fase-9");
  });

  it("rifiuta descrizione vuota, importo zero e data mancante", () => {
    const base = { ...formCostoVuoto("2026-10-29"), descrizione: "Tassa", importo: "10" };
    expect(() => rigaCostoCommessa({ ...base, descrizione: "  " }, ids)).toThrow(/che costo/);
    expect(() => rigaCostoCommessa({ ...base, importo: "0" }, ids)).toThrow(/maggiore di zero/);
    expect(() => rigaCostoCommessa({ ...base, importo: "abc" }, ids)).toThrow(/maggiore di zero/);
    expect(() => rigaCostoCommessa({ ...base, data: "" }, ids)).toThrow(/data/);
  });

  it("legge gli importi come si scrivono", () => {
    expect(leggiImporto("1.250,50")).toBe(1250.5);
    expect(leggiImporto("350")).toBe(350);
    expect(leggiImporto("350.5")).toBe(350.5);
    expect(Number.isNaN(leggiImporto(""))).toBe(true);
  });

  it("la ricevuta va sotto orders/<commessa>/costi, dove le policy del bucket la riconoscono", () => {
    expect(percorsoRicevuta("commessa-1", "Ricevuta Comune è pagata.pdf", "abc")).toBe("orders/commessa-1/costi/abc-Ricevuta-Comune-e-pagata.pdf");
    expect(percorsoRicevuta("commessa-1", "", "abc")).toBe("orders/commessa-1/costi/abc-ricevuta");
  });

  it("accetta PDF e foto fino a 10 MB", () => {
    expect(controllaRicevuta({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(controllaRicevuta({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(controllaRicevuta({ type: "application/zip", size: 1000 })).toMatch(/PDF o una foto/);
    expect(controllaRicevuta({ type: "application/pdf", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });

  it("la fattura collegata vince sul «senza fattura»", () => {
    expect(documentoDelCosto({ senza_fattura: true }, true)).toBe("fattura");
    expect(documentoDelCosto({ senza_fattura: true }, false)).toBe("senza_fattura");
    expect(documentoDelCosto({ senza_fattura: false }, false)).toBe("in_attesa");
  });
});
