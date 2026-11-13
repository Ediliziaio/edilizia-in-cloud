// Lo storno «totale» deve coincidere con la fattura, e la fattura già stornata in
// parte non accetta un secondo storno totale (09/11/2026).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ fattura: {} as Record<string, unknown>, note: [] as unknown[] }));

function catena(): Record<string, unknown> {
  const c: Record<string, unknown> = {
    eq: () => c, not: () => c, is: () => c,
    single: async (): Promise<{ data: unknown; error: null }> => ({ data: stato.fattura, error: null }),
    then: (ok: (v: { data: unknown[]; error: null }) => void) => ok({ data: stato.note, error: null }),
  };
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => catena() }) } }));

import { creaNotaCredito } from "@/lib/fatturazione/noteCredito";
import { calcolaTotaliDocumento } from "@/lib/fatturazione/calcoli";

const riga = { id: "r", numero_linea: 1, descrizione: "Posa", quantita: 1, unita_misura: "pz", prezzo_unitario: 1000, imponibile: 1000, aliquota_iva: "22", imposta: 220, totale_riga: 1220 };
const opzioni = {
  scontoGlobalePerc: 10, ritenutaAcconto: true, ritenutaAliquota: 20, esigibilitaDefault: "I" as const,
};
const attesi = calcolaTotaliDocumento([riga] as never, opzioni);

beforeEach(() => {
  stato.note = [];
  stato.fattura = {
    numero: "FT-1", data_emissione: "2026-10-01", esigibilita_iva: "I", cliente_snapshot: {}, righe: [riga],
    sconto_globale_percentuale: 10, ritenuta_acconto: true, ritenuta_aliquota: 20, ritenuta_tipo: "RT01", ritenuta_causale: "A",
    bollo_virtuale: true, bollo_importo: 2, cig: "CIG1", cup: "CUP1", bic_pagamento: "BIC", nome_banca: "Banca", intestatario_conto: "Az",
  };
});

describe("nota di credito: importi", () => {
  it("lo storno totale porta sconto e ritenuta: gli importi coincidono con la fattura", async () => {
    const nc = await creaNotaCredito("f1", "totale");
    expect(nc.sconto_globale_percentuale).toBe(10);
    expect(nc.ritenuta_acconto).toBe(true);
    expect(nc.ritenuta_aliquota).toBe(20);
    expect(nc.imponibile_totale).toBe(attesi.imponibile_totale);
    expect(nc.iva_totale).toBe(attesi.iva_totale);
    expect(nc.ritenuta_importo).toBe(attesi.ritenuta_importo);
    expect(nc.bollo_virtuale).toBe(true);
  });

  it("nasce coi totali e i dati fiscali della fattura, senza riaprire l'editor", async () => {
    const nc = await creaNotaCredito("f1", "totale");
    expect(nc.totale_documento).toBeGreaterThan(0);
    expect(nc.totale_da_pagare).toBeGreaterThan(0);
    expect(nc.cig).toBe("CIG1");
    expect(nc.cup).toBe("CUP1");
    expect(nc.nome_banca).toBe("Banca");
  });

  it("nel parziale restano le percentuali, non gli importi fissi", async () => {
    const nc = await creaNotaCredito("f1", "parziale");
    expect(nc.righe).toEqual([]);
    expect(nc.sconto_globale_percentuale).toBe(10);
    expect(nc.ritenuta_aliquota).toBe(20);
    expect(nc).not.toHaveProperty("bollo_virtuale");
    expect(nc.totale_documento).toBe(0);
  });

  it("uno storno totale non parte se una nota ha già stornato una parte", async () => {
    stato.note = [{ totale_da_pagare: 122, totale_documento: 122 }];
    await expect(creaNotaCredito("f1", "totale")).rejects.toThrow(/storno parziale/);
    await expect(creaNotaCredito("f1", "parziale")).resolves.toBeTruthy();
  });
});

describe("le azioni dell'elenco non si fidano della riga ridotta", () => {
  const lista = readFileSync("src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx", "utf8");
  const migrazione = readFileSync("supabase/migrations/20290117100000_fatture_note_credito_cestino_ddt.sql", "utf8");

  it("XML e Segna pagata rileggono il documento intero", () => {
    expect(lista).toMatch(/scaricaXmlFattura\(await rileggiDocumentoFiscale\(doc\.id\)/);
    expect(lista).toMatch(/setPayTarget\(await rileggiDocumentoFiscale\(doc\.id\)\)/);
  });

  it("il ripristino passa dalla funzione del database", () => {
    expect(lista).toContain("ripristina.mutate(doc.id)");
    expect(lista).not.toContain("Elimina definitivamente");
    expect(migrazione).toMatch(/revoke all on function public\.documento_ripristina\(uuid\) from public, anon/);
  });
});

describe('storno e riferimenti fiscali coerenti',()=>{
 it('lo sconto e i contributi entrano anche nel riepilogo IVA della nota',async()=>{
  stato.fattura={...stato.fattura,cassa_previdenziale:true,cassa_tipo:'TC04',cassa_aliquota:4,cassa_aliquota_iva:'22',rivalsa_inps:true,rivalsa_aliquota:4};
  const prima=structuredClone(stato.fattura);const nc=await creaNotaCredito('f1','totale');
  expect(nc.riepilogo_iva?.[0].imponibile).toBe(972);expect(nc.riepilogo_iva?.[0].imposta).toBe(nc.iva_totale);expect(stato.fattura).toEqual(prima);
 });
 it('conserva le righe di rettifica negative senza trasformarle in un addebito',async()=>{
  stato.fattura={...stato.fattura,sconto_globale_percentuale:0,righe:[riga,{...riga,id:'sconto',numero_linea:2,descrizione:'Rettifica',prezzo_unitario:-100,imponibile:-100,imposta:-22,totale_riga:-122}]};
  const nc=await creaNotaCredito('f1','totale');expect(nc.imponibile_totale).toBe(900);expect(nc.righe?.[1].imponibile).toBe(-100);expect(nc.riepilogo_iva?.[0].imponibile).toBe(900);
 });
 it('mantiene causali e note pubbliche per la tracciabilità del bando senza copiare note interne',async()=>{
  stato.fattura={...stato.fattura,note_documento:'bando F decreto 59702',note_interne:'riservato',causale:['Riferimento concessione']};
  const nc=await creaNotaCredito('f1','totale');expect(nc.note_documento).toContain('59702');expect(nc.causale).toEqual(['Riferimento concessione']);expect(nc.note_interne).toBeUndefined();
 });
});
