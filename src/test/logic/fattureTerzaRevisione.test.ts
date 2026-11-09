// Difetti della terza revisione (09/11/2026).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  proforma: {} as Record<string, unknown>,
  fatturaEsistente: null as Record<string, unknown> | null,
  aggiornamenti: [] as Record<string, unknown>[],
  creazioni: 0,
}));

function catena(): Record<string, unknown> {
  const c: Record<string, unknown> = {
    select: () => c, eq: () => c, in: () => c, is: () => c, neq: () => c,
    limit: async (): Promise<{ data: unknown[]; error: null }> => ({ data: db.fatturaEsistente ? [db.fatturaEsistente] : [], error: null }),
    single: async (): Promise<{ data: unknown; error: null }> => ({ data: db.proforma, error: null }),
    update: (u: Record<string, unknown>) => { db.aggiornamenti.push(u); return { eq: async (): Promise<{ error: null }> => ({ error: null }) }; },
  };
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => catena(),
    rpc: async (): Promise<{ data: { id: string }; error: null }> => { db.creazioni++; return { data: { id: "nuova" }, error: null }; },
  },
}));

import { convertiProformaInFattura } from "@/lib/fatturazione/proforma";
import { perAliquota, totaliIva, type RigaIva } from "@/lib/contabilita/registroIva";

const sorgente = (p: string) => readFileSync(p, "utf8");

describe("Registro IVA", () => {
  it("nessun hook dopo i return anticipati: la pagina non va in errore", () => {
    const f = sorgente("src/pages/azienda/fatturazione/RegistroIVA.tsx");
    const ritorno = f.indexOf("if (!company)");
    expect(f.indexOf("useState<string | null>(null)")).toBeLessThan(ritorno);
    expect(f.indexOf("useAnagraficaAzienda()")).toBeLessThan(ritorno);
  });
  it("la stampa non somma le proiezioni, come la pagina", () => {
    const righe = [
      { side: "vendite", number: "1", date: "2026-11-01", base: 10000, tax: 2200, rate: "22", nature: "" },
      { side: "vendite", number: "2", date: "2026-11-01", base: 5000, tax: 1100, rate: "22", nature: "", synthetic: true },
    ] as unknown as RigaIva[];
    expect(totaliIva(righe)).toMatchObject({ imponibile: 100, imposta: 22, documenti: 1 });
    expect(perAliquota(righe)[0]).toMatchObject({ imponibile: 100, righe: 1 });
  });
});

describe("export per il commercialista", () => {
  const x = sorgente("supabase/functions/export-contabile/index.ts");
  it("il cliente è la ragione sociale", () => {
    expect(x).toContain("snap.ragione_sociale || snap.denominazione");
  });
  it("comprende le importate, oltre le mille righe, senza le scartate", () => {
    expect(x).toContain('.from("invoices")');
    expect(x).toContain("tutteLeRighe");
    expect(x).toContain('.or("sdi_stato.is.null,sdi_stato.neq.NS")');
  });
  it("la nota di credito quadra: ricavi e IVA in dare, crediti in avere", () => {
    expect(x).toContain('isNotaCredito ? fmtNum(d.imponibile_totale) : ""');
    expect(x).toContain('isNotaCredito ? fmtNum(d.iva_totale) : ""');
  });
});

describe("proforma → fattura", () => {
  beforeEach(() => {
    db.proforma = { id: "p", tipo: "proforma", stato: "emessa", company_id: "c", righe: [], note_interne: "Nota mia" };
    db.fatturaEsistente = null; db.aggiornamenti = []; db.creazioni = 0;
  });
  it("un tentativo interrotto riprende la fattura già creata, senza farne un'altra", async () => {
    db.fatturaEsistente = { id: "f1" };
    const f = await convertiProformaInFattura("p");
    expect(f.id).toBe("f1");
    expect(db.creazioni).toBe(0);
    expect(db.aggiornamenti[0].stato).toBe("annullata");
  });
  it("le note della proforma restano", async () => {
    await convertiProformaInFattura("p");
    expect(String(db.aggiornamenti[0].note_interne)).toContain("Nota mia");
    expect(String(db.aggiornamenti[0].note_interne)).toContain("Convertito in fattura");
  });
  it("eliminata la bozza, si riconverte", async () => {
    db.proforma = { ...db.proforma, stato: "annullata", note_interne: "Convertito in fattura: la trovi tra le bozze, prende il numero quando la emetti" };
    await convertiProformaInFattura("p");
    expect(db.creazioni).toBe(1);
  });
  it("annullata davvero: non si converte", async () => {
    db.proforma = { ...db.proforma, stato: "annullata", note_interne: null };
    await expect(convertiProformaInFattura("p")).rejects.toThrow(/annullato/);
  });
});

describe("altro", () => {
  it("caricare una ricevuta chiede un permesso, da entrambe le strade", () => {
    expect(sorgente("supabase/functions/ricevi-sdi/index.ts")).toContain("puoCaricareFatturaRicevuta(token, company_id");
    expect(sorgente("supabase/functions/ai-fattura-ricevuta-ocr/index.ts")).toContain("puoCaricareFatturaRicevuta(tokenUtente, companyId");
  });
  it("il controllo segue l'azienda della scheda", () => {
    expect(sorgente("supabase/functions/_shared/permessoDocumentoFiscale.ts")).toContain('"x-azienda-scheda": aziendaScheda');
  });
  it("un lotto con corpi falliti si riprova, al massimo tre volte", () => {
    expect(sorgente("supabase/functions/_shared/salvaFatturaRicevuta.ts")).toContain("Dati incompleti (lotto):");
    expect(sorgente("supabase/functions/openapi-fatture-ricevute/index.ts")).toContain("lottoIncompleto");
  });
  it("database: scartate fuori dalla liquidazione, storno libera rata e SAL, scadenza dalla prima rata", () => {
    const sql = sorgente("supabase/migrations/20290128100000_fatture_terza_revisione.sql");
    expect(sql).toContain("upper(coalesce(s.sdi_stato, '')) = 'NS'");
    expect(sql).toContain("NEW.stato IN ('annullata', 'stornata')");
    expect(sql).toContain("r ->> 'data_scadenza'");
    expect(sql).toMatch(/revoke all on function public\.puo_caricare_fattura_ricevuta\(uuid\) from public, anon/);
  });
});
