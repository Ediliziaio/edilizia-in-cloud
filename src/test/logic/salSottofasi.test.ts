/// <reference types="node" />
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { conPercentuale, conQuantita, percentualeFaseDaSottofasi, preparaSottofasi, sottofasiPerSal } from "@/lib/orders/salSottofasi";
import { percentualiPrecedenti, vociSalDaFasi, vociSottoIlPrecedente } from "@/lib/orders/salDaFasi";
import { saveSalDraft } from "@/lib/orders/saveSalDraft";
import { buildSalHtml, type SalRecord } from "../../../supabase/functions/generate-sal-pdf/render";

describe("Sottofasi nel verbale SAL: importi, quantità, avanzamento", () => {
  it("lavori a misura: importo e quantità dalle voci della commessa, % dalla quantità fatta", () => {
    const d = sottofasiPerSal([
      { id: "s1", name: "Getto solaio", position: 1, percentuale: 50, quantita_fatta: 30, voci: [{ quantita: 40, unita: "m³", importo: 8000 }] },
      { id: "s2", name: "Travi", position: 2, fatta: true, voci: [{ quantita: 10, unita: "m", importo: 2000 }] },
    ], 10000);
    expect(d.map((x) => [x.descrizione, x.importo_contrattuale, x.quantita_contratto, x.unita, x.percentuale_avanzamento, x.quantita_a_oggi]))
      .toEqual([["Getto solaio", 8000, 40, "m³", "75", "30"], ["Travi", 2000, 10, "m", "100", "10"]]);
    // 8000 × 75% + 2000 × 100% = 8000 su 10000 → 80%
    expect(percentualeFaseDaSottofasi(d)).toBe(80);
  });

  it("senza voci collegate: il venduto della fase diviso per peso, e la somma torna al centesimo", () => {
    const d = sottofasiPerSal([
      { id: "a", name: "A", position: 1, peso: 1, percentuale: 100 },
      { id: "b", name: "B", position: 2, peso: 1, percentuale: 0 },
      { id: "c", name: "C", position: 3, peso: 1, percentuale: 0 },
    ], 100);
    expect(d.map((x) => x.importo_contrattuale)).toEqual([33.33, 33.33, 33.34]);
    expect(d.reduce((s, x) => s + (x.importo_contrattuale ?? 0), 0)).toBeCloseTo(100, 2);
    expect(percentualeFaseDaSottofasi(d)).toBe(33.33);
  });

  it("le voci della commessa pesano, ma le sottofasi sommano esattamente il venduto della fase", () => {
    const d = sottofasiPerSal([
      { id: "a", name: "A", position: 1, percentuale: 0, voci: [{ quantita: 1, unita: "a corpo", importo: 600 }] },
      { id: "b", name: "B", position: 2, percentuale: 0, voci: [{ quantita: 1, unita: "a corpo", importo: 300 }] },
    ], 1000);
    expect(d.map((x) => x.importo_contrattuale)).toEqual([666.67, 333.33]);
    // senza venduto restano gli importi delle voci
    expect(sottofasiPerSal([{ id: "a", name: "A", voci: [{ quantita: 1, unita: "n", importo: 600 }] }], null)[0].importo_contrattuale).toBe(600);
  });

  it("una quantità scritta all'italiana si legge", () => {
    const [d] = sottofasiPerSal([{ id: "a", name: "A", percentuale: 0, voci: [{ quantita: 4000, unita: "kg", importo: 1000 }] }], null);
    expect(conQuantita(d, "1.234,5").percentuale_avanzamento).toBe("30.86");
  });

  it("senza venduto né voci: niente importi, la media è sul peso", () => {
    const d = sottofasiPerSal([{ id: "a", name: "A", peso: 3, percentuale: 100 }, { id: "b", name: "B", peso: 1, percentuale: 0 }], null);
    expect(d.every((x) => x.importo_contrattuale === null)).toBe(true);
    expect(percentualeFaseDaSottofasi(d)).toBe(75);
  });

  it("una sottofase non parte sotto la % già certificata", () => {
    const d = sottofasiPerSal([{ id: "a", name: "A", percentuale: 20 }], 100, new Map([["a", 60]]));
    expect(d[0].percentuale_avanzamento).toBe("60");
  });

  it("chi scrive la quantità muove la %, chi scrive la % muove la quantità", () => {
    const [d] = sottofasiPerSal([{ id: "a", name: "A", percentuale: 0, voci: [{ quantita: 200, unita: "m²", importo: 1000 }] }], null);
    expect(conQuantita(d, "50").percentuale_avanzamento).toBe("25");
    expect(conQuantita(d, "250").percentuale_avanzamento).toBe("100");
    expect(conPercentuale(d, "40").quantita_a_oggi).toBe("80");
  });

  it("rifiuta un avanzamento fuori scala prima di scrivere", () => {
    const [d] = sottofasiPerSal([{ id: "a", name: "A", percentuale: 0 }], null);
    expect(() => preparaSottofasi([{ ...d, percentuale_avanzamento: "120" }], "Voce 1")).toThrow("tra 0 e 100");
    expect(preparaSottofasi([{ ...d, percentuale_avanzamento: "12,5" }], "Voce 1")[0].percentuale_avanzamento).toBe(12.5);
  });
});

