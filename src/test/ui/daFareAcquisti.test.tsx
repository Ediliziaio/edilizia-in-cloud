/**
 * Impostazioni → Automazioni, riquadro «Da fare»: un numero per cosa, con dove si fa; gli zeri non si
 * mostrano; se la lettura fallisce lo dice e non inventa numeri.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({
  risposta: { data: null as unknown, error: null as null | { message: string } },
  chiamate: [] as Array<[string, unknown]>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      state.chiamate.push([fn, args]);
      return Promise.resolve(state.risposta);
    },
  },
}));

import { DaFareAcquisti, vociDaFare, type DaFare } from "@/components/settings/automazioni/DaFareAcquisti";

const zero: DaFare = { proposte: 0, da_ricontrollare: 0, fornitori_senza_tipo: 0, fatture_senza_fornitore: 0, fatture_senza_identificativo: 0 };
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DaFareAcquisti companyId="company-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  state.risposta = { data: null, error: null };
  state.chiamate = [];
});

describe("riquadro «Da fare»", () => {
  it("solo le voci con un numero, nell'ordine in cui conviene farle; le fatture senza fornitore divise per motivo", () => {
    const v = vociDaFare({ proposte: 2, da_ricontrollare: 0, fornitori_senza_tipo: 1, fatture_senza_fornitore: 30, fatture_senza_identificativo: 25 });
    expect(v.map((x) => [x.chiave, x.numero])).toEqual([
      ["proposte", 2],
      ["fornitori_senza_tipo", 1],
      ["fatture_con_identificativo", 5],
      ["fatture_senza_identificativo", 25],
    ]);
    expect(v[1].testo).toBe("fornitore senza tipo");
  });

  it("mostra i numeri col link alla pagina giusta, letti per l'azienda della pagina", async () => {
    state.risposta = { data: { ...zero, proposte: 3, fornitori_senza_tipo: 12045 }, error: null };
    open();
    expect(await screen.findByText("12.045")).toBeInTheDocument();
    expect(screen.getByText("collegamenti proposti da confermare")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tipi dei fornitori" }).getAttribute("href")).toBe("/azienda/documenti/tipi-fornitori");
    expect(state.chiamate).toEqual([["acquisti_da_fare", { p_company: "company-1" }]]);
  });

  it("tutto a zero: lo dice", async () => {
    state.risposta = { data: zero, error: null };
    open();
    expect(await screen.findByText(/Niente da fare/)).toBeInTheDocument();
  });

  it("lettura rifiutata: nessun numero inventato", async () => {
    state.risposta = { data: null, error: { message: "permesso" } };
    open();
    expect(await screen.findByText(/Non riesco a leggere/)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
  });
});
