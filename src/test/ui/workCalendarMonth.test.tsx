import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import type {
  CalendarAppointment,
  CalendarOrder,
  GoogleBusySlot,
  CalendarIntervento,
  CalendarManutenzione,
} from "@/types/calendar";
vi.mock("@/components/calendar/CalendarEventTravel", () => ({
  CalendarEventTravel: () => <div>Viaggio</div>,
}));
vi.mock("@/components/calendar/CalendarSiteWeather", () => ({
  CalendarSiteWeather: () : null => null,
}));
const state = vi.hoisted(() => ({
  mobile: false,
  readonly: false,
  editOrders: true,
  viewPayments: false,
  viewTickets: true,
  viewMaintenance: true,
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    solaLettura: state.readonly,
    canEditOrders: state.editOrders,
    canViewScadenzario: state.viewPayments,
    canViewTickets: state.viewTickets,
    canViewManutenzione: state.viewMaintenance,
  }),
}));
vi.mock("@/components/calendar/EditOrderDatesDialog", () => ({
  EditOrderDatesDialog: ({ order }: { order: { id: string } }) => (
    <div role="dialog">Date {order.id}</div>
  ),
}));
vi.mock("@/components/appointments/AppointmentDialog", () => ({
  AppointmentDialog: ({
    open,
    defaultDate,
    appointment,
  }: {
    open: boolean;
    defaultDate?: string;
    appointment?: { id: string };
  }) =>
    open ? (
      <div role="dialog">
        {appointment
          ? `Appuntamento ${appointment.id}`
          : `Nuovo ${defaultDate}`}
      </div>
    ) : null,
}));
const order: CalendarOrder = {
  id: "order",
  order_code: "ORD-1",
  description: "Facciata",
  expected_date: null,
  work_start_date: "2026-10-14",
  work_end_date: "2026-10-15",
  warehouse_arrival_date: null,
  created_at: "",
  customer_id: "customer",
  current_status_id: null,
  customer: { first_name: "Anna", last_name: "Rossi" },
  status: null,
  order_employees: [
    { employee: { id: "worker", first_name: "Mario", last_name: "Bianchi" } },
  ],
  resource_bookings: [
    {
      resourceId: "worker",
      resourceName: "Mario Bianchi",
      resourceType: "employee",
      start_date: "2026-10-14",
      end_date: "2026-10-14",
    },
  ],
};
const appointment = (id: string, time: string): CalendarAppointment => ({
  id,
  title: id,
  description: "",
  appointment_date: "2026-10-14",
  appointment_time: time,
  appointment_end_time: null,
  appointment_type: "altro",
  assigned_to: null,
  order_id: null,
  is_completed: false,
  company_id: "company",
  created_by: "user",
});
function Page({
  orders = [order],
  appointments = [
    appointment("Tardi", "18:00"),
    appointment("Presto", "06:15"),
  ],
  busySlots = [],
  interventi = [],
  manutenzioni = [],
  presentation = "month",
}: {
  presentation?: "month" | "agenda";
  orders?: CalendarOrder[];
  appointments?: CalendarAppointment[];
  busySlots?: GoogleBusySlot[];
  interventi?: CalendarIntervento[];
  manutenzioni?: CalendarManutenzione[];
}) {
  const [date, setDate] = useState(new Date(2026, 9, 14));
  return (
    <CalendarMonthView
      presentation={presentation}
      orders={orders}
      appointments={appointments}
      busySlots={busySlots}
      interventi={interventi}
      manutenzioni={manutenzioni}
      currentDate={date}
      onDateChange={setDate}
    />
  );
}
function page(extra = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Page {...extra} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  state.mobile = false;
  state.readonly = false;
  state.editOrders = true;
  state.viewPayments = false;
  state.viewTickets = true;
  state.viewMaintenance = true;
});
afterEach(cleanup);
function openDayDetails() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Apri dettaglio del giorno selezionato",
    }),
  );
}
function selectEvent(name: RegExp) {
  const rows = within(
    screen.getByRole("navigation", { name: "Eventi del giorno" }),
  ).getAllByRole("button");
  const row = rows.find((b) => name.test(b.getAttribute("aria-label") || ""));
  if (!row) throw new Error(`Evento non trovato: ${name}`);
  fireEvent.click(row);
}
describe("Mese leggibile con agenda del giorno", () => {
  it("il mese mostra nomi e orari, senza aprire subito un pannello che restringe il calendario", () => {
    page();
    expect(
      screen.queryByRole("region", { name: "Dettaglio del giorno" }),
    ).toBeNull();
    const cell = screen.getByRole("button", {
      name: /mercoledì 14 ottobre 2026: 1 cantieri, 2 appuntamenti/,
    });
    expect(cell.textContent).toContain("Presto");
    expect(cell.textContent).toContain("06:15");
    expect(cell.textContent).toContain("Tardi");
    expect(cell.textContent).toContain("+1 altri eventi");
    openDayDetails();
    selectEvent(/ORD-1/);
    const day = within(
      screen.getByRole("region", { name: "Dettaglio del giorno" }),
    );
    expect(
      day.getByRole("link", { name: "ORD-1 · Rossi" }).getAttribute("href"),
    ).toBe("/azienda/ordini/order");
    expect(
      day.getByRole("heading", { name: /^Appuntamenti e impegni/ }),
    ).toBeTruthy();
    expect(
      day.getByRole("heading", { name: /^Cantieri e consegne/ }),
    ).toBeTruthy();
  });
  it("toccare una data seleziona il giorno e non apre un modulo per errore", () => {
    page();
    fireEvent.click(
      screen.getByRole("button", { name: /^giovedì 15 ottobre 2026:/ }),
    );
    expect(screen.queryByText(/^Nuovo 2026-/)).toBeNull();
    expect(
      screen.getByRole("dialog", { name: "Eventi del 15 ottobre 2026" }),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole("region", { name: "Dettaglio del giorno" }),
      ).getByRole("heading", { name: "giovedì 15 ottobre" }),
    ).toBeTruthy();
  });
  it("la creazione usa soltanto il comando esplicito e la data selezionata", () => {
    page();
    fireEvent.click(
      screen.getByRole("button", { name: /^giovedì 15 ottobre 2026:/ }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Nuovo appuntamento nel giorno selezionato",
      }),
    );
    expect(screen.getByRole("dialog").textContent).toBe("Nuovo 2026-10-15");
  });
  it("gli appuntamenti sono in ordine orario e aprono il loro identificativo", () => {
    page();
    openDayDetails();
    const titles = within(
      screen.getByRole("region", { name: "Dettaglio del giorno" }),
    )
      .getAllByRole("button", { name: /^Mostra dettagli:/ })
      .map((b) => b.getAttribute("aria-label"));
    expect(titles.indexOf("Mostra dettagli: Presto")).toBeLessThan(
      titles.indexOf("Mostra dettagli: Tardi"),
    );
    selectEvent(/Presto/);
    expect(screen.queryByText("Appuntamento Presto")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Modifica appuntamento" }),
    );
    expect(screen.getByRole("dialog").textContent).toBe("Appuntamento Presto");
  });
  it("le risorse sono riferite al giorno selezionato, senza estendere l’assegnazione sulla fase successiva", () => {
    page();
    openDayDetails();
    selectEvent(/ORD-1/);
    expect(screen.getByText("Mario Bianchi")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    fireEvent.click(
      screen.getByRole("button", { name: /^giovedì 15 ottobre 2026:/ }),
    );
    expect(screen.queryByText("Mario Bianchi")).toBeNull();
    expect(
      screen.getByText("Nessuna risorsa pianificata per questa data"),
    ).toBeTruthy();
  });
  it("la sola lettura lascia consultare le commesse e nasconde la creazione e la modifica", () => {
    state.readonly = true;
    page();
    openDayDetails();
    expect(
      screen.queryByRole("button", { name: "Modifica appuntamento" }),
    ).toBeNull();
    selectEvent(/ORD-1/);
    expect(screen.getByRole("link", { name: "ORD-1 · Rossi" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gestisci date" })).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Nuovo appuntamento nel giorno selezionato",
      }),
    ).toBeNull();
  });
  it("il giorno del mese adiacente si può selezionare e cambia il periodo", () => {
    page();
    fireEvent.click(
      screen.getByRole("button", { name: /^domenica 1 novembre 2026:/ }),
    );
    expect(
      screen.getByRole("heading", { name: "novembre 2026", hidden: true }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "domenica 1 novembre" }),
    ).toBeTruthy();
  });
  it("un evento esterno su due giorni occupa entrambi, con fine esclusiva a mezzanotte", () => {
    const busy: GoogleBusySlot = {
      id: "busy",
      start_at: "2026-10-14T00:00:00",
      end_at: "2026-10-16T00:00:00",
      summary: "Occupato",
      is_all_day: true,
      user_id: "user",
      google_calendar_id: null,
    };
    page({ orders: [], appointments: [], busySlots: [busy] });
    expect(
      screen.getByRole("button", {
        name: /^giovedì 15 ottobre 2026: 0 cantieri, 0 appuntamenti, 1 altri eventi/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /^venerdì 16 ottobre 2026: 0 cantieri, 0 appuntamenti, 0 altri eventi/,
      }),
    ).toBeTruthy();
  });
  it("le celle limitano le anteprime e indicano gli eventi rimanenti senza perdere il dettaglio completo", () => {
    page({
      appointments: [
        appointment("Uno", "08:00"),
        appointment("Due", "09:00"),
        appointment("Tre", "10:00"),
        appointment("Quattro", "11:00"),
      ],
    });
    const cell = screen.getByRole("button", {
      name: /^mercoledì 14 ottobre 2026:/,
    });
    expect(cell.textContent).toContain("Due");
    expect(cell.textContent).not.toContain("Tre");
    expect(cell.textContent).not.toContain("Quattro");
    expect(cell.textContent).toContain("+3 altri eventi");
    fireEvent.click(cell);
    expect(
      within(
        screen.getByRole("region", { name: "Dettaglio del giorno" }),
      ).getByRole("button", { name: "Mostra dettagli: Quattro" }),
    ).toBeTruthy();
  });
  it("commesse dello stesso cliente restano distinguibili e puntano ai rispettivi ordini", () => {
    page({
      orders: [order, { ...order, id: "order-2", order_code: "ORD-2" }],
      appointments: [],
    });
    const cell = screen.getByRole("button", {
      name: /^mercoledì 14 ottobre 2026:/,
    });
    expect(cell.getAttribute("title")).toContain("ORD-1");
    expect(cell.getAttribute("title")).toContain("ORD-2");
    fireEvent.click(cell);
    selectEvent(/ORD-2/);
    const details = within(
      screen.getByRole("region", { name: "Dettaglio del giorno" }),
    );
    expect(
      details.getByRole("link", { name: "ORD-2 · Rossi" }).getAttribute("href"),
    ).toBe("/azienda/ordini/order-2");
  });
  it("uscire dal dettaglio restituisce il mese e conserva la data selezionata", () => {
    page();
    fireEvent.click(
      screen.getByRole("button", { name: /^giovedì 15 ottobre 2026:/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(
      screen.queryByRole("region", { name: "Dettaglio del giorno" }),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /^giovedì 15 ottobre 2026:/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    openDayDetails();
    expect(
      screen.getByRole("heading", { name: "giovedì 15 ottobre" }),
    ).toBeTruthy();
  });
  it("le lavorazioni compaiono nelle date della fase e aprono la pianificazione canonica", () => {
    const planned = {
      ...order,
      work_start_date: "2026-10-01",
      work_end_date: "2026-10-31",
      work_phases: [
        {
          id: "phase",
          name: "Posa pavimenti",
          start_date: "2026-10-14",
          end_date: "2026-10-15",
          position: 0,
          status: "in_corso",
        },
      ],
    };
    page({ orders: [planned], appointments: [] });
    expect(
      screen.getByRole("button", {
        name: /^martedì 13 ottobre 2026: 0 cantieri/,
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /^mercoledì 14 ottobre 2026:/ }),
    );
    expect(
      screen.getByRole("heading", { name: "Posa pavimenti" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gestisci date" })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Apri lavorazioni" })
        .getAttribute("href"),
    ).toBe("/azienda/ordini/order?tab=cantiere&vista_cantiere=lavorazioni");
  });
  it("l'agenda dei sette giorni mantiene nomi, orari e apertura esplicita degli eventi", () => {
    page({ presentation: "agenda" });
    const agenda = within(
      screen.getByRole("region", { name: "Prossimi sette giorni" }),
    );
    expect(
      agenda.getByRole("heading", { name: "mercoledì 14 ott" }),
    ).toBeTruthy();
    expect(
      agenda.getByRole("heading", { name: "martedì 20 ott" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^mercoledì 14 ottobre 2026:/ }),
    ).toBeNull();
    fireEvent.click(agenda.getByRole("button", { name: /06:15Presto/ }));
    expect(
      screen.getByRole("dialog", { name: "Eventi del 14 ottobre 2026" }),
    ).toBeTruthy();
    expect(screen.queryByText(/^Nuovo 2026-/)).toBeNull();
  });
  it("mobile conserva la griglia leggibile e lo stesso dettaglio del giorno", () => {
    state.mobile = true;
    page();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /^giovedì 15 ottobre 2026:/ }),
    );
    expect(
      screen.getByRole("dialog", { name: "Eventi del 15 ottobre 2026" }),
    ).toBeTruthy();
    selectEvent(/ORD-1/);
    expect(
      screen.getByText("Nessuna risorsa pianificata per questa data"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Torna agli eventi" }));
    expect(
      screen.getByRole("navigation", { name: "Eventi del giorno" }),
    ).toBeTruthy();
  });
  it("ricerca anche per persona e filtra le categorie senza perdere le altre voci", () => {
    page();
    openDayDetails();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca negli eventi del giorno" }),
      { target: { value: "Mario" } },
    );
    expect(
      screen.getByRole("button", { name: /Mostra dettagli:.*ORD-1/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Mostra dettagli: Presto" }),
    ).toBeNull();
    expect(screen.getByText("Mario Bianchi")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca negli eventi del giorno" }),
      { target: { value: "" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Appuntamenti 2" }));
    expect(
      screen.getByRole("button", { name: "Mostra dettagli: Tardi" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Mostra dettagli:.*ORD-1/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tutti 3" }));
    expect(
      screen.getByRole("button", { name: /Mostra dettagli:.*ORD-1/ }),
    ).toBeTruthy();
  });
  it("mostra note complete, luogo, responsabile, contatto e collegamento della commessa corretta", () => {
    const rich = {
      ...appointment("Sopralluogo", "09:00"),
      appointment_end_time: "10:30",
      description: "Verificare gli accessi.\nPortare il rilievo completo.",
      formatted_address: "Via Roma 10, Milano",
      address_notes: "Ingresso dal cortile",
      assigned_profile: { first_name: "Giulia", last_name: "Verdi" },
      contact: { first_name: "Anna", last_name: "Rossi" },
      order_id: "linked-order",
      order: { order_code: "ORD-55", description: "Rifacimento facciata" },
      meeting_url: "https://meet.google.com/abc-defg-hij",
    };
    page({ appointments: [rich], orders: [] });
    openDayDetails();
    expect(screen.getByText("09:00–10:30")).toBeTruthy();
    expect(screen.getByText(/Portare il rilievo completo/)).toBeTruthy();
    expect(screen.getByText("Giulia Verdi")).toBeTruthy();
    expect(screen.getByText("Anna Rossi")).toBeTruthy();
    expect(screen.getByText("Ingresso dal cortile")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "ORD-55" }).getAttribute("href"),
    ).toBe(
      "/azienda/ordini/linked-order?tab=cantiere&vista_cantiere=lavorazioni",
    );
    expect(
      screen
        .getByRole("link", { name: "Apri collegamento" })
        .getAttribute("href"),
    ).toBe(rich.meeting_url);
  });
  it("il popup nasconde gli importi senza accesso allo scadenzario e non rende cliccabili URL non sicuri", () => {
    page({
      orders: [
        { ...order, pagamenti_scoperti: { acconto_eur: 999, saldo_eur: 0 } },
      ],
      appointments: [
        {
          ...appointment("Riunione", "09:00"),
          meeting_url: "javascript:alert(1)",
        },
      ],
    });
    openDayDetails();
    expect(
      screen.queryByRole("link", { name: "Apri collegamento" }),
    ).toBeNull();
    selectEvent(/ORD-1/);
    expect(screen.queryByText(/999/)).toBeNull();
  });
  it("la ricerca senza risultati si può azzerare e viene ripulita alla riapertura", () => {
    page();
    openDayDetails();
    const search = screen.getByRole("textbox", {
      name: "Cerca negli eventi del giorno",
    });
    fireEvent.change(search, { target: { value: "inesistente" } });
    expect(
      screen.getByText("Nessun evento corrisponde alla ricerca."),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Mostra tutti gli eventi" }),
    );
    expect(
      screen.getByRole("button", { name: "Mostra dettagli: Presto" }),
    ).toBeTruthy();
    fireEvent.change(search, { target: { value: "Tardi" } });
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    openDayDetails();
    expect(
      screen
        .getByRole("textbox", { name: "Cerca negli eventi del giorno" })
        .getAttribute("value"),
    ).toBe("");
    expect(
      screen.getByRole("button", { name: "Mostra dettagli: Presto" }),
    ).toBeTruthy();
  });
  it("sul telefono apre prima l’elenco e permette di tornare dal dettaglio senza chiudere il giorno", () => {
    state.mobile = true;
    page();
    fireEvent.click(
      screen.getByRole("button", { name: /^mercoledì 14 ottobre 2026:/ }),
    );
    expect(
      screen.queryByRole("article", {
        name: "Dettagli dell’evento selezionato",
      }),
    ).toBeNull();
    selectEvent(/Presto/);
    expect(screen.getByRole("heading", { name: "Presto" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Torna agli eventi" }));
    expect(
      screen.getByRole("navigation", { name: "Eventi del giorno" }),
    ).toBeTruthy();
    selectEvent(/Tardi/);
    expect(screen.getByRole("heading", { name: "Tardi" })).toBeTruthy();
    expect(screen.queryByText(/^Appuntamento Tardi$/)).toBeNull();
  });
  it("gli interventi mostrano luogo, ora italiana, durata e collegamento all'assistenza", () => {
    page({
      orders: [],
      appointments: [],
      interventi: [
        {
          id: "ticket",
          subject: "Riparazione caldaia",
          tipo: "intervento",
          data_intervento_prevista: "2026-10-14T07:00:00Z",
          status: "in_lavorazione",
          assigned_to: null,
          indirizzo_intervento: "Via Roma 22",
          durata_ore: 2,
          note_tecnico: "Verificare valvola",
        },
      ],
    });
    openDayDetails();
    expect(screen.getByText("Via Roma 22")).toBeTruthy();
    expect(
      within(screen.getByRole("tabpanel", { name: "Dettagli" })).getByText(
        "09:00",
      ),
    ).toBeTruthy();
    expect(screen.getByText("2 h")).toBeTruthy();
    expect(screen.getByText("Verificare valvola")).toBeTruthy();
    expect(screen.getByText("Note dell’intervento")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Apri intervento" })
        .getAttribute("href"),
    ).toBe("/azienda/assistenza/ticket");
  });
  it("la manutenzione rimanda all'impianto corretto e mostra il suo indirizzo", () => {
    page({
      orders: [],
      appointments: [],
      manutenzioni: [
        {
          id: "plan",
          titolo: "Controllo annuale",
          prossima_scadenza: "2026-10-14",
          stato: "attivo",
          impianto_id: "plant",
          impianto: "Caldaia B",
          indirizzo: "Via Torino 11",
          frequenza_tipo: "annuale",
        },
      ],
    });
    openDayDetails();
    expect(screen.getByText("Via Torino 11")).toBeTruthy();
    expect(screen.getByText("Caldaia B")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Apri impianto" }).getAttribute("href"),
    ).toBe("/azienda/manutenzione/impianto/plant");
  });
  it("gli eventi restano consultabili ma i collegamenti rispettano l'accesso ad assistenza e manutenzione", () => {
    state.viewTickets = false;
    state.viewMaintenance = false;
    page({
      orders: [],
      appointments: [],
      interventi: [
        {
          id: "ticket",
          subject: "Riparazione caldaia",
          tipo: "intervento",
          data_intervento_prevista: "2026-10-14T07:00:00Z",
          status: "in_lavorazione",
          assigned_to: null,
          indirizzo_intervento: "Via Roma 22",
        },
      ],
      manutenzioni: [
        {
          id: "plan",
          titolo: "Controllo annuale",
          prossima_scadenza: "2026-10-14",
          stato: "attivo",
          impianto_id: "plant",
          indirizzo: "Via Torino 11",
        },
      ],
    });
    openDayDetails();
    selectEvent(/Riparazione caldaia/);
    expect(screen.getByText("Via Roma 22")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Apri intervento" })).toBeNull();
    selectEvent(/Controllo annuale/);
    expect(screen.getByText("Via Torino 11")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Apri impianto" })).toBeNull();
  });
});
