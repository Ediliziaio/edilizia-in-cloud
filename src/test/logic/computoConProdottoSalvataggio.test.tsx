/**
 * La riga del computo scelta dal listino prodotti si salva con la sua foto e la sua
 * descrizione, in tutti gli otto moduli edili, e le conserva quando il preventivo si
 * duplica (06/10/2026). Senza, il prodotto perdeva foto e descrizione al primo
 * salvataggio automatico: le colonne ci sono, ma ogni modulo scrive le sue a mano.
 * Database finto che registra cosa viene scritto.
 */
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

const { scritture, voceOrigine } = vi.hoisted(() => ({
  scritture: [] as Array<{ tabella: string; righe: Array<Record<string, unknown>> }>,
  voceOrigine: {
    capitolo_nome: "Sanitari", descrizione: "Piatto doccia in resina 120x80", unita_misura: "cad", quantita: 1, prezzo_unitario: 235,
    costo_materiali: 130, costo_manodopera: 0, sconto_pct: 0, importo: 235, margine_eur: 105, margine_pct: 44.7, listino_voce_id: null as string | null,
    fonte: null as string | null, ordine: 0, ambiente: null as string | null,
    famiglia_id: "f-piatto", immagine_url: "/templates/bagno/products/piatto-doccia.webp", descrizione_estesa: "Antiscivolo, finitura pietra.",
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
            else if (tabella.endsWith("_computo_voci")) data = [{ id: "v-vecchia", ...voceOrigine }];
            else data = unaRiga ? { id: "origine", sconto_pct: 0, iva_pct: 10, prezzo_manuale: null, tipo_intervento: null } : [];
            return Promise.resolve({ data, error: null as null, count: 0 }).then(ok);
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

const MODULI: Array<{ p: string; hook: () => Promise<Record<string, unknown>> }> = [
  { p: "bgn", hook: () => import("@/hooks/useBagniProgetto") },
  { p: "tet", hook: () => import("@/hooks/useTettiProgetto") },
  { p: "clm", hook: () => import("@/hooks/useClimatizzazioneProgetto") },
  { p: "ele", hook: () => import("@/hooks/useElettricoProgetto") },
  { p: "idr", hook: () => import("@/hooks/useTermoidraulicoProgetto") },
  { p: "pav", hook: () => import("@/hooks/usePavimentiProgetto") },
  { p: "pis", hook: () => import("@/hooks/usePiscineProgetto") },
  { p: "rst", hook: () => import("@/hooks/useRistrutturazioneProgetto") },
];

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

const righeScritte = (p: string) => scritture.filter((s) => s.tabella === `${p}_computo_voci`).flatMap((s) => s.righe);

beforeEach(() => { scritture.length = 0; });

describe.each(MODULI)("computo $p: foto e descrizione del prodotto", ({ p, hook }) => {
  it("il salvataggio del computo scrive provenienza, foto e descrizione; una riga senza scrive null", async () => {
    const modulo = await hook();
    const { result } = renderHook(() => (modulo.useSaveComputo as (id: string) => { mutateAsync: (r: unknown[]) => Promise<unknown> })("p1"), { wrapper });
    await result.current.mutateAsync([
      { ...voceOrigine },
      { ...voceOrigine, descrizione: "Voce scritta a mano", famiglia_id: undefined, immagine_url: undefined, descrizione_estesa: undefined, ordine: 1 },
    ]);
    const righe = righeScritte(p);
    expect(righe).toHaveLength(2);
    expect(righe[0]).toMatchObject({
      famiglia_id: "f-piatto", immagine_url: "/templates/bagno/products/piatto-doccia.webp", descrizione_estesa: "Antiscivolo, finitura pietra.",
    });
    expect(righe[1]).toMatchObject({ famiglia_id: null, immagine_url: null, descrizione_estesa: null });
  });

  it("duplicando il preventivo, le righe-prodotto tengono foto e descrizione", async () => {
    const modulo = await hook();
    const { result } = renderHook(() => (modulo.useClonaProgetto as () => { mutateAsync: (id: string) => Promise<unknown> })(), { wrapper });
    await result.current.mutateAsync("origine");
    const righe = righeScritte(p);
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      descrizione: "Piatto doccia in resina 120x80",
      famiglia_id: "f-piatto", immagine_url: "/templates/bagno/products/piatto-doccia.webp", descrizione_estesa: "Antiscivolo, finitura pietra.",
    });
  });
});
