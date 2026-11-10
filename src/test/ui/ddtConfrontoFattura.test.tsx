import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewCosts: true,
    canManagePurchasing: true,
    solaLettura: false,
  }),
}));
vi.mock("@/hooks/useDDTRicezione", () => ({
  useDDTRighe: () => ({
    data: [
      {
        id: "riga",
        descrizione: "Rete",
        quantita: 2,
        unita_misura: "mq",
        prezzo_unitario: null as number | null,
      },
    ],
  }),
}));
vi.mock("@/lib/ddt/documentiPersistenti", () => ({
  documentiDb: {
    rpc: m.rpc,
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        then: (resolve: any) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return q;
    },
  },
}));
import { PrezziDaFatturaCard } from "@/components/ddt/PrezziDaFatturaCard";
const invoice = {
  id: "fattura",
  numero_fattura: "2020-45",
  data_fattura: "2020-01-02",
  cedente_ragione_sociale: "Fornitore prova",
};
const clients: QueryClient[] = [];
beforeEach(() =>
  m.rpc.mockReset().mockResolvedValue({ data: [invoice], error: null }),
);
afterEach(() => {
  for (const c of clients) c.clear();
  clients.length = 0;
});
function apri() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <PrezziDaFatturaCard
          ddt={
            {
              id: "ddt",
              company_id: "azienda",
              supplier_id: "fornitore",
            } as any
          }
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Confronta una fattura" }),
  );
}
it("apre il confronto e cerca anche le fatture storiche usando il server, senza registrare movimenti", async () => {
  apri();
  await screen.findByRole("option", { name: /2020-45/ });
  fireEvent.change(screen.getByLabelText("Cerca per numero o data"), {
    target: { value: "2020-45" },
  });
  await waitFor(() =>
    expect(m.rpc).toHaveBeenCalledWith("ddt_fatture_fornitore", {
      p_ddt: "ddt",
      p_cerca: "2020-45",
      p_limite: 100,
    }),
  );
  expect(
    m.rpc.mock.calls.every(([nome]) => nome === "ddt_fatture_fornitore"),
  ).toBe(true);
});
it("cambiando ricerca non conserva una fattura selezionata che può scomparire dall'elenco", async () => {
  apri();
  await screen.findByRole("option", { name: /2020-45/ });
  const select = screen.getByLabelText("Fattura dello stesso fornitore");
  fireEvent.change(select, { target: { value: "fattura" } });
  expect(select).toHaveValue("fattura");
  fireEvent.change(screen.getByLabelText("Cerca per numero o data"), {
    target: { value: "un'altra fattura" },
  });
  expect(select).toHaveValue("");
});
it("un errore della ricerca mostra il ritentativo e permette di ricaricare le fatture", async () => {
  m.rpc.mockResolvedValue({ data: null, error: new Error("rete assente") });
  apri();
  await screen.findByText(/Fatture non disponibili/);
  m.rpc.mockResolvedValue({ data: [invoice], error: null });
  fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
  await screen.findByRole("option", { name: /2020-45/ });
});
