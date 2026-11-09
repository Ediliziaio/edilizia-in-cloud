/**
 * Dal campo Quantità al totale (09/11/2026): il passo Offerta vero, col salvataggio vero sopra un database finto.
 * La quantità scritta senza uscire dal campo arriva al database con importo e m² giusti, entra subito nei dati del
 * preventivo (da cui leggono totale IVA inclusa e PDF a destra) e una rilettura non la riporta indietro.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FamilyWithAxes } from "@/types/articleFamily";
import type { SrProgettoDetail, SrSerramentoRow } from "@/types/serramenti";
import { comeListinoFamily } from "@/lib/serramenti/pickerListino";
import { totaliDelPreventivo } from "@/lib/serramenti/righePreventivo";
import { finestraSalamander, idColore } from "../fixtures/finestraSalamander";

vi.setConfig({ testTimeout: 30_000 });

const { db } = vi.hoisted(() => ({ db: { scritture: [] as Array<Record<string, unknown>>, riga: {} as Record<string, unknown> } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => { db.scritture.push(patch); Object.assign(db.riga, patch); return { error: null as null }; },
      }),
    }),
  },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "c1", name: "Bianchi Infissi" } }) }));

const famiglia = finestraSalamander("f2a") as FamilyWithAxes;
const nessuno: never[] = [];

vi.mock("@/lib/serramenti/queries", async (originale) => ({
  ...(await originale<typeof import("@/lib/serramenti/queries")>()),
  useListinoGriglia: () => ({ data: nessuno, isLoading: false }),
  useMacroFields: () => ({ data: nessuno, isLoading: false }),
  useTariffeManodopera: () => ({ data: nessuno }),
  useListinoFamiliesByIds: () => ({ data: [comeListinoFamily(famiglia)] }),
}));
vi.mock("@/hooks/useFamilies", () => ({ useFamilies: () => ({ families: [famiglia] }), useFamily: () => ({ family: famiglia, isLoading: false }) }));
vi.mock("@/hooks/useSchedeLinea", () => ({ useSchedeLinea: () => ({ indice: new Map() }) }));
vi.mock("@/hooks/useListinoCategorie", () => ({ useListinoCategorie: () => ({ categorie: nessuno, isLoading: false }) }));
vi.mock("@/hooks/useListinoMacrocategorie", () => ({ useListinoMacrocategorie: () => ({ macrocategorie: nessuno, isLoading: false }) }));
vi.mock("@/features/serramenti-listini/hooks/useSupplierProductLines", () => ({ useSupplierProductLines: () => ({ lines: nessuno }) }));
vi.mock("@/components/serramenti/useComplementiFinestre", () => ({
  useComplementiFinestre: () => ({
    blocco: (): null => null, riepilogo: (): null => null, seguiLaFinestra: async (): Promise<void> => undefined, duplicaComplementi: vi.fn(),
    barraTutte: null as null, picker: null as null, eliminazione: null as null,
  }),
}));
vi.mock("@/components/serramenti/ComplementiFinestra", () => ({ ComplementiFinestra: (): null => null, ComplementiSuTutteLeFinestre: (): null => null, EliminaComplementoDialog: (): null => null }));
vi.mock("@/components/serramenti/ListinoPickerDialog", () => ({ ListinoPickerDialog: (): null => null }));
vi.mock("@/components/serramenti/AccessoriSection", () => ({ AccessoriSection: (): null => null }));
vi.mock("@/components/serramenti/ServiziSection", () => ({ ServiziSection: (): null => null }));
vi.mock("@/components/serramenti/AiSerramentiDraftLauncher", () => ({ AiSerramentiDraftLauncher: (): null => null }));

import { StepBom } from "@/components/serramenti/StepBom";

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});
afterEach(() => cleanup());

const CHIAVE = ["sr-progetto", "p1"];

function datiDalDb(): SrProgettoDetail {
  return {
    progetto: { id: "p1", company_id: "c1", stato: "bozza", iva_percentuale: 10, sconto_percentuale: 0, sconto_importo: 0, prezzo_manuale: null },
    serramenti: [{ ...db.riga } as unknown as SrSerramentoRow],
    accessori: [], media: [], risparmio: null, servizi: [],
  } as unknown as SrProgettoDetail;
}

function Passo() {
  const { data } = useQuery({ queryKey: CHIAVE, queryFn: async () => datiDalDb() });
  return data ? <StepBom progettoId="p1" detail={data} /> : null;
}

describe("Quantità nel passo Offerta", () => {
  it("arriva al database con importo e m², entra nel totale e nel PDF, e la rilettura non la riporta indietro", async () => {
    const c = idColore("f2a");
    db.scritture = [];
    db.riga = {
      id: "r1", progetto_id: "p1", company_id: "c1", position: 0, tipologia: "finestra_2ante", tipologia_label: "Porta Finestra 2 Ante", ambiente: "Soggiorno",
      larghezza_mm: 1200, altezza_mm: 1400, quantita: 2, metri_quadri: 3.36, family_id: "f2a", prezzo_unitario: 1008, prezzo_totale: 2016,
      valori_assi: { colore: c.bianco, telaio: "f2a-telaio-l" }, scelte_assi: { colore: "21 - Nussbaum" }, note: "tenere", posa_esclusa: false,
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><Passo /></QueryClientProvider>);

    fireEvent.click(await screen.findByText("×2"));
    const campo = await screen.findByRole("spinbutton", { name: "Quantità" });
    expect(totaliDelPreventivo(qc.getQueryData<SrProgettoDetail>(CHIAVE)!, { iva_percentuale: 10 }).totale_max).toBeCloseTo(2217.6, 2);
    const chiavePdfPrima = JSON.stringify(qc.getQueryData(CHIAVE));

    fireEvent.change(campo, { target: { value: "3" } });
    await waitFor(() => expect(db.scritture).toHaveLength(1));

    expect(db.scritture[0]).toMatchObject({ quantita: 3, prezzo_unitario: 1008, prezzo_totale: 3024, metri_quadri: 5.04 });
    expect(db.scritture[0]).not.toHaveProperty("valori_assi");
    expect(db.riga).toMatchObject({ note: "tenere", scelte_assi: { colore: "21 - Nussbaum" } });

    await waitFor(() => expect(screen.getByText("×3")).toBeTruthy());
    const dopo = qc.getQueryData<SrProgettoDetail>(CHIAVE)!;
    expect(totaliDelPreventivo(dopo, { iva_percentuale: 10 }).totale_max).toBeCloseTo(3326.4, 2);
    expect(JSON.stringify(dopo)).not.toBe(chiavePdfPrima);

    await qc.invalidateQueries({ queryKey: CHIAVE });
    await waitFor(() => expect((qc.getQueryData<SrProgettoDetail>(CHIAVE)!).serramenti[0].quantita).toBe(3));
    expect((campo as HTMLInputElement).value).toBe("3");
  });
});
