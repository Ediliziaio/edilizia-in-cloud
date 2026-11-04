// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const righe: Record<string, unknown[]> = {
  fattura_ricevuta_mezzi: [{ id: "l1", mezzo_id: "m1", importo: 120, confermata: false, mezzi: { nome: "Gru", targa: "AB123CD" } }],
  fattura_ddt: Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, numero_ddt: `DDT-${i}`, data_ddt: null as string | null, ddt_ricezione_id: null as string | null })),
  note_credito_storni: [{ fattura_id: "f1", nota_id: "n1", importo: 50 }],
  fatture_ricevute: [{ numero_fattura: "NC-7" }],
  contratti_subappalto: [],
  sal_subappaltatori: [],
  mezzi: [],
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null as { id: string } | null } }) },
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "or", "order", "limit"]) q[m] = () => q;
      q.then = (ok: (v: unknown) => unknown) => ok({ data: righe[t] ?? [], error: null });
      return q;
    },
  },
}));

import { CollegamentiFattura } from "@/components/fatturazione/CollegamentiFattura";

const monta = (puoModificare = true) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <dl><CollegamentiFattura fatturaId="f1" companyId="c1" puoModificare={puoModificare} notaDiCredito={false} /></dl>
    </MemoryRouter>
  </QueryClientProvider>,
);

describe("Collegamenti della fattura, come righe del riepilogo", () => {
  it("niente moduli a vista: mezzo da confermare, primi DDT e nota di credito", async () => {
    monta();
    expect(await screen.findByText(/Gru · AB123CD/)).toBeTruthy();
    expect(screen.getByText("da confermare")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Numero DDT")).toBeNull();
    expect(screen.getByText("DDT-5")).toBeTruthy();
    expect(screen.queryByText("DDT-6")).toBeNull();
    expect(screen.getByRole("button", { name: "Altri 2" })).toBeTruthy();
    expect(await screen.findByRole("link", { name: "NC-7" })).toBeTruthy();
  });

  it("in sola lettura non si collega e non si toglie", async () => {
    monta(false);
    await screen.findByText(/Gru · AB123CD/);
    expect(screen.queryByRole("button", { name: "Collega un mezzo" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Togli/ })).toBeNull();
  });
});
