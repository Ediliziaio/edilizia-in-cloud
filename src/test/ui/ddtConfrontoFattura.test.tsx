import { formOptions } from "@/test/helpers/changeFormControl";
import { changeFormControl } from "@/test/helpers/changeFormControl";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), documento: vi.fn(), collegate: vi.fn() }));
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
    from: (tabella: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => m.documento(),
        then: (resolve: any) =>
          (tabella === 'fattura_ddt' ? m.collegate() : Promise.resolve({ data: [], error: null })).then(resolve),
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
const rpcDiLettura = new Set(["ddt_fatture_fornitore", "fattura_riconciliazione_contesto", "fattura_ddt_riepilogo"]);
beforeEach(() => {
  m.rpc.mockReset().mockImplementation(async (nome: string): Promise<{ data: unknown; error: null }> => {
    if (nome === "ddt_fatture_fornitore") return { data: [invoice, { ...invoice, id: 'seconda', numero_fattura: '2020-46' }], error: null };
    if (nome === "fattura_ddt_riepilogo") return { data: { ddt: [] }, error: null };
    if (nome === "fattura_riconciliazione_contesto") return { data: { contesto: {} }, error: null };
    throw new Error(`RPC inattesa: ${nome}`);
  });
  m.documento.mockReset().mockResolvedValue({ data: { id: 'fattura', righe: [{ descrizione: 'Rete', quantita: 1, unita_misura: 'mq', prezzo_unitario: 30, imponibile: 24 }] }, error: null });
  m.collegate.mockReset().mockResolvedValue({ data: [], error: null });
});
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
  await formOptions().findByRole("option", { name: /2020-45/ });
  changeFormControl(screen.getByLabelText("Cerca per numero o data"), {
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
  await formOptions().findByRole("option", { name: /2020-45/ });
  const select = screen.getByLabelText("Fattura dello stesso fornitore");
  changeFormControl(select, { target: { value: "fattura" } });
  expect(select).toHaveValue("fattura");
  changeFormControl(screen.getByLabelText("Cerca per numero o data"), {
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
  await formOptions().findByRole("option", { name: /2020-45/ });
});
it('propone il prezzo scontato della fattura senza scritture e azzera i dati scegliendo un’altra fattura', async () => {
  apri();
  await formOptions().findByRole('option', { name: /2020-45/ });
  changeFormControl(screen.getByLabelText('Fattura dello stesso fornitore'), { target: { value: 'fattura' } });
  await waitFor(() => expect(screen.getByLabelText('Prezzo in fattura Rete')).toHaveValue('24'));
  expect(screen.getByLabelText('Quantità fatturata Rete')).toHaveValue('1');
  expect(screen.getByRole('button', { name: 'Salva il confronto prezzi' })).toBeDisabled();
  expect(m.rpc.mock.calls.every(([nome]) => rpcDiLettura.has(nome))).toBe(true);
  changeFormControl(screen.getByLabelText('Prezzo in fattura Rete'), { target: { value: '26' } });
  expect(screen.getByLabelText('Quantità fatturata Rete')).toHaveValue('1');
  fireEvent.click(screen.getByLabelText(/Ho confrontato le righe/));
  expect(screen.getByRole('button', { name: 'Salva il confronto prezzi' })).toBeEnabled();
  m.documento.mockResolvedValue({ data: { id: 'seconda', righe: [{ descrizione: 'Rete', quantita: 2, unita_misura: 'mq', prezzo_unitario: 40, imponibile: 80 }] }, error: null });
  changeFormControl(screen.getByLabelText('Fattura dello stesso fornitore'), { target: { value: 'seconda' } });
  await waitFor(() => expect(screen.getByLabelText('Prezzo in fattura Rete')).toHaveValue('40'));
  expect(screen.getByLabelText('Quantità fatturata Rete')).toHaveValue('2');
  expect(screen.getByRole('button', { name: 'Salva il confronto prezzi' })).toBeDisabled();
  m.documento.mockResolvedValue({ data: { id: 'fattura', righe: [{ descrizione: 'Rete', quantita: 1, unita_misura: 'mq', prezzo_unitario: 30, imponibile: 24 }] }, error: null });
  changeFormControl(screen.getByLabelText('Fattura dello stesso fornitore'), { target: { value: 'fattura' } });
  await waitFor(() => expect(screen.getByLabelText('Prezzo in fattura Rete')).toHaveValue('24'));
  expect(screen.getByRole('button', { name: 'Salva il confronto prezzi' })).toBeDisabled();
});
it('propone l’unica fattura già collegata al DDT senza chiedere di riselezionarla e senza scritture', async () => {
  m.collegate.mockResolvedValue({ data: [{ id: 'link', numero_ddt: '1', fatture_ricevute: invoice }], error: null });
  apri();
  await waitFor(() => expect(screen.getByLabelText('Fattura dello stesso fornitore')).toHaveValue('fattura'));
  await waitFor(() => expect(screen.getByLabelText('Prezzo in fattura Rete')).toHaveValue('24'));
  expect(screen.getByLabelText('Quantità fatturata Rete')).toHaveValue('1');
  expect(screen.getByRole('button', { name: 'Salva il confronto prezzi' })).toBeDisabled();
  expect(m.rpc.mock.calls.every(([nome]) => rpcDiLettura.has(nome))).toBe(true);
});
