import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {MemoryRouter} from "react-router-dom";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {InlineEditableDatesCard} from "@/components/orders/InlineEditableDatesCard";
const m = vi.hoisted(() => ({edit: true, denied: false, failed: false, syncFailed: false, from: vi.fn(), update: vi.fn(), eq: vi.fn(), invoke: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), preset: vi.fn()}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({effectiveCompany: {id: "company"}})}));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => ({canEditOrders: m.edit})}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {from: m.from, functions: {invoke: m.invoke}}}));
vi.mock("sonner", () => ({toast: {success: m.success, error: m.error, warning: m.warning}}));
vi.mock("@/components/appointments/AppointmentDialog", () => ({AppointmentDialog: (props: {open: boolean; defaultAppointmentType?: string}) => {m.preset(props);return props.open ? <p>Appuntamento {props.defaultAppointmentType}</p> : null;}}));
const base = {orderId: "order", workStartDate: "2026-10-13", workEndDate: "2026-10-14", workStartTime: "08:00:00", workEndTime: "17:00:00", updatedAt: "version-1", defaultAddress: "Via Verdi 12"};
function draw(props = {}) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  const invalidations = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}><MemoryRouter><InlineEditableDatesCard {...base} {...props} /></MemoryRouter></QueryClientProvider>);
  return invalidations;
}
beforeEach(() => {
  vi.clearAllMocks(); m.edit = true; m.denied = false; m.failed = false; m.syncFailed = false;
  m.from.mockImplementation(() => {
    const q = {update: (value: object) => {m.update(value);return q;}, eq: (key: string, value: string) => {m.eq(key, value);return q;}, select: () => q,
      maybeSingle: async () => ({data: m.denied ? null : {id: "order"}, error: m.failed ? new Error("Rete") : null})};return q;
  });
  m.invoke.mockImplementation(async () => ({data: {}, error: m.syncFailed ? new Error("Sync") : null}));
});
afterEach(cleanup);
describe("Date visibili, modifica esplicita e calendario unico", () => {
  it("mostra subito le date e gli orari senza aprire sezioni", () => {
    draw(); expect(screen.getByText("13 ott 2026 · 08:00")).toBeInTheDocument();
    expect(screen.getByText("14 ott 2026 · 17:00")).toBeInTheDocument();
    // Solo le date: niente posa, niente pulsanti per appuntamenti, cronoprogramma o calendario (31/10/2026).
    expect(screen.getByText("Inizio lavori previsto")).toBeInTheDocument();
    expect(screen.getByText("Fine lavori prevista")).toBeInTheDocument();
    expect(screen.queryByText("Posa prevista")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", {name: "Apri calendario"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Pianifica appuntamento"})).not.toBeInTheDocument();
    expect(m.from).not.toHaveBeenCalled();
  });
  it("l'arrivo materiali compare solo se c'è", () => {
    draw(); expect(screen.queryByText("Arrivo materiali")).not.toBeInTheDocument();
    cleanup(); draw({warehouseArrivalDate: "2026-10-10"});
    expect(screen.getByText("Arrivo materiali")).toBeInTheDocument(); expect(screen.getByText("10 ott 2026")).toBeInTheDocument();
  });
  it("modificare e annullare non scrive né invia eventi", () => {
    draw(); fireEvent.click(screen.getByRole("button", {name: "Modifica date"}));
    fireEvent.change(screen.getByLabelText("Inizio lavori previsto"), {target: {value: "2026-10-14"}});
    expect(m.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name: "Annulla"}));
    expect(m.update).not.toHaveBeenCalled(); expect(m.invoke).not.toHaveBeenCalled();
  });
  it("blocca intervalli non validi prima di qualsiasi scrittura", () => {
    draw(); fireEvent.click(screen.getByRole("button", {name: "Modifica date"}));
    fireEvent.change(screen.getByLabelText("Fine lavori prevista"), {target: {value: "2026-10-12"}});
    fireEvent.click(screen.getByRole("button", {name: "Salva date"}));
    expect(m.error).toHaveBeenCalledWith(expect.stringMatching(/prima/)); expect(m.update).not.toHaveBeenCalled();
  });
  it("salva una volta, controlla la versione e aggiorna commessa, Campo e agenda senza creare appuntamenti", async () => {
    const invalidate = draw(); fireEvent.click(screen.getByRole("button", {name: "Modifica date"}));
    fireEvent.change(screen.getByLabelText("Fine lavori prevista"), {target: {value: "2026-10-15"}});
    fireEvent.click(screen.getByRole("button", {name: "Salva date"}));
    await waitFor(() => expect(m.success).toHaveBeenCalledWith("Date della commessa salvate"));
    expect(m.update).toHaveBeenCalledOnce(); expect(m.from).toHaveBeenCalledWith("orders");
    expect(m.from).not.toHaveBeenCalledWith("appointments");
    expect(m.eq).toHaveBeenCalledWith("id", "order"); expect(m.eq).toHaveBeenCalledWith("company_id", "company"); expect(m.eq).toHaveBeenCalledWith("updated_at", "version-1");
    expect(m.invoke).not.toHaveBeenCalled(); // The existing DB trigger owns the queue.
    expect(invalidate).toHaveBeenCalledWith({queryKey: ["order-appointments", "order"]});
    expect(invalidate).toHaveBeenCalledWith({queryKey: ["orders", "detail", "order"]});
    expect(invalidate).toHaveBeenCalledWith({queryKey: ["campo-lavoro", "order"]});
    expect(screen.getByText("15 ott 2026 · 17:00")).toBeInTheDocument();
  });
  it("se il server rifiuta una modifica concorrente, mantiene il dialogo e non avvia sync", async () => {
    m.denied = true; draw(); fireEvent.click(screen.getByRole("button", {name: "Modifica date"}));
    fireEvent.click(screen.getByRole("button", {name: "Salva date"}));
    await waitFor(() => expect(m.error).toHaveBeenCalledWith(expect.stringMatching(/cambiata/)));
    expect(screen.getByRole("dialog")).toBeInTheDocument(); expect(m.success).not.toHaveBeenCalled(); expect(m.invoke).not.toHaveBeenCalled();
  });
  it("un errore di scrittura mantiene il dialogo e non mostra date fittizie o successo", async () => {
    m.failed = true; draw(); fireEvent.click(screen.getByRole("button", {name: "Modifica date"}));
    fireEvent.click(screen.getByRole("button", {name: "Salva date"}));
    await waitFor(() => expect(m.error).toHaveBeenCalledWith("Rete"));
    expect(m.success).not.toHaveBeenCalled(); expect(m.invoke).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("in sola lettura non offre modifica", () => {
    m.edit = false; draw(); expect(screen.queryByRole("button", {name: "Modifica date"})).not.toBeInTheDocument();
    expect(m.from).not.toHaveBeenCalled();
  });
});
