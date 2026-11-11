import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({ ticketWrites: vi.fn(), readTicket: vi.fn(), messageWrites: vi.fn(), toast: vi.fn(), created: vi.fn(), upload: vi.fn(), signed: vi.fn() }));
vi.mock("@tanstack/react-query", async (original) => ({ ...await original<typeof import("@tanstack/react-query")>(), useQuery: () => ({ data: [] as unknown[] }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u-test" }, effectiveCompany: { id: "c-test" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: api.toast }) }));
vi.mock("@/hooks/useCompanyCustomers", () => ({ useCompanyCustomers: () => ({ data: [{ id: "cliente-test", first_name: "Cliente", last_name: "test" }] }) }));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [] as unknown[] }) }));
vi.mock("@/components/orders/CreateCustomerDialog", () => ({ CreateCustomerDialog: (): null => null }));
vi.mock("@/components/tickets/OrdinaMerceDialog", () => ({ OrdinaMerceDialog: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => <button onClick={() => onOpenChange(false)}>Chiudi ordine simulato</button> }));
vi.mock("@/lib/ticketPlaybook", () => ({ applyPlaybookToTicket: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ upload: api.upload, createSignedUrl: api.signed }) },
  from: (table: string) => {
    if (table === "tickets") return { insert: (payload: unknown) => { api.ticketWrites(payload); return { select: () => ({ single: api.readTicket }) }; } };
    if (table === "ticket_messages") return { insert: api.messageWrites };
    if (table === "companies") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ticket_playbook_auto_apply: false }, error: null as null }) }) }) };
    throw new Error(`Tabella inattesa: ${table}`);
  },
} }));
import { NuovoTicketDialog } from "@/components/tickets/NuovoTicketDialog";
import CreateCompanyTicket from "@/pages/azienda/CreateCompanyTicket";
function Form() { const [open, setOpen] = useState(true); return <NuovoTicketDialog open={open} onOpenChange={setOpen} initial={{ customerId: "cliente-test" }} onCreated={api.created} />; }
beforeEach(() => {
  vi.clearAllMocks();
  api.readTicket.mockReset().mockImplementation(async () => ({ data: { id: `ticket-${api.ticketWrites.mock.calls.length}` }, error: null as null }));
  api.messageWrites.mockReset().mockResolvedValue({ error: null as null });
  api.upload.mockReset().mockResolvedValue({ error: null as null });
  api.signed.mockReset().mockResolvedValue({ data: { signedUrl: "https://files.example.invalid/demo" } });
});
afterEach(cleanup);
function setup() {
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><Form /></QueryClientProvider></MemoryRouter>);
  fireEvent.change(screen.getByRole("textbox", { name: "Oggetto *" }), { target: { value: "Richiesta locale test" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Messaggio iniziale (opzionale)" }), { target: { value: "Messaggio da completare" } });
}
it("se fallisce il messaggio riprende il ticket già creato senza duplicarlo", async () => {
  api.messageWrites.mockResolvedValueOnce({ error: new Error("Messaggio offline") });
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Crea ticket" }));
  await waitFor(() => expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
  expect(api.created).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Il ticket è già stato creato"));
  expect(screen.getByRole("textbox", { name: "Messaggio iniziale (opzionale)" })).toHaveValue("Messaggio da completare");
  fireEvent.click(screen.getByRole("button", { name: /Crea ticket|Completa ticket/ }));
  await waitFor(() => expect(api.created).toHaveBeenCalled());
  expect(api.ticketWrites).toHaveBeenCalledOnce();
  expect(api.messageWrites).toHaveBeenCalledTimes(2);
  expect(api.created).toHaveBeenCalledExactlyOnceWith("ticket-1");
});
it("blocca doppio invio e chiusura durante la creazione", async () => {
  let resolve!: (value: { data: { id: string }; error: null }) => void;
  api.readTicket.mockImplementation(() => new Promise((done) => { resolve = done; }));
  setup();
  const submit = screen.getByRole("button", { name: "Crea ticket" });
  fireEvent.click(submit); fireEvent.click(submit);
  await waitFor(() => expect(api.ticketWrites).toHaveBeenCalledOnce());
  expect(screen.getByRole("textbox", { name: "Oggetto *" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => { resolve({ data: { id: "ticket-1" }, error: null }); });
  await waitFor(() => expect(api.created).toHaveBeenCalledExactlyOnceWith("ticket-1"));
});

it("riprende gli allegati senza duplicare testo, file completati o upload già riusciti", async () => {
  api.messageWrites.mockResolvedValueOnce({ error: null as null })
    .mockResolvedValueOnce({ error: null as null })
    .mockResolvedValueOnce({ error: new Error("Legame allegato offline") });
  setup();
  fireEvent.change(screen.getByLabelText("Allegati (opzionale)"), { target: { files: [
    new File(["fixture uno"], "uno.pdf", { type: "application/pdf" }),
    new File(["fixture due"], "due.pdf", { type: "application/pdf" }),
  ] } });
  fireEvent.click(screen.getByRole("button", { name: "Crea ticket" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Il ticket è già stato creato"));
  expect(api.upload).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Completa ticket" }));
  await waitFor(() => expect(api.created).toHaveBeenCalledExactlyOnceWith("ticket-1"));
  expect(api.ticketWrites).toHaveBeenCalledOnce();
  expect(api.upload).toHaveBeenCalledTimes(2);
  expect(api.messageWrites).toHaveBeenCalledTimes(4);
  expect(api.messageWrites.mock.calls.filter(([row]) => row.message === "Messaggio da completare")).toHaveLength(1);
});
it("mantiene il passaggio merce da ordinare e conclude dopo la sua finestra", async () => {
  setup();
  fireEvent.click(screen.getByRole("switch", { name: "Serve della merce" }));
  fireEvent.click(screen.getByRole("button", { name: "Crea ticket" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Chiudi ordine simulato" })).toBeInTheDocument());
  expect(api.created).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Chiudi ordine simulato" }));
  expect(api.created).toHaveBeenCalledExactlyOnceWith("ticket-1");
});

it("la pagina standalone blocca il proprio ritorno durante la registrazione", async () => {
  let resolve!: (value: { data: { id: string }; error: null }) => void;
  api.readTicket.mockImplementation(() => new Promise<{ data: { id: string }; error: null }>((done) => { resolve = done; }));
  render(<MemoryRouter initialEntries={["/azienda/assistenza/nuovo?customer_id=cliente-test"]}><QueryClientProvider client={new QueryClient()}><Routes>
    <Route path="/azienda/assistenza/nuovo" element={<CreateCompanyTicket />} />
    <Route path="/azienda/assistenza" element={<p>Elenco simulato</p>} />
    <Route path="/azienda/assistenza/:id" element={<p>Ticket registrato simulato</p>} />
  </Routes></QueryClientProvider></MemoryRouter>);
  fireEvent.change(screen.getByRole("textbox", { name: "Oggetto *" }), { target: { value: "Ticket pagina test" } });
  fireEvent.click(screen.getByRole("button", { name: "Crea ticket" }));
  await waitFor(() => expect(api.ticketWrites).toHaveBeenCalledOnce());
  const back = screen.getByRole("button", { name: /Torna all.assistenza/ });
  expect(back).toBeDisabled();
  fireEvent.click(back);
  expect(screen.getByRole("heading", { name: "Crea Ticket" })).toBeInTheDocument();
  await act(async () => { resolve({ data: { id: "ticket-1" }, error: null }); });
  await waitFor(() => expect(screen.getByText("Ticket registrato simulato")).toBeInTheDocument());
});
