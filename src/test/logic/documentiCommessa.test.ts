import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { cosaManca, descrizioneFattura, fatturatoOltreOrdine, materialiDaRighe, pagamentoFattura, statoVerificaBolla } from "@/components/orders/OrderDocumentiFornitore";

describe("bolle: cosa manca", () => {
  it("una foto dal cantiere da verificare è da confermare, anche con l'ordine già proposto", () => {
    expect(cosaManca("cantiere", { stato: "da_verificare" }).daFare).toBe("conferma");
    expect(cosaManca("cantiere", { stato: "da_verificare", purchase_order_id: "o" }).motivo).toContain("di questo ordine");
    expect(cosaManca("cantiere", { stato: "registrato" }).daFare).toBeNull();
  });
  it("arrivata senza ordine è da confermare; sull'ordine è solo da controllare", () => {
    expect(cosaManca("fornitore", { stato: "ricevuto" }).daFare).toBe("conferma");
    expect(cosaManca("fornitore", { stato: "ricevuto", purchase_order_id: "o" }).daFare).toBe("controllo");
  });
  it("i dubbi dell'AI chiedono di confermare l'abbinamento", () => {
    expect(cosaManca("fornitore", { stato: "ricevuto", purchase_order_id: "o", ai_avvisi: ["numero incerto"] }).daFare).toBe("conferma");
  });
  it("controllata non chiede niente; danni o non conformità sì, anche se controllata", () => {
    expect(cosaManca("fornitore", { stato: "verificato", purchase_order_id: "o" }).daFare).toBeNull();
    expect(cosaManca("fornitore", { stato: "verificato", purchase_order_id: "o", has_damages: true }).daFare).toBe("controllo");
    expect(cosaManca("fornitore", { stato: "non_conforme" }).daFare).toBe("controllo");
  });
});

describe("fatture: oltre l'ordine", () => {
  it("meno dell'ordine è normale, l'arrotondamento non conta, di più sì", () => {
    expect(fatturatoOltreOrdine(500, 1000)).toBe(false);
    expect(fatturatoOltreOrdine(1000.9, 1000)).toBe(false);
    expect(fatturatoOltreOrdine(1002, 1000)).toBe(true);
    expect(fatturatoOltreOrdine(1002, null)).toBe(false);
    expect(fatturatoOltreOrdine(1002, 0)).toBe(false);
  });
});

describe("fatture: pagamento", () => {
  it("vale il costo collegato, se sulla fattura non è segnato", () => {
    expect(pagamentoFattura(null, { is_paid: true, paid_date: "2025-11-18" }, undefined, 100)).toEqual({ pagamento: "pagata", pagato: 100, residuo: 0, pagataIl: "2025-11-18" });
    expect(pagamentoFattura("2025-10-01", { is_paid: false, paid_date: null }, undefined, 100).pagamento).toBe("pagata");
  });
  it("in parte: gli importi sono quelli di «Pagamenti e residuo»", () => {
    expect(pagamentoFattura(null, { is_paid: false, paid_date: null }, { pagato: 30, residuo: 70 }, 100)).toEqual({ pagamento: "parziale", pagato: 30, residuo: 70, pagataIl: null });
  });
  it("su una fattura ripartita conta la quota di questa commessa", () => {
    expect(pagamentoFattura(null, undefined, { pagato: 30, residuo: 70 }, 40, 40)).toMatchObject({ pagato: 12, residuo: 28 });
  });
  it("senza pagamenti resta tutto da pagare, anche senza costo collegato", () => {
    expect(pagamentoFattura(null, undefined, undefined, 100)).toEqual({ pagamento: "da_pagare", pagato: 0, residuo: 100, pagataIl: null });
    expect(pagamentoFattura(null, undefined, { pagato: 0, residuo: 100 }, 100).pagamento).toBe("da_pagare");
  });
});

describe("bolle: stato di verifica e materiali", () => {
  it("usa gli stati del documento", () => {
    expect(statoVerificaBolla("fornitore", { stato: "ricevuto" })).toBe("da_verificare");
    expect(statoVerificaBolla("fornitore", { stato: "verificato" })).toBe("verificata");
    expect(statoVerificaBolla("fornitore", { stato: "verificato", has_damages: true })).toBe("non_conforme");
    expect(statoVerificaBolla("fornitore", { stato: "atteso" })).toBe("attesa");
    expect(statoVerificaBolla("cantiere", { stato: "da_verificare" })).toBe("da_verificare");
    expect(statoVerificaBolla("cantiere", { stato: "registrato" })).toBe("verificata");
    expect(statoVerificaBolla("cantiere", { stato: "rifiutato" })).toBe("rifiutata");
  });
  it("legge le righe scritte da chi le ha scritte, e salta quelle senza nome", () => {
    expect(materialiDaRighe([{ descrizione: "Cavo", quantita: 3, unita: "m" }, { name: "Vite", quantity: "2" }, { quantita: 1 }, null])).toEqual([
      { nome: "Cavo", quantita: 3, unita: "m" }, { nome: "Vite", quantita: 2, unita: null },
    ]);
    expect(materialiDaRighe(null)).toEqual([]);
  });
  it("la descrizione della fattura: riassunto, altrimenti la prima voce", () => {
    expect(descrizioneFattura(" Noleggio ", [{ descrizione: "X" }])).toBe("Noleggio");
    expect(descrizioneFattura(null, [{ descrizione: "X" }])).toBe("X");
    expect(descrizioneFattura(null, null)).toBeNull();
  });
});

describe("le letture dei materiali", () => {
  it("goods_receipts ha due strade verso order_items: la relazione è scritta, altrimenti l'elenco non si legge", () => {
    const fonte = readFileSync("src/components/orders/OrderDocumentiFornitore.tsx", "utf8");
    expect(fonte).toContain("order_items!goods_receipts_order_item_id_fkey(");
    expect(fonte).not.toMatch(/quantity_received, order_items\(/);
  });
});
