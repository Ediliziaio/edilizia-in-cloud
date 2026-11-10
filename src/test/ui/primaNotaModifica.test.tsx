import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewEntryDialog from "@/components/prima-nota/NewEntryDialog";
import { perchePrimaNotaNonModificabile, type PrimaNotaEntry } from "@/hooks/usePrimaNota";

// La fattura collegata è già pagata dall'incasso stesso: deve restare scelta e il suo
// «da incassare» deve contare l'importo di questa registrazione.
const FATTURA = { id: "f17", invoice_number: "17", issue_date: "2026-05-25", client_company_name: "Cliente prova", total: 52000, paid_amount: 52000, order_id: null as string | null };
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ upload: vi.fn() }) },
  from: (tabella: string) => {
    let perId = false;
    const dati = (): unknown => (tabella === "invoices" ? (perId ? FATTURA : []) : []);
    const q = {
      select: () => q, not: () => q, is: () => q, order: () => q, limit: () => q,
      eq: (col: string) => { if (col === "id") perId = true; return q; },
      maybeSingle: () => Promise.resolve({ data: dati(), error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: dati(), error: null }).then(resolve),
    };
    return q;
  },
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const entry = {
  id: "pn1", company_id: "demo", direction: "entrata", category: "incasso", description: "Incasso fattura 17",
  amount: 52000, entry_date: "2026-11-10", payment_method: "bonifico", reference_number: "17", invoice_id: "f17",
  order_id: null, supplier_id: null, cost_id: null, scadenza_id: null, order_item_id: null, account_label: "banca",
  is_auto: false, auto_source: null, attachment_url: null, attachment_name: null, notes: null, created_at: "2026-11-10",
} as PrimaNotaEntry;

it("apre la registrazione già compilata e la salva con la sua fattura", async () => {
  const confirm = vi.fn();
  render(<NewEntryDialog open onOpenChange={vi.fn()} onConfirm={confirm} isPending={false} entry={entry} />);
  expect(screen.getByText("Modifica registrazione")).toBeTruthy();
  expect(screen.getByDisplayValue("Incasso fattura 17")).toBeTruthy();
  await waitFor(() => expect(screen.getByText(/17 · Cliente prova/)).toBeTruthy());
  // 52.000 incassati da questa stessa registrazione: si possono ancora correggere, non è «oltre il residuo».
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "50000" } });
  expect(screen.queryByText(/supera quanto resta/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ amount: 50000, invoice_id: "f17", entry_date: "2026-11-10", direction: "entrata" }));
  expect(confirm.mock.calls[0][0]).not.toHaveProperty("attachment_url");
});

it("dice perché una registrazione automatica non si modifica da qui", () => {
  expect(perchePrimaNotaNonModificabile(entry)).toBeNull();
  expect(perchePrimaNotaNonModificabile({ ...entry, is_auto: true })).toMatch(/automatica/);
  expect(perchePrimaNotaNonModificabile({ ...entry, documento_fiscale_id: "d" })).toMatch(/fattura emessa dal programma/);
  expect(perchePrimaNotaNonModificabile({ ...entry, bank_transaction_id: "b" })).toMatch(/Tesoreria/);
});
