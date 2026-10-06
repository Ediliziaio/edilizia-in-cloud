/**
 * «Duplica» un preventivo edile: la copia tiene le CONDIZIONI (tipo di intervento, sconto,
 * IVA, prezzo a mano, detrazione e il suo tetto di spesa, note, modello) e tutte le voci del
 * computo, e lascia vuoti cliente, cantiere e immobile (06/10/2026).
 *
 * Il tetto di spesa della detrazione (`massimale_detrazione`) non veniva copiato: la copia
 * di un preventivo «Prima casa 50%, tetto 96.000 €» aveva il 50% ma nessun tetto, e sopra i
 * 96.000 € di imponibile prometteva al cliente una detrazione più alta di quella possibile.
 *
 * Stesso discorso per la RATA nel PDF: il numero di rate scelto sul preventivo (`finanziamento_rate`)
 * e la scelta di nasconderla (`mostra_finanziamento = false`) non venivano copiati, e la copia di un
 * preventivo «48 rate, rata nascosta» ripartiva dalle rate del modello con la rata in vista.
 * Database finto che registra cosa viene scritto, gli otto hook veri.
 */
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

const { scritture, origine } = vi.hoisted(() => ({
  scritture: [] as Array<{ tabella: string; righe: Array<Record<string, unknown>> }>,
  origine: {
    id: "origine", company_id: "c1", code: "X-2026-001", stato: "accettato",
    tipo_intervento: "rifacimento_completo", sconto_pct: 5, iva_pct: 10, prezzo_manuale: 120000 as number | null,
    detrazione_pct: 50, massimale_detrazione: 96000 as number | null, note: "Villetta a schiera", template_id: "t1",
    modello_snapshot: null as unknown, totale_imponibile: 114000, totale: 125400,
    // Dati del cliente e dell'immobile: la copia NON li porta.
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: "m@r.it", cliente_telefono: "333", cliente_id: "k1", opportunita_id: "o1",
    cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", immobile_tipo: "villa", immobile_superficie_mq: 140,
    conto_termico: null as unknown, full_electric: null as unknown,
    mostra_finanziamento: false as boolean | null, finanziamento_rate: 48 as number | null,
  },
}));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): unknown => {
    let unaRiga = false;
    let inserimento: Array<Record<string, unknown>> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = new Proxy({}, {
      get: (_t, nome) => {
        if (nome === "then") {
          return (ok: (v: unknown) => unknown) => {
            let data: unknown;
            if (inserimento) data = unaRiga ? { id: "nuovo", ...inserimento[0] } : null;
            else if (tabella.endsWith("_computo_voci")) data = [{ id: "v1", capitolo_nome: "Opere", descrizione: "Posa", unita_misura: "mq", quantita: 12.5, prezzo_unitario: 33.33, costo_materiali: 10, costo_manodopera: 5, sconto_pct: 0, importo: 416.63, margine_eur: 0, margine_pct: 0, ordine: 0 }];
            else data = unaRiga ? origine : [];
            return Promise.resolve({ data, error: null as null, count: 3 }).then(ok);
          };
        }
        if (nome === "insert") {
          return (righe: unknown) => {
            inserimento = Array.isArray(righe) ? (righe as Array<Record<string, unknown>>) : [righe as Record<string, unknown>];
            scritture.push({ tabella, righe: inserimento });
            return p;
          };
        }
        if (nome === "single" || nome === "maybeSingle") return () => { unaRiga = true; return p; };
        return () => p;
      },
    });
    return p;
  };
  return { supabase: { from: (t: string) => catena(t), rpc: () => Promise.resolve({ data: null as null, error: null as null }) } };
});

const MODULI: Array<{ sigla: string; hook: () => Promise<Record<string, unknown>> }> = [
  { sigla: "bgn", hook: () => import("@/hooks/useBagniProgetto") },
  { sigla: "tet", hook: () => import("@/hooks/useTettiProgetto") },
  { sigla: "clm", hook: () => import("@/hooks/useClimatizzazioneProgetto") },
  { sigla: "ele", hook: () => import("@/hooks/useElettricoProgetto") },
  { sigla: "idr", hook: () => import("@/hooks/useTermoidraulicoProgetto") },
  { sigla: "pav", hook: () => import("@/hooks/usePavimentiProgetto") },
  { sigla: "pis", hook: () => import("@/hooks/usePiscineProgetto") },
  { sigla: "rst", hook: () => import("@/hooks/useRistrutturazioneProgetto") },
];

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => { scritture.length = 0; });

