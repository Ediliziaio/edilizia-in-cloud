/// <reference types="node" />
/**
 * Il tetto di spesa «di serie» della detrazione di un preventivo edile NUOVO (06/10/2026).
 *
 * Il template PDF dell'azienda può dire «detrazione predefinita 50%» (di serie lo dicono Bagni, Tetti e
 * Ristrutturazione): il preventivo nuovo partiva col 50% ma senza tetto di spesa, e sopra i 96.000 € di imponibile
 * prometteva al cliente più di quanto la legge consente (60.000 € invece di 48.000 € su 120.000 €). Ora una
 * detrazione ordinaria (50% abitazione principale, 36% altre abitazioni) nasce col suo tetto di 96.000 €.
 *
 * Regole provate qui:
 *  - il tetto di serie c'è solo per il 50% e il 36% presi dal template, e solo se chi crea non ha già scelto
 *    né la detrazione né il tetto (Conto Termico e Casa Full Electric, che hanno i loro incentivi, non lo ricevono);
 *  - vale per i preventivi NUOVI: nessuna scrittura su quelli esistenti (qui si prova solo la creazione);
 *  - dal preventivo appena creato, 120.000 € al 50% fanno 48.000 € nell'anteprima, nei totali del PDF e nella
 *    cifra stampata dal PDF vero (renderer offline, cifre lette dal testo).
 */
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });

const { scritture, ctl } = vi.hoisted(() => ({
  scritture: [] as Array<{ tabella: string; riga: Record<string, unknown> }>,
  // Detrazione predefinita nel template PDF dell'azienda (null = template senza valore).
  ctl: { detrazioneTemplate: 50 as number | null },
}));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): unknown => {
    let inserita: Record<string, unknown> | null = null;
    let unaRiga = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = new Proxy({}, {
      get: (_t, nome) => {
        if (nome === "then") {
          return (ok: (v: unknown) => unknown) => {
            let data: unknown = [];
            if (inserita) data = unaRiga ? { id: "nuovo", ...inserita } : [inserita];
            else if (tabella.endsWith("_template_pdf")) data = unaRiga ? { default_iva_pct: 10, default_detrazione_pct: ctl.detrazioneTemplate } : [];
            else if (unaRiga) data = null;
            return Promise.resolve({ data, error: null as null, count: 3 }).then(ok);
          };
        }
        if (nome === "insert") {
          return (riga: unknown) => {
            inserita = (Array.isArray(riga) ? riga[0] : riga) as Record<string, unknown>;
            scritture.push({ tabella, riga: inserita });
            return p;
          };
        }
        if (nome === "single" || nome === "maybeSingle") return () => { unaRiga = true; return p; };
        return () => p;
      },
    });
    return p;
  };
  const nulla = (): Promise<{ data: null; error: null }> => Promise.resolve({ data: null, error: null });
  return {
    supabase: {
      from: (t: string) => catena(t), rpc: nulla, functions: { invoke: nulla },
      storage: { from: () => ({ createSignedUrl: nulla, createSignedUrls: () => Promise.resolve({ data: [] as unknown[], error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
      auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    },
  };
});
vi.mock("@/lib/serramenti/pdfImageUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/serramenti/pdfImageUtils")>()),
  toDataUrl: async (): Promise<string | null> => null,
}));

import { condizioniDiPartenza } from "@/lib/moduli/salvataggioProgetto";
import * as calcoliBagni from "@/lib/bagni/calcoli";
import * as calcoliTetti from "@/lib/tetti/calcoli";
import * as calcoliClm from "@/lib/climatizzazione/calcoli";
import * as calcoliEle from "@/lib/elettrico/calcoli";
import * as calcoliIdr from "@/lib/termoidraulico/calcoli";
import * as calcoliPav from "@/lib/pavimenti/calcoli";
import * as calcoliPis from "@/lib/piscine/calcoli";
import * as calcoliRst from "@/lib/ristrutturazione/calcoli";
import { anteprimaComputo, type CalcoliComputo } from "@/lib/preventivatore/anteprimaComputo";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { MODULI_EDILI, type ChiaveModuloEdile } from "@/components/preventivi/pdf/moduliEdili";

beforeEach(() => { scritture.length = 0; ctl.detrazioneTemplate = 50; });

