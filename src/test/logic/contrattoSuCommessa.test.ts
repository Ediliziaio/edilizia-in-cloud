import { describe, expect, it } from "vitest";
import { parseContractExtract } from "@/lib/orders/contractExtract";
import {
  descrizioneVoceContratto, pianoAlNettoDelleTenute, pianoContrattoSuCommessa, rataBloccata, rateDaSalvare, type CommessaPerContratto, type RataEsistente,
} from "@/lib/orders/contrattoSuCommessa";

const contratto = (extra: Record<string, unknown> = {}) => parseContractExtract({
  cliente: { nome_completo: "Mario Rossi" },
  descrizione_lavori: "Rifacimento bagno",
  importo_totale_eur: 10000,
  iva_pct: 10,
  importo_totale_ivato_eur: 11000,
  voci: [
    { descrizione: "Demolizioni", quantita: 1, prezzo_unitario_eur: 2000 },
    { descrizione: "Totale lavori", quantita: 1, prezzo_unitario_eur: 10000 },
    { descrizione: "Posa rivestimenti", quantita: 40, prezzo_unitario_eur: 200 },
  ],
  fasi_pagamento: [
    { descrizione: "Acconto alla firma", importo_eur: 3300 },
    { descrizione: "SAL a metà lavori", importo_eur: 4400 },
    { descrizione: "Saldo a fine lavori", importo_eur: 3300 },
  ],
  ...extra,
});

const commessa: CommessaPerContratto = {
  total_amount: 8000, vat_rate: 22, work_start_date: "2026-11-01", work_end_date: null, order_type: "cliente",
};

const rata = (r: Partial<RataEsistente> & { id: string; amount: number; position: number }): RataEsistente => ({
  label: "Rata", type: "deposit", is_paid: false, ...r,
});

describe("rataBloccata", () => {
  it("tiene ferme le rate fatturate, collegate a una fattura o incassate", () => {
    expect(rataBloccata({ documento_fiscale_id: "f1", invoice_id: null, is_paid: false })).toBe(true);
    expect(rataBloccata({ documento_fiscale_id: null, invoice_id: "i1", is_paid: false })).toBe(true);
    expect(rataBloccata({ documento_fiscale_id: null, invoice_id: null, is_paid: true })).toBe(true);
    expect(rataBloccata({ documento_fiscale_id: null, invoice_id: null, is_paid: false })).toBe(false);
  });
});

describe("pianoAlNettoDelleTenute", () => {
  const piano = [
    { position: 0, label: "Acconto", type: "deposit" as const, amount: 3300, is_paid: false },
    { position: 1, label: "SAL", type: "deposit" as const, amount: 4400, is_paid: false },
    { position: 2, label: "Saldo", type: "balance" as const, amount: 3300, is_paid: false },
  ];
  it("senza rate tenute il piano resta intero", () => {
    expect(pianoAlNettoDelleTenute(piano, []).rate.map((r) => r.amount)).toEqual([3300, 4400, 3300]);
  });
  it("una rata fatturata uguale all'acconto toglie l'acconto", () => {
    const { rate, eccedenza } = pianoAlNettoDelleTenute(piano, [{ amount: 3300 }]);
    expect(rate.map((r) => r.label)).toEqual(["SAL", "Saldo"]);
    expect(eccedenza).toBe(0);
  });
  it("una rata fatturata a metà riduce la rata che la contiene", () => {
    const { rate } = pianoAlNettoDelleTenute(piano, [{ amount: 5000 }]);
    expect(rate.map((r) => [r.label, r.amount])).toEqual([["SAL", 2700], ["Saldo", 3300]]);
  });
  it("tenute oltre il contratto: niente rate nuove e l'eccedenza detta", () => {
    const { rate, eccedenza } = pianoAlNettoDelleTenute(piano, [{ amount: 12000 }]);
    expect(rate).toEqual([]);
    expect(eccedenza).toBe(1000);
  });
});