describe("Il verbale nuovo dalle fasi, con le sottofasi", () => {
  const fasi = [
    { id: "f1", name: "Primo solaio", status: "in_corso", percentuale: 57, importo_venduto: 10000,
      sottofasi: [
        { id: "s1", name: "Getto", position: 1, percentuale: 50, quantita_fatta: 30, voci: [{ quantita: 40, unita: "m³", importo: 8000 }] },
        { id: "s2", name: "Travi", position: 2, fatta: true, voci: [{ quantita: 10, unita: "m", importo: 2000 }] },
      ] },
    { id: "f2", name: "Fondazioni", status: "completata", percentuale: 100, importo_venduto: 5000 },
  ];

  it("la % della fase è la media delle sottofasi, non la % arrotondata della fase", () => {
    const voci = vociSalDaFasi(fasi);
    expect(voci[0].percentuale_avanzamento).toBe("80");
    expect(voci[0].sottofasi).toHaveLength(2);
    expect(voci[1].sottofasi).toBeUndefined();
    expect(voci[1].percentuale_avanzamento).toBe("100");
  });

  it("il SAL successivo riparte dalle % delle sottofasi e segnala quella che scende", () => {
    const prec = percentualiPrecedenti(2, [{ id: "sal1", numero_sal: 1, stato: "emesso", sal_voci: [
      { descrizione: "Primo solaio", percentuale_avanzamento: 85, fase_id: "f1", sal_voci_sottofasi: [{ sottofase_id: "s1", percentuale_avanzamento: 90 }] },
    ] }]);
    const voci = vociSalDaFasi(fasi, prec);
    expect(voci[0].sottofasi![0].percentuale_avanzamento).toBe("90");
    // 8000 × 90% + 2000 × 100% = 92%
    expect(voci[0].percentuale_avanzamento).toBe("92");
    const abbassata = [{ ...voci[0], sottofasi: [{ ...voci[0].sottofasi![0], percentuale_avanzamento: "70" }, voci[0].sottofasi![1]] }];
    expect(vociSottoIlPrecedente(abbassata, prec).map((d) => d.descrizione)).toContain("Primo solaio › Getto");
  });
});