describe("condizioniDiPartenza: una detrazione ordinaria presa dal template nasce col suo tetto", () => {
  const template = (detrazione: number | string | null) => ({ default_iva_pct: 10, default_detrazione_pct: detrazione });

  it("50% dal template → tetto 96.000 €", () => {
    expect(condizioniDiPartenza({}, template(50))).toEqual({ iva_pct: 10, detrazione_pct: 50, massimale_detrazione: 96_000 });
  });

  it("36% dal template → tetto 96.000 €", () => {
    expect(condizioniDiPartenza({}, template(36))).toEqual({ iva_pct: 10, detrazione_pct: 36, massimale_detrazione: 96_000 });
  });

  it("il valore del template arriva anche come testo («50»), come lo restituisce il database per un numeric", () => {
    expect(condizioniDiPartenza({}, template("50"))).toMatchObject({ detrazione_pct: 50, massimale_detrazione: 96_000 });
  });

  it.each([0, 20, 65, 75, 100])("%s% dal template: nessun tetto inventato (non è la detrazione ordinaria)", (pct) => {
    expect(condizioniDiPartenza({}, template(pct))).not.toHaveProperty("massimale_detrazione");
  });

  it("senza template, o con la detrazione vuota o fuori scala, non si aggiunge nulla", () => {
    expect(condizioniDiPartenza({}, null)).toEqual({});
    expect(condizioniDiPartenza({}, template(null))).toEqual({ iva_pct: 10 });
    expect(condizioniDiPartenza({}, template(150))).toEqual({ iva_pct: 10 });
  });

  it("chi crea ha già scelto la detrazione (Conto Termico e Casa Full Electric: 0% e nessun tetto): niente tetto di serie", () => {
    expect(condizioniDiPartenza({ detrazione_pct: 0, massimale_detrazione: null }, template(50))).toEqual({ iva_pct: 10 });
    expect(condizioniDiPartenza({ detrazione_pct: 0 }, template(50))).toEqual({ iva_pct: 10 });
  });

  it("il tetto scelto da chi crea resta: 120.000 €, e anche «nessun tetto» (null)", () => {
    expect(condizioniDiPartenza({ massimale_detrazione: 120_000 }, template(50))).toEqual({ iva_pct: 10, detrazione_pct: 50 });
    expect(condizioniDiPartenza({ massimale_detrazione: null }, template(50))).toEqual({ iva_pct: 10, detrazione_pct: 50 });
  });

  it("una detrazione 50% scelta a mano da chi crea non riceve un tetto non chiesto: lo dà il chip degli incentivi", () => {
    expect(condizioniDiPartenza({ detrazione_pct: 50 }, template(50))).toEqual({ iva_pct: 10 });
  });
});

const MODULI: Array<{
  slug: ChiaveModuloEdile; sigla: string; ivaDiRiserva: number; calcoli: CalcoliComputo; enrich: string;
  pdf: () => Promise<Record<string, unknown>>; hook: () => Promise<Record<string, unknown>>;
}> = [
  { slug: "bagni", sigla: "bgn", ivaDiRiserva: 10, calcoli: calcoliBagni, enrich: "enrichBagniPdf", pdf: () => import("@/hooks/useBagniPDF"), hook: () => import("@/hooks/useBagniProgetto") },
  { slug: "tetti", sigla: "tet", ivaDiRiserva: 10, calcoli: calcoliTetti, enrich: "enrichTettiPdf", pdf: () => import("@/hooks/useTettiPDF"), hook: () => import("@/hooks/useTettiProgetto") },
  { slug: "climatizzazione", sigla: "clm", ivaDiRiserva: 22, calcoli: calcoliClm, enrich: "enrichClimatizzazionePdf", pdf: () => import("@/hooks/useClimatizzazionePDF"), hook: () => import("@/hooks/useClimatizzazioneProgetto") },
  { slug: "elettrico", sigla: "ele", ivaDiRiserva: 22, calcoli: calcoliEle, enrich: "enrichElettricoPdf", pdf: () => import("@/hooks/useElettricoPDF"), hook: () => import("@/hooks/useElettricoProgetto") },
  { slug: "termoidraulico", sigla: "idr", ivaDiRiserva: 22, calcoli: calcoliIdr, enrich: "enrichTermoidraulicoPdf", pdf: () => import("@/hooks/useTermoidraulicoPDF"), hook: () => import("@/hooks/useTermoidraulicoProgetto") },
  { slug: "pavimenti", sigla: "pav", ivaDiRiserva: 22, calcoli: calcoliPav, enrich: "enrichPavimentiPdf", pdf: () => import("@/hooks/usePavimentiPDF"), hook: () => import("@/hooks/usePavimentiProgetto") },
  { slug: "piscine", sigla: "pis", ivaDiRiserva: 22, calcoli: calcoliPis, enrich: "enrichPiscinePdf", pdf: () => import("@/hooks/usePiscinePDF"), hook: () => import("@/hooks/usePiscineProgetto") },
  { slug: "ristrutturazione", sigla: "rst", ivaDiRiserva: 22, calcoli: calcoliRst, enrich: "enrichRistrutturazionePdf", pdf: () => import("@/hooks/useRistrutturazionePDF"), hook: () => import("@/hooks/useRistrutturazioneProgetto") },
];

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

type Riga = Record<string, unknown>;
type Creazione = (patch: Riga) => Promise<Riga>;

