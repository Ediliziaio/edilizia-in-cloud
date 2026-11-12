import { describe, expect, it } from "vitest";
import { parseContractExtract } from "@/lib/orders/contractExtract";
import { generaleDaContratto, lavoroDaContratto } from "@/lib/orders/contrattiDestinazioni";
import { CONTRATTO_VUOTO, valoreContratto } from "@/lib/orders/generali/contratto";
import { scenariBusinessPlanAi } from "@/lib/orders/generali/businessPlanAi";
import { analizzaBusinessPlan } from "@/lib/orders/generali/businessPlanImport";
import { ipotesiDaPiano } from "@/lib/orders/generali/simulatoreImport";
import { calcolaIpotesi, leggiIpotesi } from "@/lib/orders/generali/simulatore";
import { operazioneDaIpotesi } from "@/lib/orders/generali/simulatoreOperazione";
import type { VoceNuova } from "@/lib/orders/generali/pianoCategorie";

const source = { bucket: "order-attachments", path: "demo/ai-contratti/originale.pdf", name: "piano.pdf", mime: "application/pdf", size: 123 };
const ex = () => parseContractExtract({ descrizione_lavori: "Manodopera", importo_totale_eur: 2000, iva_pct: 22, fasi_pagamento: [{ descrizione: "Acconto", percentuale: 50 }, { descrizione: "Saldo", percentuale: 50 }], dati_appalto: { valorizzazione: "a_corpo" } });
describe("stesso contratto, destinazioni native", () => {
  it("a corpo conserva rate con IVA e mai pagate", () => {
    const p = lavoroDaContratto(ex(), "a_misura");
    expect(p.valorizzazione).toBe("a_corpo"); expect(p.importo).toBe(2000);
    expect(p.rate.map(r => r.amount)).toEqual([1220, 1220]); expect(p.rate.every(r => !r.is_paid)).toBe(true);
  });
  it("a misura conserva stima e tetto, senza trasformarli in rate", () => {
    const p = lavoroDaContratto(parseContractExtract({ ...ex(), dati_appalto: { valorizzazione: "a_misura", stima_eur: 4000, tetto_eur: 6000 } }), "a_corpo");
    expect(p.importo).toBe(4000); expect(p.tetto).toBe(6000); expect(p.rate).toEqual([]);
  });
  it("il totale RTI non diventa base, ricavo o credito dell’azienda", () => {
    const e = parseContractExtract({ ...ex(), appalto_pubblico: { presente: true, ruolo_azienda_importatrice: "Mandante", quota_azienda_eur: 100000, importo_totale_appalto_eur: 500000 }, dati_appalto: { importo_base_eur: 500000 } });
    expect(lavoroDaContratto(e, "a_corpo").importo).toBeNull();
    const c = generaleDaContratto(e, CONTRATTO_VUOTO, source);
    expect(c.importoBase).toBeNull(); expect(c.note).toContain("quota azienda 100000"); expect(c.anticipazioneImporto).toBeNull();
  });
  it("base, ribasso e sicurezza restano distinti; data documento non certifica firma", () => {
    const e = parseContractExtract({ ...ex(), data_documento: "2026-11-12", dati_appalto: { importo_base_eur: 100000, ribasso_pct: 10, oneri_sicurezza_eur: 5000, anticipazione_pct: 20, ritenuta_pct: .5, cup: "TEST" } });
    const c = generaleDaContratto(e, CONTRATTO_VUOTO, source);
    expect(valoreContratto(c, [])?.aggiornato).toBe(95000); expect(c.dataFirma).toBeNull();
    expect(c.anticipazionePct).toBe(20); expect(c.anticipazioneImporto).toBeNull(); expect(c.cup).toBe("TEST");
  });
});
describe("PDF business plan e simulatore", () => {
  it("separa scenari e conserva stime mancanti, zeri e calendario", () => {
    const f = scenariBusinessPlanAi({ valuta: "EUR", scenari: [ { nome: "Base", righe: [{ tipo: "costo", descrizione: "Costruzione", importo_eur: null, mese: null }, { tipo: "ricavo", descrizione: "Vendite", importo_eur: 300000, mese: "2027-10" }] }, { nome: "Prudente", righe: [{ tipo: "costo", descrizione: "Imprevisti", importo_eur: 0 }] } ] });
    expect(f).toHaveLength(2); const a = analizzaBusinessPlan(f[0]); expect(a.totaleRicavi).toBe(300000); expect(a.righe[0].importo).toBeNull(); expect(a.righe[1].mese).toBe("2027-10"); expect(analizzaBusinessPlan(f[1]).righe[0].importo).toBe(0);
  });
  it("rifiuta valuta diversa, risposta senza dettaglio e tipo di voce sconosciuto", () => {
    expect(() => scenariBusinessPlanAi({ valuta: "USD" })).toThrow("euro"); expect(() => scenariBusinessPlanAi({ scenari: [] })).toThrow("Nessuno scenario");
    expect(() => scenariBusinessPlanAi({ scenari: [{ righe: [{ descrizione: "Totale", tipo: "saldo", importo_eur: 100 }] }] })).toThrow("tipo costo/ricavo");
  });
  it("non somma una seconda volta totali, saldi e margini restituiti dall’AI", () => {
    const f = scenariBusinessPlanAi({ scenari: [{ righe: [
      { tipo: "costo", descrizione: "Materiali", importo_eur: 100 }, { tipo: "costo", descrizione: "Totale costi", importo_eur: 100 },
      { tipo: "ricavo", descrizione: "Vendita", importo_eur: 200 }, { tipo: "ricavo", descrizione: "Totale ricavi", importo_eur: 200 }, { tipo: "ricavo", descrizione: "Utile", importo_eur: 100 },
    ] }] });
    const a = analizzaBusinessPlan(f[0]); expect(a.righe).toHaveLength(2); expect(a.totaleCosti).toBe(100); expect(a.totaleRicavi).toBe(200);
  });
  const voci: VoceNuova[] = [
    { tipo: "costo", categoria: "terreno", descrizione: "Acquisto", importo: 100000, mese: "2027-01", durataMesi: 1 },
    { tipo: "costo", categoria: "costruzione", descrizione: "Costruzione", importo: 250000, mese: "2027-03", durataMesi: 10 },
    { tipo: "costo", categoria: "progettazione", descrizione: "Tecnici", importo: 20000, mese: "2027-01", durataMesi: 2 },
    { tipo: "ricavo", categoria: "vendite", descrizione: "Vendite", importo: 500000, mese: "2028-01", durataMesi: 2 },
  ];
  const origine = { originale: source, hash: "a".repeat(64), scenario: "Base" };
  it("mantiene budget, mesi, unità e originale dal simulatore all’operazione, senza doppioni", () => {
    const ip = ipotesiDaPiano(voci, { modello: "sviluppo", tipologie: [{ nome: "Appartamenti", quante: 2, mq: 80, prezzoMq: 3125 }], mezziPropri: 200000 }, "compravendita", origine);
    const r = calcolaIpotesi(ip); expect(r.numeri.ricavi).toBe(500000); expect(r.numeri.costi).toBe(370000); expect(r.numeri.unita).toBe(2);
    const op = operazioneDaIpotesi(ip, { nome: "DEMO", conUnita: true }); expect(op.valore).toBe(500000); expect(op.unita).toHaveLength(2); expect(op.voci.filter(v => v.tipo === "ricavo").reduce((n,v) => n+v.importo, 0)).toBe(500000);
    const letto = leggiIpotesi(JSON.parse(JSON.stringify(ip)), "sviluppo", "2026-11"); expect(letto.importazione).toEqual(ip.importazione); expect(calcolaIpotesi(letto).numeri.costi).toBe(370000);
  });
  it("non riempie il simulatore con gli esempi di partenza quando mancano superfici e fonti", () => {
    const ip = ipotesiDaPiano(voci, {}, "sviluppo", origine);
    expect(ip.tipologie).toEqual([]); expect(ip.mutuo.importo).toBe(0); expect(ip.investitori).toEqual([]); expect(ip.importazione?.confermata).toBe(false);
    expect(calcolaIpotesi(ip).numeri.ricavi).toBe(500000); expect(calcolaIpotesi(ip).numeri.costi).toBe(370000);
  });
  it("non inventa mesi e non confonde una stima mancante con zero", () => {
    expect(() => ipotesiDaPiano([{ ...voci[0], mese: null }], {}, "sviluppo", origine)).toThrow("Completa importi e mesi");
    expect(() => ipotesiDaPiano([{ ...voci[0], importo: 0, nota: "[EIC:DA_STIMARE]" }], {}, "sviluppo", origine)).toThrow("Completa importi e mesi");
  });
  it("allinea tempi e percentuali ai mesi e agli importi verificati, anche se il riepilogo AI è incoerente", () => {
    const ip = ipotesiDaPiano([...voci, { tipo: "costo", categoria: "oneri", descrizione: "Notaio e imposte acquisto", importo: 10000, mese: "2027-01", durataMesi: 1 }], { mesiPermessi: 2, mesiLavori: 10, venditeDopoLavori: 2, mesiVendite: 5 }, "sviluppo", origine);
    expect(ip.impostePct).toBe(10); expect(ip.tecniciPct).toBe(8); expect(ip.oneri).toBe(0); expect(ip.venditeDopoLavori).toBe(0); expect(ip.mesiVendite).toBe(2);
    expect(calcolaIpotesi(ip).numeri.costi).toBe(380000);
  });
});
