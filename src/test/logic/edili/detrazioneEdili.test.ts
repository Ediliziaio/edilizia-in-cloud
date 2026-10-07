/**
 * La detrazione fiscale indicativa dei preventivi edili (06/10/2026): base, tetto di spesa
 * (`massimale_detrazione`) e aliquota, uguali nell'anteprima a destra e nel PDF, in tutti e
 * otto i moduli. Il tetto dei Tetti non veniva mai applicato: `tet_progetti` ha la colonna
 * dal 14/09 (20280916960000_moduli_autore_e_massimale_tetti, in produzione) ma il codice dei
 * tetti non la leggeva, e sopra 96.000 € di imponibile il PDF prometteva il 50% di tutto.
 */
import { describe, expect, it, vi } from "vitest";
import * as calcoliBagni from "@/lib/bagni/calcoli";
import * as calcoliTetti from "@/lib/tetti/calcoli";
import * as calcoliClm from "@/lib/climatizzazione/calcoli";
import * as calcoliEle from "@/lib/elettrico/calcoli";
import * as calcoliIdr from "@/lib/termoidraulico/calcoli";
import * as calcoliPav from "@/lib/pavimenti/calcoli";
import * as calcoliPis from "@/lib/piscine/calcoli";
import * as calcoliRst from "@/lib/ristrutturazione/calcoli";
import { anteprimaComputo, type CalcoliComputo } from "@/lib/preventivatore/anteprimaComputo";
import { calcDetraibile, superaMassimale } from "@/lib/preventivi/incentivi";

vi.setConfig({ testTimeout: 60_000 });

vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, {
    get: (_t, nome) => (nome === "then"
      ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: [] as unknown[], error: null as null }).then(ok)
      : () => catena),
  });
  const nulla = (): Promise<{ data: null; error: null }> => Promise.resolve({ data: null, error: null });
  return {
    supabase: {
      from: () => catena, rpc: nulla, functions: { invoke: nulla },
      storage: { from: () => ({ createSignedUrl: nulla, createSignedUrls: () => Promise.resolve({ data: [] as unknown[], error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
      auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    },
  };
});
vi.mock("@/lib/serramenti/pdfImageUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/serramenti/pdfImageUtils")>()),
  toDataUrl: async (): Promise<string | null> => null,
}));

describe("calcDetraibile: base × aliquota, la base è l'imponibile entro il tetto", () => {
  // Atteso calcolato a mano: min(base, tetto) × % / 100.
  it.each([
    // [imponibile, %, tetto, atteso, spiegazione]
    [10_000, 50, null, 5_000, "senza tetto: 50% di 10.000"],
    [50_000, 50, 96_000, 25_000, "sotto il tetto: 50% di 50.000"],
    [96_000, 50, 96_000, 48_000, "esattamente sul tetto"],
    [96_000.01, 50, 96_000, 48_000, "un centesimo sopra il tetto: resta 48.000"],
    [120_000, 36, 96_000, 34_560, "altre abitazioni: 36% di 96.000"],
    [120_000, 50, 0, 60_000, "tetto 0 = nessun tetto"],
    [120_000, 50, -5, 60_000, "tetto negativo = nessun tetto"],
    [0, 50, 96_000, 0, "computo vuoto"],
    [-5_000, 50, null, 0, "imponibile negativo vale 0"],
    [10_000, 150, null, 10_000, "aliquota oltre il 100% vale 100%"],
    [10_000, -20, null, 0, "aliquota negativa vale 0"],
    [10_000, Number.NaN, null, 0, "aliquota non valida vale 0"],
  ])("imponibile %s, %s%%, tetto %s → %s (%s)", (imponibile, pct, tetto, atteso) => {
    expect(calcDetraibile(imponibile as number, pct as number, tetto as number | null)).toBeCloseTo(atteso as number, 9);
  });

  it("superaMassimale: solo sopra il tetto, mai senza tetto", () => {
    expect(superaMassimale(96_000, 96_000)).toBe(false);
    expect(superaMassimale(96_000.01, 96_000)).toBe(true);
    expect(superaMassimale(1e9, null)).toBe(false);
    expect(superaMassimale(1e9, 0)).toBe(false);
  });
});