/** Crea un preventivo nuovo con l'hook vero del modulo; restituisce la riga come il database la restituirebbe. */
async function creaNuovo(hook: () => Promise<Record<string, unknown>>, patch: Riga): Promise<Riga> {
  const modulo = await hook();
  const { result } = renderHook(() => (modulo.useUpsertProgetto as () => { mutateAsync: Creazione })(), { wrapper });
  return result.current.mutateAsync(patch);
}

async function testoDelPdf(elemento: Parameters<typeof renderToBuffer>[0]): Promise<string> {
  const bytes = await renderToBuffer(elemento);
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let testo = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i);
    testo += (await pagina.getTextContent()).items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
  }
  return testo.replace(/\s+/g, " ");
}

const voce = (prezzo: number) => ({
  id: "v1", progetto_id: "nuovo", company_id: "c1", capitolo_nome: "Opere", descrizione: "Opere edili", unita_misura: "corpo", quantita: 1,
  prezzo_unitario: prezzo, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: prezzo, margine_eur: 0, margine_pct: 0,
  listino_voce_id: null as string | null, fonte: null as string | null, ordine: 0,
});

describe.each(MODULI)("preventivo nuovo di $slug", ({ slug, sigla, ivaDiRiserva, calcoli, enrich, pdf, hook }) => {
  it("con la detrazione 50% predefinita dall'azienda nasce col tetto di 96.000 €", async () => {
    await creaNuovo(hook, { tipo_intervento: "x" });
    const inserita = scritture.find((s) => s.tabella === `${sigla}_progetti`)?.riga;
    expect(inserita).toMatchObject({ detrazione_pct: 50, massimale_detrazione: 96_000 });
  });

  it("senza detrazione predefinita (template a 0%) nasce senza detrazione e senza tetto", async () => {
    ctl.detrazioneTemplate = 0;
    await creaNuovo(hook, { tipo_intervento: "x" });
    const inserita = scritture.find((s) => s.tabella === `${sigla}_progetti`)?.riga;
    expect(inserita).toMatchObject({ detrazione_pct: 0 });
    expect(inserita?.massimale_detrazione ?? null).toBeNull();
  });

  it("un tetto già scelto alla creazione (120.000 €) non viene toccato", async () => {
    await creaNuovo(hook, { tipo_intervento: "x", massimale_detrazione: 120_000 });
    const inserita = scritture.find((s) => s.tabella === `${sigla}_progetti`)?.riga;
    expect(inserita).toMatchObject({ detrazione_pct: 50, massimale_detrazione: 120_000 });
  });

  it("120.000 € al 50% sul preventivo appena creato: anteprima, totali del PDF e cifra stampata dicono 48.000 €", async () => {
    const riga = await creaNuovo(hook, { tipo_intervento: "x", iva_pct: ivaDiRiserva });
    const voci = [voce(120_000)];

    const a = anteprimaComputo(voci, { sconto_pct: 0, iva_pct: ivaDiRiserva, ...riga }, calcoli, { ivaDefault: ivaDiRiserva });
    expect(a.detrazione?.importo).toBeCloseTo(48_000, 6);

    const modulo = await pdf();
    const e = await (modulo[enrich] as (o: unknown) => Promise<{ progetto: unknown; template: unknown; company: unknown; capitoli: unknown; totali: { detrazioneEur: number; detrazionePct: number } }>)({
      progetto: { code: "X-1", sconto_pct: 0, ...riga, id: "nuovo", company_id: "c1" }, computo: voci, media: [],
      template: { company_id: "c1", show_chi_siamo: false }, company: { name: "Bianchi" },
    });
    expect(e.totali.detrazioneEur).toBeCloseTo(48_000, 6);

    const dati = costruisciDatiEdile({
      modulo: MODULI_EDILI[slug], progetto: e.progetto as never, template: e.template as never, azienda: e.company as never,
      capitoli: e.capitoli as never, totali: e.totali as never, media: [],
    });
    const testo = await testoDelPdf(<DocumentoEdilePDF dati={dati} />);
    // Il PDF distanzia le lettere dei titoli: pdfjs legge «5 0 %». La cifra della detrazione è seguita da «recuperabili».
    expect(testo).toMatch(/5\s*0\s*%\s+48\.000,00 € recuperabili/);
    expect(testo).not.toContain("60.000,00 €");
  });
});

describe("Termoidraulico: Conto Termico e Casa Full Electric non ricevono il tetto di serie", () => {
  // Il wizard li crea con la detrazione generica spenta (hanno i loro incentivi): il template a 50% non li tocca.
  it.each(["conto-termico", "full-electric"])("«%s» nasce con 0% e nessun tetto, anche se il template dice 50%", async (id) => {
    await creaNuovo(() => import("@/hooks/useTermoidraulicoProgetto"), { tipo_intervento: id, detrazione_pct: 0, massimale_detrazione: null });
    const inserita = scritture.find((s) => s.tabella === "idr_progetti")?.riga;
    expect(inserita).toMatchObject({ detrazione_pct: 0, massimale_detrazione: null });
  });
});
