/**
 * Stessi input ⇒ stesso totale, in tutte le viste dei preventivi edili (06/10/2026):
 * anteprima a destra (`anteprimaComputo`), PDF (`enrich<Modulo>Pdf`, la funzione vera) e
 * totali scritti nel database dal salvataggio (`useSaveComputo` e `useUpsertProgetto`, con un
 * database finto che registra cosa viene scritto). Gli otto moduli, sette scenari ciascuno.
 * I numeri attesi sono fatti a mano al centesimo (ogni riga arrotondata, poi somme) e spiegati
 * accanto allo scenario; le tre viste devono dire esattamente lo stesso numero.
 */
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as calcoliBagni from "@/lib/bagni/calcoli";
import * as calcoliTetti from "@/lib/tetti/calcoli";
import * as calcoliClm from "@/lib/climatizzazione/calcoli";
import * as calcoliEle from "@/lib/elettrico/calcoli";
import * as calcoliIdr from "@/lib/termoidraulico/calcoli";
import * as calcoliPav from "@/lib/pavimenti/calcoli";
import * as calcoliPis from "@/lib/piscine/calcoli";
import * as calcoliRst from "@/lib/ristrutturazione/calcoli";
import { anteprimaComputo, type CalcoliComputo, type VoceComputoAnteprima } from "@/lib/preventivatore/anteprimaComputo";

vi.setConfig({ testTimeout: 60_000 });

