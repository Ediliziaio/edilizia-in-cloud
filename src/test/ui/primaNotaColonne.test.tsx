/**
 * Le colonne di Prima nota scelte e riordinate dall'azienda (26/11/2026).
 *
 * Quattordici colonne, e nessuna impresa ne guarda quattordici: chi non tiene i conti
 * divisi per banca non guarda «Conto», chi non lavora in subappalto non guarda «Fornitore».
 * Qui si clicca il pannellino vero sulla pagina vera, e si controlla la cosa che rompe una
 * tabella: che testata e celle restino allineate anche dopo averne spenta o spostata una.
 */
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrimaNotaEntry } from "@/hooks/usePrimaNota";

const base = {
  company_id: "demo", direction: "entrata", amount: 100, entry_date: "2026-11-19",
  created_at: "2026-11-19", category: "altro", is_auto: false, notes: null,
  attachment_url: null, attachment_name: null, cost_id: null,
  documento_fiscale_id: null, bank_transaction_id: null,
} as PrimaNotaEntry;
const righe = [{ ...base, id: "r1", description: "Incasso manuale" }];

vi.mock("@/hooks/usePrimaNota", async (importa) => ({
  ...await importa<typeof import("@/hooks/usePrimaNota")>(),
  usePrimaNota: () => ({
    entries: righe, isLoading: false, totalCount: 1, totalPages: 1,
    saldo: { entrate: 100, uscite: 0, saldo: 100 }, isSaldoLoading: false, monthlyChart: {},
    create: { isPending: false }, remove: { isPending: false, mutate: vi.fn() },
    removeMany: { isPending: false, mutateAsync: vi.fn() }, update: { isPending: false },
    updateNotes: vi.fn(), fetchAllForExport: vi.fn(),
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "demo" }, user: { id: "u1" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useAnagraficaAzienda", () => ({ useAnagraficaAzienda: () => ({ data: null as null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/components/contabilita/DaVerificareCard", () => ({ DaVerificareCard: (): null => null }));
vi.mock("@/components/charts/grafici/GraficoEntrateUscite", () => ({ GraficoEntrateUscite: (): null => null }));
vi.mock("@/components/prima-nota/NewEntryDialog", () => ({ default: (): null => null }));

import PrimaNota from "@/pages/azienda/PrimaNota";

const apri = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <PrimaNota />
      </QueryClientProvider>
    </MemoryRouter>,
  );

/** Le intestazioni scegliibili: «Azioni» non lo è. */
const teste = () =>
  screen.getAllByRole("columnheader").map((th) => th.textContent?.trim()).filter((x) => x && x !== "Azioni");

/** Le celle della riga dei dati: devono essere quante le intestazioni, più le azioni. */
const celleDellaRiga = () => {
  const righeTabella = screen.getAllByRole("row");
  return righeTabella[righeTabella.length - 1].querySelectorAll("td").length;
};

const apriPannellino = () => fireEvent.click(screen.getByRole("button", { name: /Colonne/ }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("le colonne di Prima nota", () => {
  it("di serie ci sono tutte e quattordici, nell'ordine dichiarato", () => {
    apri();
    expect(teste()).toEqual([
      "Data", "Categoria", "Descrizione", "Importo", "Progressivo pagina", "Metodo",
      "Conto", "Origine", "Documento", "Commessa", "Fornitore", "Riferimento", "Allegato",
    ]);
  });

  it("testata e celle sono allineate", () => {
    apri();
    // +2: la casella di selezione in testa e la colonna delle azioni in coda.
    expect(celleDellaRiga()).toBe(teste().length + 2);
  });

  it("spenta una colonna, sparisce e la riga resta allineata", () => {
    apri();
    apriPannellino();
    fireEvent.click(screen.getByLabelText("Fornitore"));
    expect(teste()).not.toContain("Fornitore");
    expect(celleDellaRiga()).toBe(teste().length + 2);
  });

  it("spostata una colonna, l'ordine cambia davvero", () => {
    apri();
    apriPannellino();
    fireEvent.click(screen.getByRole("button", { name: /Sposta Allegato a sinistra/ }));
    const ordine = teste();
    expect(ordine.indexOf("Allegato")).toBeLessThan(ordine.indexOf("Riferimento"));
    expect(celleDellaRiga()).toBe(ordine.length + 2);
  });

  it("data, descrizione e importo non si spengono", () => {
    apri();
    apriPannellino();
    for (const fissa of ["Data", "Descrizione", "Importo"]) {
      expect(screen.getByLabelText(fissa)).toBeDisabled();
    }
  });

  it("la scelta resta dopo un ricaricamento della pagina", () => {
    const primo = apri();
    apriPannellino();
    fireEvent.click(screen.getByLabelText("Conto"));
    primo.unmount();
    apri();
    expect(teste()).not.toContain("Conto");
  });
});