describe("Salvataggio: il dettaglio va con la sua voce e non tocca i totali", () => {
  function db(sottoError = false) {
    const ops: Array<{ table: string; action: string; payload?: unknown }> = [];
    let id = "";
    const client = { from: (table: string) => {
      const q = {
        insert: (payload: unknown) => { ops.push({ table, action: "insert", payload }); if (table === "sal_records") id = (payload as { id: string }).id; return q; },
        delete: () => { ops.push({ table, action: "delete" }); return q; },
        select: () => q, eq: () => q,
        single: async () => ({ data: { id, company_id: "c", order_id: "o", stato: "bozza" }, error: null as null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve(
          table === "sal_voci" ? { data: [{ id: "x", importo_sal: 8000 }], error: null }
          : table === "sal_voci_sottofasi" ? { data: sottoError ? null : [{ id: "d1" }, { id: "d2" }], error: sottoError ? { message: "no" } : null }
          : { data: [{ id }], error: null }).then(res),
      };
      return q;
    } } as unknown as SupabaseClient<Database>;
    return { client, ops };
  }
  const voce = vociSalDaFasi([{ id: "f1", name: "Primo solaio", status: "in_corso", percentuale: 57, importo_venduto: 10000, sottofasi: [
    { id: "s1", name: "Getto", position: 1, percentuale: 50, quantita_fatta: 30, voci: [{ quantita: 40, unita: "m³", importo: 8000 }] },
    { id: "s2", name: "Travi", position: 2, fatta: true, voci: [{ quantita: 10, unita: "m", importo: 2000 }] },
  ] }])[0];
  const input = { orderId: "o", companyId: "c", number: 1, date: "2026-11-10", note: "", installmentId: null as string | null, lines: [voce], contractNet: 10000 };

  it("scrive testata, voci e sottofasi legate alla voce giusta; il totale è quello della fase", async () => {
    const h = db();
    await saveSalDraft(h.client, input);
    expect(h.ops.map((o) => o.table)).toEqual(["sal_records", "sal_voci", "sal_voci_sottofasi"]);
    const voceId = (h.ops[1].payload as Array<{ id: string }>)[0].id;
    const det = h.ops[2].payload as Array<{ voce_id: string; descrizione: string; percentuale_avanzamento: number }>;
    expect(det.map((d) => [d.voce_id, d.descrizione, d.percentuale_avanzamento])).toEqual([[voceId, "Getto", 75], [voceId, "Travi", 100]]);
    expect((h.ops[0].payload as { importo_totale: number }).importo_totale).toBe(8000);
  });

  it("se il dettaglio non si salva, la bozza nuova si annulla", async () => {
    const h = db(true);
    await expect(saveSalDraft(h.client, input)).rejects.toThrow("annullata");
    expect(h.ops.at(-1)).toMatchObject({ table: "sal_records", action: "delete" });
  });
});

describe("PDF del verbale: le sottofasi sotto la loro fase", () => {
  const company = { ragione_sociale: "Azienda DEMO", partita_iva: null as null, colore_primario: "#1e3a5f", logo_url: null as null };
  const sal = (): SalRecord => ({ id: "sal", numero_sal: 2, data_emissione: "2026-11-10", stato: "emesso", importo_totale: 8000, note: null, order_id: "o", company_id: "c",
    sal_voci: [{ id: "v", descrizione: "Primo solaio", importo_contrattuale: 10000, percentuale_avanzamento: 80, importo_sal: 8000, note: null,
      sal_voci_sottofasi: [
        { sottofase_id: "s2", posizione: 1, descrizione: "Travi", unita: "m", quantita_contratto: 10, quantita_a_oggi: 10, importo_contrattuale: 2000, percentuale_avanzamento: 100, importo_sal: 2000 },
        { sottofase_id: "s1", posizione: 0, descrizione: "Getto <b>", unita: "m³", quantita_contratto: 40, quantita_a_oggi: 30, importo_contrattuale: 8000, percentuale_avanzamento: 75, importo_sal: 6000 },
      ] }] });

  it("righe rientrate, nell'ordine, con quantità e importi; il totale resta quello delle fasi", () => {
    const html = buildSalHtml(sal(), null, company, null, undefined, 6000, null, { vociPrecedenti: { "primo solaio": 6000 }, sottofasiPrecedenti: { s1: 60, s2: 60 } });
    expect(html.indexOf("Getto")).toBeLessThan(html.indexOf("Travi"));
    expect(html).toContain("30 su 40 m³");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain('class="riga-sottofase');
    // Getto: 60% di 8000 = 4800 precedente, 1200 questo SAL
    expect(html).toContain("4.800,00");
    expect(html).toContain("1.200,00");
  });

  it("verbale breve: senza dettaglio, nessuna riga di sottofase", () => {
    const html = buildSalHtml(sal(), null, company, null, undefined, 0, null, { dettaglioSottofasi: false });
    expect(html).not.toContain('class="riga-sottofase');
  });
});
