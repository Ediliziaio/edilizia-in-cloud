import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {LinkedAppointments} from "@/components/appointments/LinkedAppointments";
const m = vi.hoisted(() => ({from: vi.fn(), queryError: false, denied: false, update: vi.fn(), error: vi.fn(), eq: vi.fn(), preset: vi.fn(), rows: [] as object[]}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({effectiveCompany: {id: "company"}})}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {from: m.from}}));
vi.mock("sonner", () => ({toast: {error: m.error}}));
vi.mock("@/components/appointments/AppointmentDialog", () => ({AppointmentDialog: (props: {open: boolean}) => {m.preset(props);return props.open ? <p>Editor appuntamento</p> : null;}}));
const appointment = {id: "appointment", title: "Verifica posa", appointment_type: "verifica_cantiere", appointment_date: "2026-10-13", appointment_time: "09:00", appointment_end_time: "10:00", is_completed: false, status: "confermato", address_postal_code: "40121", address_line: "Via Verdi 12", formatted_address: "Via Verdi 12, Bologna", reminder_minutes: 30};
const draw = (editable = true) => render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}})}><LinkedAppointments orderId="order" editable={editable} defaultAddress="Via Verdi 12" /></QueryClientProvider>);
beforeEach(() => {
  vi.clearAllMocks(); m.queryError = false; m.denied = false; m.rows = [appointment];
  m.from.mockImplementation(() => {
    let patch: {is_completed: boolean} | null = null;
    const q = {select: () => q, eq: (key: string, value: string) => {m.eq(key, value);return q;},
      order: async () => ({data: m.rows, error: m.queryError ? new Error("Rete") : null}),
      update: (value: {is_completed: boolean}) => {patch = value;m.update(value);return q;},
      maybeSingle: async () => ({data: m.denied ? null : {id: "appointment", ...patch}, error: null as null})};return q;
  });
});
afterEach(cleanup);
describe("Agenda della commessa", () => {
  it("legge nell'azienda corretta e distingue i tipi operativi recenti", async () => {
    draw(); await screen.findByRole("button", {name: appointment.title});
    expect(m.eq).toHaveBeenCalledWith("company_id", "company"); expect(m.eq).toHaveBeenCalledWith("order_id", "order");
    expect(screen.getByText("Verifica cantiere")).toBeInTheDocument(); expect(screen.getByText("09:00–10:00")).toBeInTheDocument();
  });
  it("non mostra un falso elenco vuoto quando la lettura fallisce", async () => {
    m.rows = []; m.queryError = true; draw();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a caricare");
    expect(screen.queryByText("Nessun appuntamento aperto.")).not.toBeInTheDocument();
  });
  it("tiene completati e annullati nello storico, senza contare gli annullati come aperti", async () => {
    m.rows = [{...appointment, is_completed: true}, {...appointment, id: "cancelled", title: "Appuntamento annullato", status: "annullato"}];
    draw(); await screen.findByText("Nessun appuntamento aperto.");
    const history = screen.getByText("Storico appuntamenti (2)").closest("details"); expect(history).not.toHaveAttribute("open");
    expect(screen.getByRole("checkbox", {name: "Completa appuntamento Appuntamento annullato", hidden: true})).toBeDisabled();
  });
  it("in modifica conserva indirizzo completo e promemoria", async () => {
    draw(); fireEvent.click(await screen.findByRole("button", {name: appointment.title}));
    expect(m.preset).toHaveBeenLastCalledWith(expect.objectContaining({open: true, appointment: expect.objectContaining({address_postal_code: "40121", address_line: "Via Verdi 12", reminder_minutes: 30}), showOrderSelect: false, requireTime: true}));
  });
  it("in sola lettura non permette modifiche o completamento", async () => {
    draw(false); expect(await screen.findByRole("button", {name: appointment.title})).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled(); expect(screen.queryByRole("button", {name: "Nuovo appuntamento"})).not.toBeInTheDocument();
  });
  it("rifiuta il falso successo quando la riga non viene aggiornata", async () => {
    m.denied = true; draw(); fireEvent.click(await screen.findByRole("checkbox", {name: "Completa appuntamento Verifica posa"}));
    await waitFor(() => expect(m.error).toHaveBeenCalledWith("Appuntamento non aggiornato. Riprova."));
    expect(m.eq).toHaveBeenCalledWith("id", "appointment"); expect(m.eq).toHaveBeenCalledWith("company_id", "company"); expect(m.eq).toHaveBeenCalledWith("order_id", "order");
  });
});
