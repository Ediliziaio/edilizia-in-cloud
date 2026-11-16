/**
 * L'avviso sulla completezza delle fatture si può togliere (16/11/2026).
 *
 * All'Impresa Vulcano le emesse arrivano dal vecchio gestionale: 59 numeri saltati che non si
 * riempiranno mai, in cima alle Fatture Ricevute, e nessun modo di chiuderli. Chi ha guardato
 * i buchi una volta non deve rivederli per sempre — ma se ne salta uno nuovo l'avviso deve
 * tornare: per questo si ricorda il conto visto, non un semplice «nascosto».
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ emesse: [] as Array<{ id: string; numero: string | null; data_emissione: string | null }> }));
vi.mock("@/lib/fatturazione/registroVendite", () => ({
  tutteLePagine: async (fn: (a: number, b: number) => { __tabella: string }) => {
    const { __tabella } = fn(0, 999);
    return __tabella === "documenti_fiscali_elenco_con_importate" ? m.emesse : [];
  },
}));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    const c: Record<string, unknown> = { __tabella: tabella };
    for (const k of ["select", "eq", "is", "in", "not", "order", "range"]) c[k] = () => c;
    return c;
  };
  return { supabase: { from: (t: string) => catena(t) } };
});

import { CompletezzaFatture } from "@/components/fatturazione/CompletezzaFatture";

const mostra = () =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <CompletezzaFatture companyId="c1" />
  </QueryClientProvider>);

beforeEach(() => {
  localStorage.clear();
  // Tre emesse col numero 2 saltato: un buco vero.
  m.emesse = [
    { id: "1", numero: "1/1", data_emissione: "2026-01-10" },
    { id: "3", numero: "1/3", data_emissione: "2026-01-20" },
    { id: "4", numero: "1/4", data_emissione: "2026-01-25" },
  ];
});
afterEach(cleanup);

describe("L'avviso sulla completezza delle fatture", () => {
  it("si toglie con «ho controllato» e non torna da solo", async () => {
    mostra();
    const togli = await screen.findByRole("button", { name: /Ho controllato/ });
    expect(screen.getByText(/Mancano 1 numeri nelle emesse/)).toBeInTheDocument();
    fireEvent.click(togli);
    await waitFor(() => expect(screen.queryByText(/Mancano/)).not.toBeInTheDocument());

    cleanup();
    mostra();
    await waitFor(() => expect(screen.queryByRole("button", { name: /Ho controllato/ })).not.toBeInTheDocument());
    expect(screen.queryByText(/Mancano/)).not.toBeInTheDocument();
  });

  it("torna se salta un altro numero", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: /Ho controllato/ }));
    await waitFor(() => expect(screen.queryByText(/Mancano/)).not.toBeInTheDocument());
    cleanup();

    // Adesso mancano il 2 e il 5: il conto è cambiato, l'avviso deve tornare.
    m.emesse = [...m.emesse, { id: "6", numero: "1/6", data_emissione: "2026-02-02" }];
    mostra();
    expect(await screen.findByText(/Mancano 2 numeri nelle emesse/)).toBeInTheDocument();
  });
});