type Scrittura = { tabella: string; operazione: "insert" | "update" | "delete"; dati: unknown };
const { scritture, db } = vi.hoisted(() => ({
  scritture: [] as Array<{ tabella: string; operazione: "insert" | "update" | "delete"; dati: unknown }>,
  // Cosa «c'è» nel database: il progetto (parametri economici) e le sue voci.
  db: { progetto: {} as Record<string, unknown>, voci: [] as Array<Record<string, unknown>> },
}));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): unknown => {
    let operazione: "select" | "insert" | "update" | "delete" = "select";
    let colonne = "";
    let unaRiga = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = new Proxy({}, {
      get: (_t, nome) => {
        if (nome === "then") {
          return (ok: (v: unknown) => unknown) => {
            let data: unknown = null;
            if (operazione === "select") {
              if (tabella.endsWith("_computo_voci")) data = colonne.trim() === "id" ? db.voci.map((_, i) => ({ id: `vecchia-${i}` })) : db.voci;
              else if (tabella.endsWith("_progetti")) data = unaRiga ? db.progetto : [db.progetto];
              else data = unaRiga ? null : [];
            } else if (unaRiga) data = { id: "p1", ...(scritture[scritture.length - 1]?.dati as object) };
            return Promise.resolve({ data, error: null as null, count: 0 }).then(ok);
          };
        }
        if (nome === "select") return (c?: string) => { if (operazione === "select") colonne = c ?? ""; return p; };
        if (nome === "insert" || nome === "update" || nome === "delete") {
          return (dati?: unknown) => { operazione = nome as typeof operazione; scritture.push({ tabella, operazione: nome as Scrittura["operazione"], dati }); return p; };
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

interface Modulo {
  slug: string; sigla: string; ivaDiRiserva: number; calcoli: CalcoliComputo; funzione: string;
  hook: () => Promise<Record<string, unknown>>; pdf: () => Promise<Record<string, unknown>>;
}
const MODULI: Modulo[] = [
  { slug: "bagni", sigla: "bgn", ivaDiRiserva: 10, calcoli: calcoliBagni, funzione: "enrichBagniPdf", hook: () => import("@/hooks/useBagniProgetto"), pdf: () => import("@/hooks/useBagniPDF") },
  { slug: "tetti", sigla: "tet", ivaDiRiserva: 10, calcoli: calcoliTetti, funzione: "enrichTettiPdf", hook: () => import("@/hooks/useTettiProgetto"), pdf: () => import("@/hooks/useTettiPDF") },
  { slug: "climatizzazione", sigla: "clm", ivaDiRiserva: 22, calcoli: calcoliClm, funzione: "enrichClimatizzazionePdf", hook: () => import("@/hooks/useClimatizzazioneProgetto"), pdf: () => import("@/hooks/useClimatizzazionePDF") },
  { slug: "elettrico", sigla: "ele", ivaDiRiserva: 22, calcoli: calcoliEle, funzione: "enrichElettricoPdf", hook: () => import("@/hooks/useElettricoProgetto"), pdf: () => import("@/hooks/useElettricoPDF") },
  { slug: "termoidraulico", sigla: "idr", ivaDiRiserva: 22, calcoli: calcoliIdr, funzione: "enrichTermoidraulicoPdf", hook: () => import("@/hooks/useTermoidraulicoProgetto"), pdf: () => import("@/hooks/useTermoidraulicoPDF") },
  { slug: "pavimenti", sigla: "pav", ivaDiRiserva: 22, calcoli: calcoliPav, funzione: "enrichPavimentiPdf", hook: () => import("@/hooks/usePavimentiProgetto"), pdf: () => import("@/hooks/usePavimentiPDF") },
  { slug: "piscine", sigla: "pis", ivaDiRiserva: 22, calcoli: calcoliPis, funzione: "enrichPiscinePdf", hook: () => import("@/hooks/usePiscineProgetto"), pdf: () => import("@/hooks/usePiscinePDF") },
  { slug: "ristrutturazione", sigla: "rst", ivaDiRiserva: 22, calcoli: calcoliRst, funzione: "enrichRistrutturazionePdf", hook: () => import("@/hooks/useRistrutturazioneProgetto"), pdf: () => import("@/hooks/useRistrutturazionePDF") },
];

const voce = (id: string, capitolo: string, q: number, p: number, sc = 0, costi: [number, number] = [0, 0]) => ({
  id, progetto_id: "p1", company_id: "c1", capitolo_nome: capitolo, descrizione: `Voce ${id}`, unita_misura: "cad", quantita: q, prezzo_unitario: p,
  costo_materiali: costi[0], costo_manodopera: costi[1], sconto_pct: sc, importo: 0, margine_eur: 0, margine_pct: 0,
  listino_voce_id: null as string | null, fonte: null as string | null, ordine: 0,
});

// 12,5 mq × 33,33 = 416,625 → 416,63 · 3 × 1.234,56 − 10% = 3.333,312 → 3.333,31 · 1 × 800
// → lordo 416,63 + 3.333,31 + 800 = 4.549,94
const VOCI = [voce("a", "Opere", 12.5, 33.33), voce("b", "Opere", 3, 1234.56, 10), voce("c", "Impianti", 1, 800, 0, [300, 100])];

interface Scenario {
  nome: string;
  voci: typeof VOCI;
  progetto: { sconto_pct?: number | null; iva_pct?: number | null; prezzo_manuale?: number | null };
  /** Imponibile e totale attesi, fatti a mano (dipendono dall'IVA di riserva del modulo se il progetto non ne ha una). */
  atteso?: (ivaRiserva: number) => { imponibile: number; totale: number };
}
const SCENARI: Scenario[] = [
  // IVA 22% su 4.549,94 = 1.000,9868 → 1.000,99; totale 5.550,93
  { nome: "senza sconto, IVA 22%", voci: VOCI, progetto: { sconto_pct: 0, iva_pct: 22, prezzo_manuale: null }, atteso: () => ({ imponibile: 4549.94, totale: 5550.93 }) },
  // sconto 7,5%: 4.549,94 × 0,925 = 4.208,6945 → 4.208,69; IVA 10% = 420,869 → 420,87; totale 4.629,56
  { nome: "sconto 7,5%, IVA 10%", voci: VOCI, progetto: { sconto_pct: 7.5, iva_pct: 10, prezzo_manuale: null }, atteso: () => ({ imponibile: 4208.69, totale: 4629.56 }) },
  { nome: "prezzo a mano 9.800 + sconto 5% + IVA 4%", voci: VOCI, progetto: { sconto_pct: 5, iva_pct: 4, prezzo_manuale: 9800 }, atteso: () => ({ imponibile: 9310, totale: 9682.4 }) },
  { nome: "sconto 100%", voci: VOCI, progetto: { sconto_pct: 100, iva_pct: 22, prezzo_manuale: null }, atteso: () => ({ imponibile: 0, totale: 0 }) },
  { nome: "IVA 0%", voci: VOCI, progetto: { sconto_pct: 0, iva_pct: 0, prezzo_manuale: null }, atteso: () => ({ imponibile: 4549.94, totale: 4549.94 }) },
  // IVA di riserva 10% (bagni, tetti): 454,994 → 454,99, totale 5.004,93 · 22% (gli altri): 1.000,99, totale 5.550,93
  { nome: "IVA e sconto assenti: vale l'IVA di riserva del modulo", voci: VOCI, progetto: { sconto_pct: null, iva_pct: null, prezzo_manuale: null }, atteso: (iva) => ({ imponibile: 4549.94, totale: iva === 10 ? 5004.93 : 5550.93 }) },
  { nome: "computo vuoto col prezzo a mano 5.000, IVA 22%", voci: [], progetto: { sconto_pct: 0, iva_pct: 22, prezzo_manuale: 5000 }, atteso: () => ({ imponibile: 5000, totale: 6100 }) },
];

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);
// Le tre viste usano gli stessi centesimi: devono dire esattamente lo stesso numero.
const uguale = (a: number, b: number) => expect(a).toBe(b);

beforeEach(() => { scritture.length = 0; db.progetto = {}; db.voci = []; });

describe.each(MODULI)("$slug: anteprima, PDF e totali salvati dicono lo stesso", ({ slug, sigla, ivaDiRiserva, calcoli, funzione, hook, pdf }) => {
  it.each(SCENARI)("$nome", async ({ voci, progetto, atteso }) => {
    // 1. Anteprima a destra: l'IVA di riserva la dice il wizard (`ivaDefault`).
    const vociAnteprima: VoceComputoAnteprima[] = voci.map((v) => ({ ...v }));
    const a = anteprimaComputo(vociAnteprima, progetto, calcoli, { ivaDefault: ivaDiRiserva });

    // 2. PDF: la funzione vera del modulo.
    const moduloPdf = await pdf();
    const enrich = moduloPdf[funzione] as (o: unknown) => Promise<{ totali: { imponibile: number; iva: number; totale: number; ivaPct: number; scontoPct: number } }>;
    const { totali } = await enrich({
      progetto: { id: "p1", company_id: "c1", code: `${sigla.toUpperCase()}-1`, ...progetto },
      computo: voci, media: [], template: { company_id: "c1" }, company: { name: "Bianchi" },
    });

    // 3. Totali scritti dal salvataggio del computo (parametri economici letti dal database).
    db.progetto = { sconto_pct: progetto.sconto_pct, iva_pct: progetto.iva_pct, prezzo_manuale: progetto.prezzo_manuale };
    db.voci = voci.map((v) => ({ ...v }));
    const moduloHook = await hook();
    const { result } = renderHook(() => (moduloHook.useSaveComputo as (id: string) => { mutateAsync: (r: unknown[]) => Promise<{ totale_imponibile: number; totale: number }> })("p1"), { wrapper });
    const salvati = await result.current.mutateAsync(voci.map((v) => ({ ...v })));
    const aggiornamento = scritture.filter((s) => s.tabella === `${sigla}_progetti` && s.operazione === "update").pop()?.dati as { totale_imponibile: number; totale: number } | undefined;

    // I tre dicono la stessa cosa…
    if (a.totaleDocumento != null) uguale(a.totaleDocumento, totali.totale);
    uguale(salvati.totale, totali.totale);
    uguale(salvati.totale_imponibile, totali.imponibile);
    // …e quella scritta nel database è esattamente quella restituita.
    expect(aggiornamento?.totale).toBe(salvati.totale);
    expect(aggiornamento?.totale_imponibile).toBe(salvati.totale_imponibile);
    // L'IVA stampata è quella applicata: totale = imponibile + IVA, anche a centesimi.
    uguale(Math.round(totali.totale * 100), Math.round(totali.imponibile * 100) + Math.round(totali.iva * 100));
    // …ed è quella fatta a mano nello scenario.
    const e = atteso?.(ivaDiRiserva);
    if (e) {
      uguale(totali.imponibile, e.imponibile);
      uguale(totali.totale, e.totale);
    }
    expect(slug).toBeTruthy();
  });

  it("cambiare sconto, IVA o prezzo a mano dal wizard ricalcola i totali salvati sulle voci del database", async () => {
    db.voci = VOCI.map((v) => ({ ...v }));
    db.progetto = { sconto_pct: 0, iva_pct: 22, prezzo_manuale: null };
    const moduloHook = await hook();
    const { result } = renderHook(() => (moduloHook.useUpsertProgetto as () => { mutateAsync: (i: unknown) => Promise<unknown> })(), { wrapper });
    // Il wizard rimanda la riga intera: qui basta lo sconto, l'IVA e il prezzo vengono dal database.
    await result.current.mutateAsync({ id: "p1", sconto_pct: 10 });
    let u = scritture.filter((s) => s.tabella === `${sigla}_progetti` && s.operazione === "update").pop()?.dati as Record<string, number>;
    // 4.549,94 − 10% = 4.094,946 → 4.094,95; con IVA 22% 4.094,946 × 1,22 = 4.995,83412 → 4.995,83
    uguale(u.totale_imponibile, 4094.95);
    uguale(u.totale, 4995.83);
    // Il prezzo scritto a mano comanda anche se lo sconto non cambia.
    scritture.length = 0;
    await result.current.mutateAsync({ id: "p1", prezzo_manuale: 8000 });
    u = scritture.filter((s) => s.tabella === `${sigla}_progetti` && s.operazione === "update").pop()?.dati as Record<string, number>;
    uguale(u.totale_imponibile, 8000);
    uguale(u.totale, 9760);
    // Un patch che non tocca i parametri economici non riscrive i totali.
    scritture.length = 0;
    await result.current.mutateAsync({ id: "p1", cliente_nome: "Mario" });
    u = scritture.filter((s) => s.tabella === `${sigla}_progetti` && s.operazione === "update").pop()?.dati as Record<string, number>;
    expect(u.totale).toBeUndefined();
    expect(u.totale_imponibile).toBeUndefined();
  });
});