const MODULI: Array<{ slug: string; ivaDiRiserva: number; calcoli: CalcoliComputo; funzione: string; pdf: () => Promise<Record<string, unknown>> }> = [
  { slug: "bagni", ivaDiRiserva: 10, calcoli: calcoliBagni, funzione: "enrichBagniPdf", pdf: () => import("@/hooks/useBagniPDF") },
  { slug: "tetti", ivaDiRiserva: 10, calcoli: calcoliTetti, funzione: "enrichTettiPdf", pdf: () => import("@/hooks/useTettiPDF") },
  { slug: "climatizzazione", ivaDiRiserva: 22, calcoli: calcoliClm, funzione: "enrichClimatizzazionePdf", pdf: () => import("@/hooks/useClimatizzazionePDF") },
  { slug: "elettrico", ivaDiRiserva: 22, calcoli: calcoliEle, funzione: "enrichElettricoPdf", pdf: () => import("@/hooks/useElettricoPDF") },
  { slug: "termoidraulico", ivaDiRiserva: 22, calcoli: calcoliIdr, funzione: "enrichTermoidraulicoPdf", pdf: () => import("@/hooks/useTermoidraulicoPDF") },
  { slug: "pavimenti", ivaDiRiserva: 22, calcoli: calcoliPav, funzione: "enrichPavimentiPdf", pdf: () => import("@/hooks/usePavimentiPDF") },
  { slug: "piscine", ivaDiRiserva: 22, calcoli: calcoliPis, funzione: "enrichPiscinePdf", pdf: () => import("@/hooks/usePiscinePDF") },
  { slug: "ristrutturazione", ivaDiRiserva: 22, calcoli: calcoliRst, funzione: "enrichRistrutturazionePdf", pdf: () => import("@/hooks/useRistrutturazionePDF") },
];

const voce = (prezzo: number) => ({
  id: "v1", progetto_id: "p1", company_id: "c1", capitolo_nome: "Opere", descrizione: "Opere edili", unita_misura: "corpo", quantita: 1,
  prezzo_unitario: prezzo, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: prezzo, margine_eur: 0, margine_pct: 0,
  listino_voce_id: null as string | null, fonte: null as string | null, ordine: 0,
});

describe.each(MODULI)("detrazione di $slug: anteprima e PDF dicono lo stesso", ({ ivaDiRiserva, calcoli, funzione, pdf }) => {
  const SCENARI: Array<{ nome: string; prezzo: number; progetto: Record<string, unknown>; atteso: number | null }> = [
    // 120.000 netti, 50%, tetto 96.000 → 48.000 (non 60.000)
    { nome: "oltre il tetto: 50% di 96.000", prezzo: 120_000, progetto: { detrazione_pct: 50, massimale_detrazione: 96_000, iva_pct: 22 }, atteso: 48_000 },
    // 50.000 netti sotto il tetto → 25.000
    { nome: "sotto il tetto: 50% dell'imponibile", prezzo: 50_000, progetto: { detrazione_pct: 50, massimale_detrazione: 96_000, iva_pct: 22 }, atteso: 25_000 },
    // sconto 10%: 120.000 − 10% = 108.000 netti → oltre il tetto → 36% di 96.000 = 34.560
    { nome: "lo sconto riduce la base, poi il tetto: 36% di 96.000", prezzo: 120_000, progetto: { detrazione_pct: 36, massimale_detrazione: 96_000, sconto_pct: 10, iva_pct: 10 }, atteso: 34_560 },
    // senza tetto scelto la stima è sull'intero imponibile: 60.000
    { nome: "senza tetto: stima sull'intero imponibile", prezzo: 120_000, progetto: { detrazione_pct: 50, massimale_detrazione: null, iva_pct: 22 }, atteso: 60_000 },
    { nome: "detrazione 0%: nessuna detrazione", prezzo: 120_000, progetto: { detrazione_pct: 0, massimale_detrazione: 96_000, iva_pct: 22 }, atteso: null },
  ];

  it.each(SCENARI)("$nome", async ({ prezzo, progetto, atteso }) => {
    const voci = [voce(prezzo)];
    const a = anteprimaComputo(voci, { sconto_pct: 0, iva_pct: ivaDiRiserva, ...progetto }, calcoli, { ivaDefault: ivaDiRiserva });
    const modulo = await pdf();
    const enrich = modulo[funzione] as (o: unknown) => Promise<{ totali: { detrazioneEur: number; detrazionePct: number } }>;
    const { totali } = await enrich({
      progetto: { id: "p1", company_id: "c1", code: "X-1", sconto_pct: 0, iva_pct: ivaDiRiserva, ...progetto },
      computo: voci, media: [], template: { company_id: "c1" }, company: { name: "Bianchi" },
    });
    if (atteso == null) {
      expect(a.detrazione).toBeNull();
      expect(totali.detrazioneEur).toBe(0);
    } else {
      expect(a.detrazione?.importo).toBeCloseTo(atteso, 6);
      expect(totali.detrazioneEur).toBeCloseTo(atteso, 6);
    }
  });
});
