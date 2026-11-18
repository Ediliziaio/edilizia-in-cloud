import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
// Le tendine di Radix scorrono fino all'opzione scelta: jsdom non sa farlo.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

const entry = {
  id: "pn1", company_id: "demo", direction: "entrata", category: "incasso", description: "Incasso fattura 17",
  amount: 52000, entry_date: "2026-11-10", payment_method: "bonifico", reference_number: "17", invoice_id: "f17",
  order_id: null, supplier_id: null, cost_id: null, scadenza_id: null, order_item_id: null, account_label: "banca",
  is_auto: false, auto_source: null, attachment_url: null, attachment_name: null, notes: null, created_at: "2026-11-10",
} as PrimaNotaEntry;

it("apre la registrazione già compilata e la salva con la sua fattura", async () => {
  const confirm = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={vi.fn()} onConfirm={confirm} isPending={false} entry={entry} /></QueryClientProvider>);
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

it("la categoria decide il verso, e il pulsante spento dice cosa manca", async () => {
  render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} isPending={false} /></QueryClientProvider>);
  // Appena aperta: uscita, e il motivo per cui non si può registrare è scritto.
  expect(screen.getByRole("button", { name: "↑ Uscita" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Manca la descrizione.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Registra" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "Acconto cliente" } });
  expect(screen.getByText("Manca l’importo.")).toBeTruthy();
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "120" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Registra" })).toBeEnabled());
  // Il verso si cambia anche a mano, e i due pulsanti si escludono.
  fireEvent.click(screen.getByRole("button", { name: "↓ Entrata" }));
  expect(screen.getByRole("button", { name: "↓ Entrata" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "↑ Uscita" })).toHaveAttribute("aria-pressed", "false");
});

it("scegliere «Incasso cliente» gira il verso da sé e chiede la fattura", async () => {
  render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} isPending={false} /></QueryClientProvider>);
  expect(screen.getByRole("button", { name: "↑ Uscita" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.keyDown(screen.getByLabelText("Categoria"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Incasso cliente" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "↓ Entrata" })).toHaveAttribute("aria-pressed", "true"));
  expect(screen.getByRole("button", { name: "↑ Uscita" })).toHaveAttribute("aria-pressed", "false");
  // E compare la fattura da incassare, che prima non c'era.
  expect(screen.getByText("Fattura incassata")).toBeTruthy();
});

it("in modifica apre già i dettagli quando la registrazione ha note, riferimento o allegato", () => {
  const conNote = { ...entry, notes: "Pari entrata solo contabile", attachment_url: "prima-nota-attachments/a/b.pdf", attachment_name: "b.pdf" };
  const { unmount } = render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} isPending={false} entry={conNote} /></QueryClientProvider>);
  expect(screen.getByLabelText("Note")).toHaveValue("Pari entrata solo contabile");
  expect(screen.getByLabelText("Riferimento")).toHaveValue("17");
  // L'allegato già caricato si apre, non è più solo una scritta.
  expect(screen.getByRole("button", { name: /Apri allegato b\.pdf/ })).toBeTruthy();
  unmount();
  render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} isPending={false} entry={{ ...entry, reference_number: null }} /></QueryClientProvider>);
  expect(screen.getByText("Riferimento, allegato e note").closest("details")?.open).toBe(false);
});
