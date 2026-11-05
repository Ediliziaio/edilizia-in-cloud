import { describe, expect, it } from "vitest";
import {
  controllaRicevuta, documentoDelCosto, formCostoVuoto, leggiImporto, percorsoRicevuta, rigaCostoCommessa,
} from "@/lib/costi/costoCommessa";
import { campiModificaCosto, categoriaDelTipo, formDaCosto, tipoDellaCategoria } from "@/lib/costi/costoCommessa";

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

describe("Il tipo del costo", () => {
  const base = { ...formCostoVuoto("2026-11-02"), descrizione: "Gru", importo: "122", aliquotaIva: "22" };
  it("un noleggio finisce fra i noleggi, un professionista fra i professionisti", () => {
    expect(rigaCostoCommessa({ ...base, tipo: "noleggio" }, { companyId: "c", orderId: "o" }).category).toBe("noleggio");
    expect(rigaCostoCommessa({ ...base, tipo: "professionista" }, { companyId: "c", orderId: "o" }).category).toBe("consulenze_professionali");
  });
  it("«Altro» non scrive una categoria, come prima", () => {
    expect(rigaCostoCommessa(base, { companyId: "c", orderId: "o" }).category).toBeNull();
    expect(categoriaDelTipo("altro")).toBeNull();
  });
  it("il fornitore è facoltativo", () => {
    expect(rigaCostoCommessa(base, { companyId: "c", orderId: "o" }).supplier_id).toBeNull();
    expect(rigaCostoCommessa({ ...base, fornitoreId: "s1" }, { companyId: "c", orderId: "o" }).supplier_id).toBe("s1");
  });
  it("riconosce anche le categorie scritte prima", () => {
    expect(tipoDellaCategoria("trasporti_noleggi")).toBe("noleggio");
    expect(tipoDellaCategoria("noleggio_mezzi_attrezzature")).toBe("noleggio");
    expect(tipoDellaCategoria("consulenze_professionali")).toBe("professionista");
    expect(tipoDellaCategoria("trasporti_logistica")).toBe("altro");
    expect(tipoDellaCategoria(null)).toBe("altro");
  });
});


describe("Modificare un costo", () => {
  const costo = { name: "Gru", category: "noleggio", supplier_id: "s1", amount: 100, vat_rate: 22, due_date: "2026-11-02", order_work_phase_id: "f1", senza_fattura: false, notes: "Nota", is_paid: false };
  it("rimette nel modulo l'importo con l'IVA, quello che si è scritto", () => {
    expect(formDaCosto(costo)).toMatchObject({ descrizione: "Gru", tipo: "noleggio", fornitoreId: "s1", importo: "122,00", aliquotaIva: "22", data: "2026-11-02", faseId: "f1", senzaFattura: false, note: "Nota", pagato: false });
  });
  it("salvando senza toccare niente l'imponibile non si sposta", () => {
    expect(rigaCostoCommessa(formDaCosto(costo), { companyId: "c", orderId: "o" }).amount).toBe(100);
    const scomodo = { ...costo, amount: 28.69, vat_rate: 22 };
    expect(rigaCostoCommessa(formDaCosto(scomodo), { companyId: "c", orderId: "o" }).amount).toBe(28.69);
  });
  it("regge i campi vuoti", () => {
    expect(formDaCosto({ ...costo, category: null, supplier_id: null, vat_rate: null, order_work_phase_id: null, notes: null })).toMatchObject({ tipo: "altro", fornitoreId: null, importo: "100,00", aliquotaIva: "0", faseId: "", note: "" });
  });
  it("aggiorna solo quello che il modulo decide", () => {
    const campi = campiModificaCosto(formDaCosto(costo), { companyId: "c", orderId: "o" });
    expect(Object.keys(campi).sort()).toEqual(["amount", "category", "due_date", "name", "notes", "order_work_phase_id", "senza_fattura", "supplier_id", "vat_rate"].sort());
  });
});
