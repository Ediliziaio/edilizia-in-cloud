import { describe, expect, it } from "vitest";
import { erroreUscita, formDaUscita, meseMostrato, partiUguali, rigaUscita, type FormUscita, type UscitaSalvata } from "@/lib/costi/usciteSenzaFattura";

const base: FormUscita = { descrizione: "Bollo furgone", imponibile: "1.234,50", aliquota: "0", data: "2026-03-15", mese: "", riferimento: "", fornitoreId: "", commesse: [{ id: "", pct: "100" }], mezzoId: "", pagata: true, note: "" };

describe("uscita senza fattura", () => {
  it("un'uscita completa si può salvare", () => expect(erroreUscita(base)).toBeNull());
  it("chiede descrizione, importo e data", () => {
    expect(erroreUscita({ ...base, descrizione: " " })).toMatch(/di cosa/);
    expect(erroreUscita({ ...base, imponibile: "0" })).toMatch(/importo/);
    expect(erroreUscita({ ...base, imponibile: "abc" })).toMatch(/importo/);
    expect(erroreUscita({ ...base, data: "" })).toMatch(/data/);
    expect(erroreUscita({ ...base, aliquota: "120" })).toMatch(/aliquota/);
  });
  it("è un costo senza fattura, con l'importo all'italiana", () => {
    const r = rigaUscita(base, "co");
    expect(r).toMatchObject({ senza_fattura: true, amount: 1234.5, vat_rate: 0, due_date: "2026-03-15", is_paid: true, paid_date: "2026-03-15", supplier_id: null });
  });
  it("il mese di competenza è quello scelto, altrimenti quello della data", () => {
    expect(rigaUscita(base, "co").mese_competenza).toBe("2026-03-01");
    expect(rigaUscita({ ...base, mese: "2026-01" }, "co").mese_competenza).toBe("2026-01-01");
  });
  it("da pagare non ha la data di pagamento", () => {
    expect(rigaUscita({ ...base, pagata: false }, "co").paid_date).toBeNull();
  });

  it("senza commessa è un costo generale; con una sola, tutto a lei", () => {
    expect(rigaUscita(base, "co")).toMatchObject({ order_id: null, allocations: null });
    expect(rigaUscita({ ...base, commesse: [{ id: "o1", pct: "100" }] }, "co")).toMatchObject({ order_id: "o1", allocations: null });
  });
  it("su più commesse va nella ripartizione, con le percentuali scritte all'italiana", () => {
    const f = { ...base, commesse: [{ id: "o1", pct: "60" }, { id: "o2", pct: "40" }] };
    expect(erroreUscita(f)).toBeNull();
    expect(rigaUscita(f, "co")).toMatchObject({ order_id: null, allocations: [{ order_id: "o1", pct: 60 }, { order_id: "o2", pct: 40 }] });
    expect(rigaUscita({ ...base, commesse: [{ id: "o1", pct: "33,5" }, { id: "o2", pct: "33.5" }] }, "co").allocations).toEqual([{ order_id: "o1", pct: 33.5 }, { order_id: "o2", pct: 33.5 }]);
  });
  it("le righe vuote non contano: una commessa scelta e una vuota è una sola commessa", () => {
    expect(rigaUscita({ ...base, commesse: [{ id: "o1", pct: "50" }, { id: "", pct: "50" }] }, "co")).toMatchObject({ order_id: "o1", allocations: null });
  });
  it("percentuali sbagliate o commessa doppia si dicono prima di salvare", () => {
    expect(erroreUscita({ ...base, commesse: [{ id: "o1", pct: "70" }, { id: "o2", pct: "40" }] })).toMatch(/superano il 100/);
    expect(erroreUscita({ ...base, commesse: [{ id: "o1", pct: "0" }, { id: "o2", pct: "40" }] })).toMatch(/tra 1 e 100/);
    expect(erroreUscita({ ...base, commesse: [{ id: "o1", pct: "" }, { id: "o2", pct: "40" }] })).toMatch(/tra 1 e 100/);
    expect(erroreUscita({ ...base, commesse: [{ id: "o1", pct: "50" }, { id: "o1", pct: "50" }] })).toMatch(/due volte/);
  });
  it("le parti uguali fanno sempre 100", () => {
    expect(partiUguali(2)).toEqual(["50", "50"]);
    expect(partiUguali(3)).toEqual(["33,33", "33,33", "33,34"]);
    expect(partiUguali(1)).toEqual(["100"]);
  });
  it("il mese di competenza si vede già compilato, dalla data", () => {
    expect(meseMostrato(base)).toBe("2026-03");
    expect(meseMostrato({ ...base, mese: "2026-01" })).toBe("2026-01");
  });
  it("le note si salvano, vuote diventano null", () => {
    expect(rigaUscita({ ...base, note: "  pagata in contanti  " }, "co").notes).toBe("pagata in contanti");
    expect(rigaUscita(base, "co").notes).toBeNull();
  });

  it("un'uscita salvata si riapre con tutto: commesse e quote, note, mese diverso dalla data", () => {
    const u: UscitaSalvata = { name: "Tassa", amount: 1234.5, vat_rate: 22, documento_data: "2026-03-15", due_date: "2026-03-15",
      documento_riferimento: "R1", mese_competenza: "2026-02-01", is_paid: false, notes: "allo sportello",
      supplier_id: "s1", order_id: null, mezzo_id: "m1", allocations: [{ order_id: "o1", pct: 70 }, { order_id: "o2", pct: 30 }] };
    const f = formDaUscita(u);
    expect(f).toMatchObject({ descrizione: "Tassa", imponibile: "1234,5", aliquota: "22", data: "2026-03-15", mese: "2026-02", riferimento: "R1",
      fornitoreId: "s1", mezzoId: "m1", pagata: false, note: "allo sportello", commesse: [{ id: "o1", pct: "70" }, { id: "o2", pct: "30" }] });
    // Salvata di nuovo senza toccare niente, è la stessa uscita.
    expect(rigaUscita(f, "co")).toMatchObject({ amount: 1234.5, vat_rate: 22, mese_competenza: "2026-02-01", order_id: null,
      allocations: [{ order_id: "o1", pct: 70 }, { order_id: "o2", pct: 30 }], notes: "allo sportello", supplier_id: "s1", mezzo_id: "m1", is_paid: false });
  });
  it("con una sola commessa e il mese della data, il modulo è semplice", () => {
    const f = formDaUscita({ name: "Bollo", amount: 16, vat_rate: null, documento_data: null, due_date: "2026-05-02", documento_riferimento: null,
      mese_competenza: "2026-05-01", is_paid: true, notes: null, supplier_id: null, order_id: "o1", mezzo_id: null, allocations: null });
    expect(f).toMatchObject({ data: "2026-05-02", mese: "", commesse: [{ id: "o1", pct: "100" }], aliquota: "0", note: "" });
  });
});
