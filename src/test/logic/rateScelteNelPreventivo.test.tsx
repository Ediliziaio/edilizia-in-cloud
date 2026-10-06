/**
 * Il numero di rate scelto per ogni preventivo edile (06/10/2026): colonna `finanziamento_rate` (NULL = quello del
 * modello), helper, adattatore del PDF, PDF vero e punti in cui la scelta deve essere collegata.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// Il setup condiviso richiede jsdom: si sceglie esplicitamente il renderer nativo di Node (come negli altri test del PDF).
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import type { AziendaComune, ProgettoComune, VoceComune } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";
import { buildFacModulePreview, createFullFacTemplate } from "@/lib/moduli-vendita/fullFacModules";
import { opzioniRate, promoConRateDelPreventivo, rateDelPreventivo } from "@/lib/preventivi/finanziamentoLite";

const leggi = (percorso: string) => readFileSync(join(process.cwd(), percorso), "utf8");

describe("rateDelPreventivo", () => {
  it("accetta un intero da 1 a 360, anche scritto come testo (dal database può arrivare così)", () => {
    expect(rateDelPreventivo(48)).toBe(48);
    expect(rateDelPreventivo("36")).toBe(36);
    expect(rateDelPreventivo(1)).toBe(1);
    expect(rateDelPreventivo(360)).toBe(360);
  });

  it("tutto il resto è «nessuna scelta» (null): vale il numero del modello", () => {
    for (const cattivo of [null, undefined, "", 0, -12, 361, 2.5, NaN, Infinity, "abc", {}, []]) {
      expect(rateDelPreventivo(cattivo), String(cattivo)).toBeNull();
    }
  });
});

describe("promoConRateDelPreventivo", () => {
  const PROMO = { attivo: true, rate: 24, tan_pct: 5.9 };

  it("mette le rate del preventivo al posto di quelle del modello e lascia il TAN e il resto", () => {
    expect(promoConRateDelPreventivo(PROMO, 48)).toEqual({ attivo: true, rate: 48, tan_pct: 5.9 });
  });

  it("senza una scelta valida ridà la promo com'era (stesso oggetto)", () => {
    for (const cattivo of [null, undefined, 0, 500, "x"]) expect(promoConRateDelPreventivo(PROMO, cattivo)).toBe(PROMO);
  });

  it("se il modello non ha la promo attiva la scelta non la accende da sola", () => {
    const spenta = { attivo: false, rate: 24, tan_pct: 0 };
    expect(promoConRateDelPreventivo(spenta, 48)).toBe(spenta);
    expect(promoConRateDelPreventivo(null, 48)).toBeNull();
    expect(promoConRateDelPreventivo(undefined, 48)).toBeUndefined();
  });

  it("non modifica l'oggetto del modello", () => {
    const copia = { ...PROMO };
    promoConRateDelPreventivo(PROMO, 60);
    expect(PROMO).toEqual(copia);
  });
});

describe("opzioniRate", () => {
  it("le durate di sempre, in ordine", () => {
    expect(opzioniRate(24)).toEqual([12, 24, 36, 48, 60, 84, 120]);
  });

  it("aggiunge quella del modello e quella già scelta se non sono in elenco, senza doppioni", () => {
    expect(opzioniRate(30, 18)).toEqual([12, 18, 24, 30, 36, 48, 60, 84, 120]);
    expect(opzioniRate(24, 24)).toEqual([12, 24, 36, 48, 60, 84, 120]);
    expect(opzioniRate(24, null)).toEqual([12, 24, 36, 48, 60, 84, 120]);
  });
});

describe("l'adattatore del PDF", () => {
  const PROGETTO = {
    id: "p1", code: "BGN-1", tipo_intervento: "rifacimento_completo", numero_bagni: 1,
    cliente_nome: "Mario", cliente_cognome: "Rossi", cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano",
    cantiere_provincia: "MI", cantiere_cap: "20100", immobile_tipo: "appartamento", immobile_superficie_mq: 90,
    immobile_anno: 1975, immobile_piani: 1,
  } as unknown as ProgettoComune;
  const TOTALI = {
    imponibileLordo: 10_000, scontoEur: 0, scontoPct: 0, imponibile: 10_000, iva: 1_000, ivaPct: 10, totale: 11_000,
    detrazionePct: 0, detrazioneEur: 0, costoTot: 0, margineEur: null as number | null, marginePct: null as number | null,
  };
  const dati = (progetto: ProgettoComune) => costruisciDatiEdile({
    modulo: MODULI_EDILI.bagni, progetto, template: {}, azienda: null as AziendaComune | null,
    capitoli: [] as Array<{ nome: string; voci: VoceComune[]; subtotale: number }>,
    totali: TOTALI, media: [] as Array<{ id: string; url: string }>,
  });

  it("passa al documento le rate scelte sul preventivo", () => {
    expect(dati({ ...PROGETTO, finanziamento_rate: 48 }).finanziamentoRate).toBe(48);
    expect(dati({ ...PROGETTO, finanziamento_rate: 120 }).finanziamentoRate).toBe(120);
  });

  it("senza scelta, o con una scelta senza senso, il documento non porta nessun numero: vale quello del modello", () => {
    expect(dati(PROGETTO).finanziamentoRate).toBeNull();
    expect(dati({ ...PROGETTO, finanziamento_rate: null }).finanziamentoRate).toBeNull();
    expect(dati({ ...PROGETTO, finanziamento_rate: 0 }).finanziamentoRate).toBeNull();
    expect(dati({ ...PROGETTO, finanziamento_rate: 9_999 }).finanziamentoRate).toBeNull();
  });

  it("la scelta delle rate non tocca «mostra la rata»", () => {
    expect(dati({ ...PROGETTO, finanziamento_rate: 48, mostra_finanziamento: false }).mostraFinanziamento).toBe(false);
    expect(dati({ ...PROGETTO, finanziamento_rate: 48 }).mostraFinanziamento).toBe(true);
  });
});

// ─── Il PDF vero ─────────────────────────────────────────────────────────────
// Impaginazione nativa su un documento di prova senza foto né rete: si legge il testo con `pdftotext`.
function documentoDiProva(totale: number, finanziamentoRate: number | null) {
  const data = buildFacModulePreview("qa", createFullFacTemplate({ company_id: "qa" }, "cappotto"), "cappotto");
  const model = data.modello;
  data.azienda.logoUrl = null; data.azienda.logoChiaroUrl = null;
  model.copertina.logoUrl = null; model.copertina.immagineUrl = null;
  model.chiSiamoFotoUrl = null; model.fotoChiusura = null; model.fotoRiempimento = {};
  model.galleriaLavori = []; data.fotoProgetto = [];
  for (const block of Object.values(model.blocchi)) block.foto = [];
  for (const page of model.pagineLibere) page.fotoUrl = null;
  model.finanziamentoPromo = { attivo: true, rate: 24, tan_pct: 0 };
  data.modulo = MODULI_EDILI.bagni;
  data.mostraFinanziamento = true;
  data.finanziamentoRate = finanziamentoRate;
  data.totali = { ...data.totali, totale };
  return data;
}

async function testoDelPdf(rate: number | null, totale = 12_000): Promise<string> {
  const bytes = await renderToBuffer(<DocumentoEdilePDF dati={documentoDiProva(totale, rate)} />);
  return execFileSync("pdftotext", ["-", "-"], { input: bytes, encoding: "utf8" }).replace(/\s+/g, " ");
}

describe("il PDF del cliente mostra le rate scelte sul preventivo", () => {
  it("senza scelta: le rate del modello (24) e la rata su 12.000 € = 500,00 €", async () => {
    const t = await testoDelPdf(null);
    expect(t).toContain("Simulazione indicativa in 24 rate mensili a tasso zero");
    expect(t).toContain("da 500,00 €/mese");
  }, 60_000);

  it("con 48 rate scelte: «in 48 rate» e 250,00 €/mese, e il 24 del modello non compare", async () => {
    const t = await testoDelPdf(48);
    expect(t).toContain("Simulazione indicativa in 48 rate mensili a tasso zero");
    expect(t).toContain("da 250,00 €/mese");
    expect(t).not.toContain("in 24 rate mensili");
    expect(t).not.toContain("da 500,00 €/mese");
  }, 60_000);
});

// ─── I punti che devono restare collegati ────────────────────────────────────
const MODULI = ["bagni", "tetti", "climatizzazione", "elettrico", "termoidraulico", "pavimenti", "piscine", "ristrutturazione"] as const;
const CARTELLA: Record<(typeof MODULI)[number], string> = {
  bagni: "Bagni", tetti: "Tetti", climatizzazione: "Climatizzazione", elettrico: "Elettrico",
  termoidraulico: "Termoidraulico", pavimenti: "Pavimenti", piscine: "Piscine", ristrutturazione: "Ristrutturazione",
};
const TABELLE = ["bgn_progetti", "tet_progetti", "clm_progetti", "ele_progetti", "idr_progetti", "pav_progetti", "pis_progetti", "rst_progetti"];

describe("la scelta delle rate è collegata in tutti e otto i moduli", () => {
  it.each(MODULI)("%s: lo step Economia la scrive nel campo del preventivo e la legge da lì", (modulo) => {
    const economia = leggi(`src/pages/azienda/${modulo}/${CARTELLA[modulo]}Wizard/StepEconomia.tsx`);
    expect(economia).toContain("rateScelte={form.finanziamento_rate}");
    expect(economia).toContain('onChangeRate={(n) => onChange("finanziamento_rate", n)}');
  });

  it.each(MODULI)("%s: il tipo del progetto ha `finanziamento_rate`", (modulo) => {
    expect(leggi(`src/types/${modulo}.ts`)).toContain("finanziamento_rate?: number | null;");
  });

  it("i tipi generati di Supabase hanno la colonna in Row, Insert e Update di ognuna delle otto tabelle", () => {
    const tipi = leggi("src/integrations/supabase/types.ts");
    for (const tabella of TABELLE) {
      const inizio = tipi.indexOf(`\n      ${tabella}: {\n        Row: {`);
      expect(inizio, tabella).toBeGreaterThan(0);
      const blocco = tipi.slice(inizio, tipi.indexOf("\n        Relationships:", inizio));
      expect(blocco.match(/finanziamento_rate\??: number \| null/g)?.length, tabella).toBe(3);
    }
  });

  it("la migrazione aggiunge la colonna vuota e senza default a tutte e otto le tabelle, con il suo limite", () => {
    const sql = leggi("supabase/migrations/20281006140000_edili_finanziamento_rate.sql");
    for (const tabella of TABELLE) expect(sql, tabella).toContain(`'${tabella}'`);
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS finanziamento_rate smallint");
    expect(sql).not.toMatch(/finanziamento_rate smallint\s+(NOT NULL|DEFAULT)/i);
    expect(sql).toContain("finanziamento_rate IS NULL OR finanziamento_rate BETWEEN 1 AND 360");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS");
  });

  it("il PDF usa le rate del preventivo e non solo quelle del modello", () => {
    const pdf = leggi("src/components/preventivi/pdf/DocumentoEdilePDF.tsx");
    expect(pdf).toContain("promoConRateDelPreventivo(modello.finanziamentoPromo, dati.finanziamentoRate)");
    expect(leggi("src/components/preventivi/pdf/adattatoreEdile.ts")).toContain("finanziamentoRate: rateDelPreventivo(p.finanziamento_rate)");
  });
});
