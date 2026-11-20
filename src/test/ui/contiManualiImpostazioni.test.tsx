import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsBanca from "@/pages/azienda/settings/SettingsBanca";
import NewEntryDialog from "@/components/prima-nota/NewEntryDialog";
import { useContiPrimaNota } from "@/hooks/useContiPrimaNota";

const db = vi.hoisted(() => ({
  accounts: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  admin: true,
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "impresa" } }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: db.admin, canViewBankBalances: db.admin, solaLettura: !db.admin }),
}));
vi.mock("@/components/integrations/BankConnectionsCard", () => ({
  default: () => <div>Connessioni Open Banking</div>,
}));
vi.mock("@/components/orders/CommessaCombobox", () => ({
  CommessaCombobox: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let insert: Record<string, unknown> | undefined;
      let update: Record<string, unknown> | undefined;
      const matching = () => db.accounts.filter((a) => filters.every(([k, v]) => a[k] === v));
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters.push([field, value]); return query; },
        order: () => query,
        not: () => query,
        is: () => query,
        limit: () => query,
        insert: (data: Record<string, unknown>) => { insert = data; return query; },
        update: (data: Record<string, unknown>) => { update = data; return query; },
        single: async () => {
          if (insert) {
            db.inserts.push(insert);
            const account = { ...insert, id: `manuale-${db.inserts.length}` };
            db.accounts.push(account);
            return { data: { id: account.id }, error: null };
          }
          const [account] = matching();
          if (!account || !update) return { data: null, error: new Error("Conto non trovato") };
          db.updates.push(update);
          Object.assign(account, update);
          return { data: { id: account.id }, error: null };
        },
        then: (resolve: (result: { data: unknown[]; error: null }) => unknown) => Promise.resolve({
          data: table === "bank_accounts_operativi" ? matching() : [], error: null,
        }).then(resolve),
      };
      return query;
    },
  },
}));

beforeEach(() => {
  db.accounts = [];
  db.inserts = [];
  db.updates = [];
  db.admin = true;
});
afterEach(cleanup);
Element.prototype.scrollIntoView ??= () => {};

function ContiDisponibili() {
  const conti = useContiPrimaNota("impresa");
  return <output aria-label="Conti disponibili in prima nota">{conti.data?.map((c) => c.etichetta).join(", ") ?? "Caricamento…"}</output>;
}

it("crea un conto senza connessione e lo rende subito selezionabile in prima nota", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const confirm = vi.fn();
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/azienda/impostazioni/banca?tab=manuali"]}>
    <SettingsBanca /><ContiDisponibili />
  </MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText("Nessun conto manuale.")).toBeVisible();
  expect(screen.queryByText("Connessioni Open Banking")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi conto" }));
  fireEvent.change(screen.getByLabelText("Nome del conto"), { target: { value: "  Conto operativo  " } });
  fireEvent.change(screen.getByLabelText("IBAN (opzionale)"), { target: { value: "it60 x05428 11101 000000123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Salva conto" }));
  await waitFor(() => expect(screen.getByLabelText("Conti disponibili in prima nota")).toHaveTextContent("Conto operativo · …3456"));
  expect(db.inserts).toEqual([expect.objectContaining({
    company_id: "impresa", display_name: "Conto operativo", iban: "IT60X0542811101000000123456",
    is_manual: true, connection_id: null, opening_balance: 0,
  })]);

  view.rerender(<QueryClientProvider client={client}>
    <NewEntryDialog open onOpenChange={vi.fn()} onConfirm={confirm} isPending={false} />
  </QueryClientProvider>);
  expect(screen.getByRole("link", { name: "Gestisci i conti manuali" })).toHaveAttribute("href", "/azienda/impostazioni/banca?tab=manuali");
  expect(screen.queryByRole("link", { name: "Conti collegati in Tesoreria" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "Pagamento fornitore" } });
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "27.50" } });
  fireEvent.keyDown(screen.getByLabelText("Conto", { exact: true }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Conto operativo · …3456" }));
  fireEvent.click(screen.getByRole("button", { name: "Registra" }));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
    amount: 27.5, bank_account_id: "manuale-1", account_label: "Conto operativo",
  })));
});

it("mostra i conti manuali già esistenti e modifica il nome senza intervenire sul saldo", async () => {
  db.accounts = [
    { id: "manuale", company_id: "impresa", is_manual: true, is_active: true, display_name: "Conto interno", opening_balance: 120, current_balance: 95 },
    { id: "collegato", company_id: "impresa", is_manual: false, is_active: true, connection_id: "connessione", display_name: "Banca collegata" },
  ];
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/azienda/impostazioni/banca?tab=manuali"]}>
    <SettingsBanca />
  </MemoryRouter></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Modifica Conto interno" }));
  expect(screen.queryByText("Banca collegata")).toBeNull();
  fireEvent.change(screen.getByLabelText("Nome del conto"), { target: { value: "Conto rinominato" } });
  fireEvent.click(screen.getByRole("button", { name: "Salva conto" }));
  expect(await screen.findByRole("button", { name: "Modifica Conto rinominato" })).toBeVisible();
  expect(db.updates).toEqual([{ display_name: "Conto rinominato", account_name: "Conto rinominato" }]);
  expect(db.accounts[0].current_balance).toBe(95);
});

it("apre ancora le connessioni all’indirizzo base e riserva la gestione dei conti agli amministratori", async () => {
  db.admin = false;
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/azienda/impostazioni/banca"]}>
    <SettingsBanca />
  </MemoryRouter></QueryClientProvider>);
  expect(screen.getByText("Connessioni Open Banking")).toBeVisible();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Conti manuali" }), { button: 0, ctrlKey: false });
  expect(await screen.findByText("Nessun conto manuale.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Aggiungi conto" })).toBeNull();
});
