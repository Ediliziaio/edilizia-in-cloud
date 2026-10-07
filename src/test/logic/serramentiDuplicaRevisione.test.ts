/**
 * «Nuova revisione» e «Duplica» del preventivo Serramenti (06/10/2026): quello che la copia si porta dietro (sconto,
 * IVA, prezzo scritto a mano, rate, finanziamento, detrazione, indirizzo dei lavori, modello del PDF, posizioni,
 * complementi che seguono la loro finestra, servizi) e quello che non può portarsi (numero, stato, PDF, link e
 * firma, commessa). Il database è finto e tiene le scritture.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  tabelle: {} as Record<string, Array<Record<string, unknown>>>,
  scritture: [] as Array<{ tabella: string; op: string; payload: unknown }>,
  falliscono: new Set<string>(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const costruttore = (tabella: string) => {
    let op = "select";
    let payload: unknown;
    let conOr = false;
    const filtri: Record<string, unknown> = {};
    const risolvi = (uno: boolean) => {
      if (op === "insert") {
        if (db.falliscono.has(tabella)) return { data: null as null, error: { message: `scrittura su ${tabella} fallita` } };
        if (tabella === "sr_progetti") {
          const riga = payload as Record<string, unknown>;
          return { data: { id: "nuova-rev", code: riga.code ?? "SR-2026-0999" }, error: null as null };
        }
        return { data: null as null, error: null as null };
      }
      if (op === "update") return { data: null as null, error: null as null };
      const righe = db.tabelle[tabella] ?? [];
      if (conOr) return { data: righe, error: null as null };
      const trovate = righe.filter((r) => Object.entries(filtri).every(([k, v]) => r[k] === v));
      return { data: uno ? trovate[0] ?? null : trovate, error: null as null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (p: unknown) => { op = "insert"; payload = p; db.scritture.push({ tabella, op, payload: p }); return b; },
      update: (p: unknown) => { op = "update"; payload = p; db.scritture.push({ tabella, op, payload: p }); return b; },
      eq: (campo: string, valore: unknown) => { filtri[campo] = valore; return b; },
      or: () => { conOr = true; return b; },
      maybeSingle: () => Promise.resolve(risolvi(true)),
      single: () => Promise.resolve(risolvi(true)),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(risolvi(false)).then(ok),
    };
    return b;
  };
  return { supabase: { from: costruttore } };
});

import { duplicaProgetto } from "@/lib/serramenti/api";

const ORIGINALE = {
  id: "p-1", company_id: "c1", code: "SR-2026-0001", created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-02T10:00:00Z", updated_by: "u1",
  deleted_at: null as string | null, parent_id: null as string | null, revision_number: 1, stato: "consegnato",
  cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_indirizzo: "Via Tortona 33", cliente_citta: "Milano", cliente_cap: "20121", cliente_provincia: "MI",
  cantiere_indirizzo: "Via Roma 12", cantiere_citta: "Torino", cantiere_cap: "10121", cantiere_provincia: "TO", cantiere_piano: "2° piano",
  iva_percentuale: -1, sconto_percentuale: 7.5, sconto_importo: 150, prezzo_manuale: 9020, totale_min: 8060, totale_max: 8060,
  fin_anticipo_pct: 30, fin_piani: [{ nome: "Standard", mesi: 60, tasso: 4.75, rata_mese: 95, anticipo: 1200, finanziato: 2800 }],
  fin_tabella_id: "t1", fin_tabella_riga_id: "r1", discount_rule_id: "dr1",
  schema_pagamento: "acconto_finanziato",
  pagamento_milestones: [{ label: "Acconto", percentuale: 30, when: "Firma" }, { label: "Finanziamento", percentuale: 70, when: "Lavori" }],
  detrazione_aliquota: 50, detrazione_eur_totale: 4030, detrazione_eur_anno: 403, risparmio_calcolato: true, risparmio_eur_anno: 140,
  modello_snapshot: { version: 1, modelId: "finestre" }, opportunita_id: "opp-1", consulente_id: "u2",
  valido_fino_giorni: 30, valido_fino_data: "2026-10-01", consulenza_at: "2026-09-10T10:00:00Z",
  pdf_url: "x.pdf", pdf_generated_at: "2026-09-03T10:00:00Z", pdf_html_url: "x.html", ordine_id: "ord-1",
  public_token: "tok", public_url: "https://app/stima/tok", firmato_il: "2026-09-04T10:00:00Z", firma_cliente_url: "firma.png",
};

beforeEach(() => {
  db.scritture.length = 0;
  db.falliscono.clear();
  db.tabelle = {
    sr_progetti: [
      ORIGINALE,
      { id: "p-2", code: "SR-2026-0001-r2", revision_number: 2, parent_id: "p-1" },
    ],
    sr_serramenti_progetto: [
      { id: "s-1", progetto_id: "p-1", created_at: "x", updated_at: "x", tipologia: "finestra_2ante", quantita: 2, prezzo_totale: 2400, posa_esclusa: false, family_id: "f1", valori_assi: { colore: "v1" } },
      { id: "s-2", progetto_id: "p-1", created_at: "x", updated_at: "x", tipologia: "porta_finestra", quantita: 1, prezzo_totale: 1600, posa_esclusa: true, family_id: null, valori_assi: {} },
    ],
    sr_accessori_progetto: [
      { id: "a-1", progetto_id: "p-1", created_at: "x", updated_at: "x", tipo: "avvolgibile", quantita: 2, prezzo_totale: 600, serramento_id: "s-1" },
      { id: "a-2", progetto_id: "p-1", created_at: "x", updated_at: "x", tipo: "zanzariera", quantita: 1, prezzo_totale: 150, serramento_id: null },
    ],
    sr_servizi_progetto: [
      { id: "m-1", progetto_id: "p-1", created_at: "x", updated_at: "x", descrizione: "Trasporto", quantita: 1, prezzo_unitario_vendita: 150, prezzo_totale_vendita: 150 },
    ],
  };
});

const scrittura = (tabella: string, op = "insert") => db.scritture.filter((s) => s.tabella === tabella && s.op === op);

describe("nuova revisione", () => {
  it("porta con sé sconto, IVA, prezzo a mano, rate, finanziamento, detrazione, indirizzo dei lavori e modello del PDF", async () => {
    const esito = await duplicaProgetto("p-1");
    expect(esito).toEqual({ newId: "nuova-rev", newCode: "SR-2026-0001-r3", revision_number: 3 });
    const riga = scrittura("sr_progetti")[0].payload as Record<string, unknown>;
    expect(riga).toMatchObject({
      iva_percentuale: -1, sconto_percentuale: 7.5, sconto_importo: 150, prezzo_manuale: 9020, totale_min: 8060, totale_max: 8060,
      fin_anticipo_pct: 30, fin_tabella_id: "t1", fin_tabella_riga_id: "r1", discount_rule_id: "dr1", schema_pagamento: "acconto_finanziato",
      detrazione_aliquota: 50, detrazione_eur_totale: 4030, detrazione_eur_anno: 403, risparmio_calcolato: true, risparmio_eur_anno: 140,
      cantiere_indirizzo: "Via Roma 12", cantiere_citta: "Torino", cantiere_cap: "10121", cantiere_provincia: "TO", cantiere_piano: "2° piano",
      cliente_indirizzo: "Via Tortona 33", modello_snapshot: { version: 1, modelId: "finestre" },
      valido_fino_giorni: 30, opportunita_id: "opp-1", consulente_id: "u2",
    });
    expect(riga.fin_piani).toEqual(ORIGINALE.fin_piani);
    expect(riga.pagamento_milestones).toEqual(ORIGINALE.pagamento_milestones);
  });

  it("riparte da bozza, in coda alla serie, senza numero del database, PDF, link, firma, commessa né scadenze vecchie", async () => {
    await duplicaProgetto("p-1");
    const riga = scrittura("sr_progetti")[0].payload as Record<string, unknown>;
    expect(riga).toMatchObject({ stato: "bozza", parent_id: "p-1", revision_number: 3, code: "SR-2026-0001-r3" });
    for (const campo of ["id", "created_at", "updated_at", "updated_by", "deleted_at", "pdf_url", "pdf_generated_at", "pdf_html_url", "ordine_id",
      "public_token", "public_url", "firmato_il", "firma_cliente_url", "consulenza_at", "valido_fino_data"]) {
      expect(riga, campo).not.toHaveProperty(campo);
    }
  });

  it("la revisione di una revisione resta sotto il preventivo di partenza", async () => {
    db.tabelle.sr_progetti[0] = { ...ORIGINALE, id: "p-2", code: "SR-2026-0001-r2", parent_id: "p-1", revision_number: 2 };
    db.tabelle.sr_progetti[1] = { id: "p-1", code: "SR-2026-0001", revision_number: 1, parent_id: null };
    db.tabelle.sr_serramenti_progetto.forEach((r) => { r.progetto_id = "p-2"; });
    db.tabelle.sr_accessori_progetto.forEach((r) => { r.progetto_id = "p-2"; });
    db.tabelle.sr_servizi_progetto.forEach((r) => { r.progetto_id = "p-2"; });
    const esito = await duplicaProgetto("p-2");
    expect(esito.newCode).toBe("SR-2026-0001-r3");
    expect((scrittura("sr_progetti")[0].payload as Record<string, unknown>).parent_id).toBe("p-1");
  });

  it("posizioni, complementi e servizi si copiano con id nuovi, e il complemento segue la sua finestra", async () => {
    await duplicaProgetto("p-1");
    const finestre = scrittura("sr_serramenti_progetto")[0].payload as Array<Record<string, unknown>>;
    expect(finestre).toHaveLength(2);
    expect(finestre.every((f) => f.progetto_id === "nuova-rev")).toBe(true);
    expect(finestre.map((f) => f.id)).not.toContain("s-1");
    // Il prezzo di riga e «solo fornitura» sono quelli di prima: il totale della copia è uguale a quello dell'originale.
    expect(finestre.map((f) => f.prezzo_totale)).toEqual([2400, 1600]);
    expect(finestre.map((f) => f.posa_esclusa)).toEqual([false, true]);
    const accessori = scrittura("sr_accessori_progetto")[0].payload as Array<Record<string, unknown>>;
    expect(accessori[0].serramento_id).toBe(finestre[0].id); // l'avvolgibile segue la prima finestra
    expect(accessori[1].serramento_id).toBeNull();
    expect(accessori.every((a) => a.progetto_id === "nuova-rev")).toBe(true);
    const servizi = scrittura("sr_servizi_progetto")[0].payload as Array<Record<string, unknown>>;
    expect(servizi).toHaveLength(1);
    expect(servizi[0]).toMatchObject({ progetto_id: "nuova-rev", prezzo_totale_vendita: 150 });
    for (const riga of [...finestre, ...accessori, ...servizi]) {
      expect(riga).not.toHaveProperty("created_at");
      expect(riga).not.toHaveProperty("updated_at");
    }
  });

  it("se la copia di una riga fallisce la revisione a metà finisce nel cestino e l'errore arriva a chi ha cliccato", async () => {
    db.falliscono.add("sr_accessori_progetto");
    await expect(duplicaProgetto("p-1")).rejects.toThrow(/Copia sr_accessori_progetto fallita/);
    const cestino = scrittura("sr_progetti", "update");
    expect(cestino).toHaveLength(1);
    expect(cestino[0].payload).toHaveProperty("deleted_at");
  });
});

describe("duplica dall'elenco (copia indipendente)", () => {
  it("niente padre, niente opportunità (il suo valore sommerebbe due volte lo stesso preventivo) e niente numero deciso qui", async () => {
    const esito = await duplicaProgetto("p-1", { comeRevisione: false });
    const riga = scrittura("sr_progetti")[0].payload as Record<string, unknown>;
    expect(riga).toMatchObject({ stato: "bozza", parent_id: null, opportunita_id: null, iva_percentuale: -1, sconto_percentuale: 7.5, prezzo_manuale: 9020 });
    expect(riga).not.toHaveProperty("code");
    expect(riga).not.toHaveProperty("revision_number");
    expect(esito.revision_number).toBe(1);
    expect(esito.newCode).toBe("SR-2026-0999");
  });
});
