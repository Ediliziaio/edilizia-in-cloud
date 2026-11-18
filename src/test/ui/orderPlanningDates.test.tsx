import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {MemoryRouter} from "react-router-dom";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {InlineEditableDatesCard} from "@/components/orders/InlineEditableDatesCard";
import type { PlanningPhase } from "@/lib/orders/planningSchedule";
const m = vi.hoisted(() => ({edit: true, denied: false, failed: false, syncFailed: false, phaseFailed: false, phases: [] as PlanningPhase[], phaseFilters: [] as unknown[][], phaseRanges: [] as number[][], from: vi.fn(), update: vi.fn(), eq: vi.fn(), invoke: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), preset: vi.fn()}));
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
  m.phases = []; m.phaseFailed = false; m.phaseFilters = []; m.phaseRanges = [];
  m.from.mockImplementation((table: string) => {
    if (table === "order_work_phases") {
      let from = 0, to = 499;
      const q = { select: () => q, eq: (...args: unknown[]) => {m.phaseFilters.push(args); return q;}, order: () => q,
        range: (a: number, b: number) => {from = a; to = b; m.phaseRanges.push([a,b]); return q;},
        abortSignal: async () => ({data: m.phases.slice(from, to + 1), error: m.phaseFailed ? new Error("Rete fasi") : null}) };
      return q;
    }
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
  it("confronta le date delle stesse fasi, scoped per azienda e commessa, senza scrivere", async () => {
    m.phases = [{id:"f1", name:"Demolizioni", start_date:"2026-10-10", end_date:"2026-10-12"}, {id:"f2", name:"Finiture", start_date:"2026-10-13", end_date:"2026-10-20"}];
    draw(); fireEvent.click(screen.getByRole("button", {name:"Modifica date"}));
    const align = await screen.findByRole("button", {name:"Usa periodo delle fasi"});
    expect(m.phaseFilters).toEqual([["order_id","order"], ["company_id","company"]]);
    fireEvent.click(align);
    expect(screen.getByLabelText("Inizio lavori previsto")).toHaveValue("2026-10-10");
    expect(screen.getByLabelText("Fine lavori prevista")).toHaveValue("2026-10-20");
    expect(m.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name:"Annulla"}));
    expect(screen.getByText("13 ott 2026 · 08:00")).toBeInTheDocument();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("allineare e salvare aggiorna solo la commessa, preservando orari e traguardi", async () => {
    m.phases = [{id:"f1", name:"Fase", start_date:"2026-10-10", end_date:"2026-10-20"}];
    draw({expectedDate:"2026-10-22"}); fireEvent.click(screen.getByRole("button", {name:"Modifica date"}));
    fireEvent.click(await screen.findByRole("button", {name:"Usa periodo delle fasi"}));
    fireEvent.click(screen.getByRole("button", {name:"Salva date"}));
    await waitFor(() => expect(m.success).toHaveBeenCalled());
    expect(m.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({work_start_date:"2026-10-10",work_end_date:"2026-10-20",expected_date:"2026-10-22",work_start_time:"08:00",work_end_time:"17:00"}));
    expect(m.invoke).not.toHaveBeenCalled();
  });
  it("non propone un periodo completo da fasi incomplete o incoerenti", async () => {
    m.phases = [{id:"f1", name:"Da completare", start_date:"2026-10-10", end_date:null}, {id:"f2", name:"Invertita", start_date:"2026-10-20", end_date:"2026-10-10"}];
    draw(); fireEvent.click(screen.getByRole("button", {name:"Modifica date"}));
    expect(await screen.findByRole("button", {name:"Usa periodo delle fasi"})).toBeDisabled();
    expect(screen.getByText(/1 fase da pianificare/)).toBeInTheDocument();
    expect(screen.getByText(/1 fase con date da correggere/)).toBeInTheDocument();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("un errore di lettura non diventa un cronoprogramma vuoto o allineato", async () => {
    m.phaseFailed = true; draw(); fireEvent.click(screen.getByRole("button", {name:"Modifica date"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Non è stato possibile leggere le date delle fasi");
    expect(screen.queryByText("Periodo allineato")).not.toBeInTheDocument();
    expect(screen.queryByText(/Non ci sono ancora fasi/)).not.toBeInTheDocument();
  });
  it("segnala la posa fuori periodo senza cambiarla automaticamente", async () => {
    draw({expectedDate:"2027-03-15"}); fireEvent.click(screen.getByRole("button", {name:"Modifica date"}));
    expect(screen.getByText(/La consegna \/ posa prevista è fuori dal periodo/)).toBeInTheDocument();
    expect(screen.getByLabelText("Consegna / posa prevista")).toHaveValue("2027-03-15");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("apre il cronoprogramma dal popup senza applicare la bozza", () => {
    const openSchedule = vi.fn(); draw({onOpenSchedule: openSchedule}); fireEvent.click(screen.getByRole("button", {name:"Modifica date"}));
    fireEvent.click(screen.getByRole("button", {name:"Apri cronoprogramma"}));
    expect(openSchedule).toHaveBeenCalledOnce(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(m.update).not.toHaveBeenCalled();
  });
  it("si apre anche dal comando della vista Cronoprogramma", async () => {
    const onClose = vi.fn(); draw({dialogOpen:true, onDialogOpenChange:onClose, hideCard:true});
    expect(screen.getByRole("dialog")).toHaveTextContent("Confronto con il cronoprogramma");
    expect(screen.queryByRole("button", {name:"Modifica date"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name:"Annulla"}));
    expect(onClose).toHaveBeenCalledWith(false); expect(m.update).not.toHaveBeenCalled();
  });
  it("la scheda apre il popup condiviso senza montarne un duplicato", () => {
    const open = vi.fn(); draw({onRequestEdit:open});
    fireEvent.click(screen.getByRole("button", {name:"Modifica date"}));
    expect(open).toHaveBeenCalledOnce(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(m.from).not.toHaveBeenCalled();
  });
  it("legge tutte le fasi anche oltre la prima pagina", async () => {
    m.phases = Array.from({length:501}, (_,n) => ({id:`f${n}`,name:`Fase ${n}`,start_date:"2026-10-10",end_date:n === 500 ? "2026-10-30" : "2026-10-20"}));
    draw(); fireEvent.click(screen.getByRole("button", {name:"Modifica date"}));
    expect(await screen.findByText("501 di 501 fasi con entrambe le date previste")).toBeInTheDocument();
    expect(m.phaseRanges).toEqual([[0,499],[500,999]]);
    fireEvent.click(screen.getByRole("button", {name:"Usa periodo delle fasi"}));
    expect(screen.getByLabelText("Fine lavori prevista")).toHaveValue("2026-10-30");
  });
});