describe.each(MODULI)("duplica il preventivo $sigla", ({ sigla, hook }) => {
  it("la copia tiene le condizioni, compreso il tetto della detrazione, e non porta il cliente", async () => {
    const modulo = await hook();
    const { result } = renderHook(() => (modulo.useClonaProgetto as () => { mutateAsync: (id: string) => Promise<unknown> })(), { wrapper });
    await result.current.mutateAsync("origine");
    const nuovo = scritture.find((s) => s.tabella === `${sigla}_progetti`)?.righe[0];
    expect(nuovo).toBeDefined();
    expect(nuovo).toMatchObject({
      company_id: "c1", stato: "bozza", tipo_intervento: "rifacimento_completo",
      sconto_pct: 5, iva_pct: 10, prezzo_manuale: 120000, detrazione_pct: 50, note: "Villetta a schiera", template_id: "t1",
      totale_imponibile: 114000, totale: 125400,
      // Il punto del bug: la detrazione senza il suo tetto di spesa non è la stessa detrazione.
      massimale_detrazione: 96000,
    });
    // Un nuovo codice, non quello dell'originale; e niente di quanto è del cliente o dell'immobile.
    expect(nuovo?.code).not.toBe("X-2026-001");
    for (const campo of ["cliente_nome", "cliente_cognome", "cliente_email", "cliente_telefono", "cliente_id", "opportunita_id", "cantiere_indirizzo", "cantiere_citta", "immobile_tipo", "immobile_superficie_mq"]) {
      expect(nuovo, campo).not.toHaveProperty(campo);
    }
    // Le voci passano tutte, col loro importo, nel nuovo progetto.
    const voci = scritture.find((s) => s.tabella === `${sigla}_computo_voci`)?.righe ?? [];
    expect(voci).toHaveLength(1);
    expect(voci[0]).toMatchObject({ progetto_id: "nuovo", quantita: 12.5, prezzo_unitario: 33.33, importo: 416.63 });
  });

  it("senza tetto sull'originale la copia resta senza tetto (null, non zero)", async () => {
    const modulo = await hook();
    const prima = origine.massimale_detrazione;
    origine.massimale_detrazione = null;
    try {
      const { result } = renderHook(() => (modulo.useClonaProgetto as () => { mutateAsync: (id: string) => Promise<unknown> })(), { wrapper });
      await result.current.mutateAsync("origine");
      const nuovo = scritture.find((s) => s.tabella === `${sigla}_progetti`)?.righe[0];
      expect(nuovo?.massimale_detrazione ?? null).toBeNull();
    } finally {
      origine.massimale_detrazione = prima;
    }
  });

  // Le rate scelte e la rata nascosta fanno parte delle condizioni del preventivo: la copia le tiene.
  it.each([
    { nome: "48 rate e rata nascosta", mostra: false, rate: 48 },
    { nome: "120 rate e rata in vista", mostra: true, rate: 120 },
  ])("la copia tiene anche la scelta delle rate: $nome", async ({ mostra, rate }) => {
    const modulo = await hook();
    const prima = { mostra: origine.mostra_finanziamento, rate: origine.finanziamento_rate };
    origine.mostra_finanziamento = mostra;
    origine.finanziamento_rate = rate;
    try {
      const { result } = renderHook(() => (modulo.useClonaProgetto as () => { mutateAsync: (id: string) => Promise<unknown> })(), { wrapper });
      await result.current.mutateAsync("origine");
      const nuovo = scritture.find((s) => s.tabella === `${sigla}_progetti`)?.righe[0];
      expect(nuovo).toMatchObject({ mostra_finanziamento: mostra, finanziamento_rate: rate });
    } finally {
      origine.mostra_finanziamento = prima.mostra;
      origine.finanziamento_rate = prima.rate;
    }
  });

  it("se sull'originale non c'è nessuna scelta, la copia non ne inventa: le rate le decide il modello e la rata si mostra", async () => {
    const modulo = await hook();
    const prima = { mostra: origine.mostra_finanziamento, rate: origine.finanziamento_rate };
    origine.mostra_finanziamento = null;
    origine.finanziamento_rate = null;
    try {
      const { result } = renderHook(() => (modulo.useClonaProgetto as () => { mutateAsync: (id: string) => Promise<unknown> })(), { wrapper });
      await result.current.mutateAsync("origine");
      const nuovo = scritture.find((s) => s.tabella === `${sigla}_progetti`)?.righe[0];
      // «vuoto» resta vuoto: né 0 rate né «rata nascosta» (false) comparsi dal nulla.
      expect(nuovo?.finanziamento_rate ?? null).toBeNull();
      expect(nuovo?.mostra_finanziamento ?? null).toBeNull();
    } finally {
      origine.mostra_finanziamento = prima.mostra;
      origine.finanziamento_rate = prima.rate;
    }
  });
});