describe("pianoContrattoSuCommessa", () => {
  it("importo, IVA, voci senza i subtotali, date solo se mancano", () => {
    const p = pianoContrattoSuCommessa(contratto({ data_inizio_lavori: "2026-12-01", data_fine_lavori: "2027-01-31" }), commessa, []);
    expect(p.campi.total_amount).toBe(10000);
    expect(p.campi.vat_rate).toBe(10);
    expect(p.campi.work_start_date).toBeUndefined();
    expect(p.campi.work_end_date).toBe("2027-01-31");
    expect(p.voci.map((v) => v.name)).toEqual(["Demolizioni", "Posa rivestimenti"]);
    expect(p.voci.every((v) => v.vat_rate === 10)).toBe(true);
    expect(p.rateNuove?.map((r) => r.amount)).toEqual([3300, 4400, 3300]);
  });

  it("le rate fatturate restano, quelle libere vengono sostituite", () => {
    const esistenti = [
      rata({ id: "a", position: 0, amount: 3300, documento_fiscale_id: "fatt-1" }),
      rata({ id: "b", position: 1, amount: 6460 }),
    ];
    const p = pianoContrattoSuCommessa(contratto(), commessa, esistenti);
    expect(p.rateTenute.map((r) => r.id)).toEqual(["a"]);
    expect(p.rateSostituite.map((r) => r.id)).toEqual(["b"]);
    expect(p.rateNuove?.map((r) => [r.label, r.amount, r.position])).toEqual([["SAL a metà lavori", 4400, 1], ["Saldo a fine lavori", 3300, 2]]);
    const salvare = rateDaSalvare(p)!;
    expect(salvare[0]).toMatchObject({ id: "a", amount: 3300 });
    expect(salvare.slice(1).every((r) => !("id" in r))).toBe(true);
    expect(salvare.reduce((s, r) => s + Number(r.amount), 0)).toBe(11000);
  });

  it("senza piano dei pagamenti lo scadenzario non si tocca", () => {
    const p = pianoContrattoSuCommessa(contratto({ fasi_pagamento: [] }), commessa, [rata({ id: "b", position: 0, amount: 100 })]);
    expect(p.rateNuove).toBeNull();
    expect(p.rateSostituite).toEqual([]);
    expect(rateDaSalvare(p)).toBeNull();
    expect(p.avvisi.join(" ")).toMatch(/restano com'erano/);
  });

  it("un raggruppamento non applica importi né voci né rate", () => {
    const p = pianoContrattoSuCommessa(contratto({ appalto_pubblico: { presente: true, ruolo_azienda_importatrice: "mandante" } }), commessa, []);
    expect(p.campi.total_amount).toBeUndefined();
    expect(p.voci).toEqual([]);
    expect(p.rateNuove).toBeNull();
  });

  it("per il committente prende tetto e riferimento, senza sovrascrivere un riferimento già scritto", () => {
    const ex = contratto({ dati_appalto: { tetto_eur: 50000, riferimento: "Ordine 12/2026" } });
    const p = pianoContrattoSuCommessa(ex, { ...commessa, order_type: "appaltatore_lavoro" }, []);
    expect(p.campi.tetto_importo).toBe(50000);
    expect(p.campi.riferimento_committente).toBe("Ordine 12/2026");
    const q = pianoContrattoSuCommessa(ex, { ...commessa, order_type: "appaltatore_lavoro", riferimento_committente: "già" }, []);
    expect(q.campi.riferimento_committente).toBeUndefined();
    const r = pianoContrattoSuCommessa(ex, commessa, []);
    expect(r.campi.tetto_importo).toBeUndefined();
  });
});

describe("descrizioneVoceContratto", () => {
  it("il prezzo del contratto resta nella descrizione della voce", () => {
    expect(descrizioneVoceContratto({ quantity: 40, unit_price: 200, discount_percent: 0 })).toBe("Dal contratto: 40 × 200,00 €");
    expect(descrizioneVoceContratto({ quantity: 1.5, unit_price: 10, discount_percent: 15 })).toBe("Dal contratto: 1,5 × 10,00 €, sconto 15%");
    expect(descrizioneVoceContratto({ quantity: 1, unit_price: 0, discount_percent: 0 })).toBeNull();
  });
});
