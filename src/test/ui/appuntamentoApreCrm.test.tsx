import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Dall'appuntamento del calendario si apre il contatto e l'opportunità
 * collegata (24/09/2026). Ener: «viene fuori così ma non riesco ad aprire
 * l'opportunità» — il riquadro «Contesto CRM» si leggeva e basta, e mostrava
 * l'ultima opportunità del contatto invece di quella dell'appuntamento.
 */

const ENER = "629d91e0-9d56-4736-a030-1e3833cba2ea";
const TARTANI = "27b5f497-ac1b-4f18-b346-a0dd2332c2ea";
const OPP_APPUNTAMENTO = "613fd90b-a5fa-4a82-95bf-ffce89880800";
const OPP_PIU_RECENTE = "opp-aggiornata-dopo";

const oppAppuntamento = { id: OPP_APPUNTAMENTO, contact_id: TARTANI, name: "Tartani - Fotovoltaico", status: "won", value: 12000, probability: 100, next_action: null as string | null };
const oppPiuRecente = { id: OPP_PIU_RECENTE, contact_id: TARTANI, name: "Tartani - Pompa di calore", status: "open", value: 8000, probability: 40, next_action: null as string | null };

const permessi = { canViewMarketingContacts: true, canViewMarketingOpportunities: true };

const writing = vi.hoisted(() => ({ promise: null as Promise<unknown> | null, update: vi.fn(), close: vi.fn(), missing: false, google: false, googleUpdate: vi.fn(), googlePush: vi.fn(), googleDelete: vi.fn(), googleMapping: vi.fn() }));

type Risposta = { data: unknown; error: { message: string } | null };

function builder(tabella: string) {
  const filtri: Record<string, unknown> = {};
  let mutation = false;
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "is", "gte", "lte", "order", "limit", "or", "not"]) {
    b[m] = (...args: unknown[]) => {
      if (m === "eq") filtri[String(args[0])] = args[1];
      return b;
    };
  }
  b.update = (payload: unknown) => { mutation = true; writing.update(payload); return b; };
  const risposta = (): Risposta => {
    if (tabella === "marketing_contacts") {
      // Solo per id: nella ricerca non c'è, come un contatto oltre il millesimo cognome (TARTANI in Ener è il 1.740°).
      if (filtri.id === TARTANI) return { data: { id: TARTANI, first_name: "Mauro", last_name: "Tartani", phone: "+39 333 000 1111", email: null as string | null, source: "facebook" }, error: null };
      return { data: [], error: null };
    }
    if (tabella === "marketing_opportunities") {
      if (filtri.id === OPP_APPUNTAMENTO) return { data: oppAppuntamento, error: null };
      return { data: [oppPiuRecente, oppAppuntamento], error: null };
    }
    return { data: [], error: null };
  };
  b.maybeSingle = async () => risposta();
  b.single = async () => mutation && tabella === "appointments"
    ? writing.promise ?? { data: writing.missing ? null : { id: "appointment-id" }, error: null }
    : risposta();
  b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => (mutation && writing.promise ? writing.promise : Promise.resolve(risposta())).then(ok, ko);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: async (): Promise<Risposta> => ({ data: null, error: null }),
    functions: { invoke: async (): Promise<Risposta> => ({ data: null, error: null }) },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: ENER } }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ solaLettura: false, onlyAssigned: false, ...permessi }),
}));
vi.mock("@/hooks/useGoogleCalendarSync", () => ({ useGoogleCalendarSync: () => ({ hasAnyCompanyGoogleConnection: writing.google, updateEvent: writing.googleUpdate, pushEvent: writing.googlePush, deleteEvent: writing.googleDelete, checkMapping: writing.googleMapping }) }));
vi.mock("@/hooks/useAppleCalendarSync", () => ({ useAppleCalendarSync: () => ({ isConnected: false, syncAppointment: async () => {} }) }));
vi.mock("@/components/shared/AddressAutocomplete", () => ({
  default: (): null => null,
  emptyAddress: { address_line: "", address_city: "", address_postal_code: "", address_province: "", address_country: "IT", address_notes: "", formatted_address: "", lat: null as number | null, lng: null as number | null, place_id: "" },
}));
vi.mock("@/components/shared/AddressMapPreview", () => ({ default: (): null => null }));
vi.mock("@/components/marketing/CalendarSuggestions", () => ({ default: (): null => null }));
// Il test riguarda i dati salvati. Select nativo evita i due FocusScope
// di Radix (dialog + menu) che in jsdom si contendono il focus.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Empty = (): null => null;
  const Trigger = (): null => null;
  const Item = (): null => null;
  return {
    Select: ({ value, onValueChange, children, disabled }: any) => {
      const nodes = React.Children.toArray(children) as any[];
      const trigger = nodes.find(node => node.type === Trigger);
      const options: any[] = [];
      const collect = (children: any) => React.Children.forEach(children, child => {
        if (!React.isValidElement<any>(child)) return;
        if (child.type === Item) options.push(child.props);
        else collect(child.props.children);
      });
      collect(children);
      return <select {...trigger?.props} disabled={disabled} value={value} onChange={e => onValueChange(e.target.value)}>
        <option value="" />{options.map(option => <option key={option.value} value={option.value}>{option.children}</option>)}
      </select>;
    }, SelectTrigger: Trigger, SelectItem: Item, SelectContent: Empty, SelectValue: Empty,
  };
});

// Radix (Select, Popover) in jsdom
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

import MarketingAppointmentDialog, { type MarketingAppointmentData } from "@/components/marketing/MarketingAppointmentDialog";

const appuntamento: MarketingAppointmentData = {
  id: "9c1c7359-0118-4813-a53e-6a1eeacddc9f",
  title: "TARTANI MAURO - APP TELEFONICO",
  description: null,
  appointment_date: "2026-09-22",
  appointment_time: "14:30:00",
  appointment_end_time: "15:00:00",
  appointment_type: "generico",
  assigned_to: null,
  calendar_id: "cal-1",
  contact_id: TARTANI,
  opportunity_id: OPP_APPUNTAMENTO,
  status: "confermato",
  is_completed: false,
};

function apri(contestoScheda?: "contatto" | "opportunita", dati = appuntamento) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/azienda/marketing/calendario"]}>
      <QueryClientProvider client={client}>
        <MarketingAppointmentDialog
          open
          onOpenChange={writing.close}
          appointment={dati}
          onSaved={() => {}}
          calendars={[{ id: "cal-1", name: "Agenda commerciale", owner_id: "u1" }, { id: "cal-2", name: "Agenda collega", owner_id: "u2" }]}
          users={[{ id: "u1", first_name: "Primo", last_name: "Commerciale" }, { id: "u2", first_name: "Secondo", last_name: "Commerciale" }]}
          contestoScheda={contestoScheda}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  writing.promise = null; writing.missing = false; writing.update.mockClear(); writing.close.mockClear();
  writing.google = false; writing.googleUpdate.mockReset(); writing.googlePush.mockReset(); writing.googleDelete.mockReset(); writing.googleMapping.mockReset();
  permessi.canViewMarketingContacts = true;
  permessi.canViewMarketingOpportunities = true;
});
afterEach(cleanup);

const TIMEOUT = 30_000;

describe("appuntamento: aprire contatto e opportunità collegati", () => {
  it("manda la nota al server Google anche quando la mappa del collega non è leggibile", async () => {
    writing.google = true;
    apri();
    fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "Nota al collega" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(writing.close).toHaveBeenCalledWith(false));
    expect(writing.googleUpdate).toHaveBeenCalledWith(appuntamento.id);
    expect(writing.googleMapping).not.toHaveBeenCalled(); expect(writing.googlePush).not.toHaveBeenCalled();
  });
  it("conserva Google quando l'annullamento CRM non viene salvato", async () => {
    writing.google = true; writing.missing = true;
    apri();
    fireEvent.click(screen.getAllByRole("button", { name: "Annulla" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Annulla l'appuntamento" }));
    await waitFor(() => expect(writing.update).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeEnabled());
    expect(writing.googleDelete).not.toHaveBeenCalled(); expect(writing.close).not.toHaveBeenCalled();
  });
  it("annulla prima nel CRM e solo dopo rimuove l'evento Google", async () => {
    writing.google = true;
    let finish!: (value: unknown) => void;
    writing.promise = new Promise(resolve => { finish = resolve; });
    apri();
    fireEvent.click(screen.getAllByRole("button", { name: "Annulla" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Annulla l'appuntamento" }));
    await waitFor(() => expect(writing.update).toHaveBeenCalledTimes(1));
    expect(writing.googleDelete).not.toHaveBeenCalled();
    finish({ data: { id: appuntamento.id }, error: null });
    await waitFor(() => expect(writing.close).toHaveBeenCalledWith(false));
    expect(writing.googleDelete).toHaveBeenCalledWith(appuntamento.id);
  });
  it("trasferisce calendario e responsabile conservando il record", async () => {
    apri(undefined, { ...appuntamento, assigned_to: "u1" });
    fireEvent.change(screen.getByRole("combobox", { name: "Calendario *" }), { target: { value: "cal-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(writing.close).toHaveBeenCalledWith(false));
    expect(writing.update).toHaveBeenCalledWith({ calendar_id: "cal-2", assigned_to: "u2" });
  });

  it("scegliere un altro responsabile propone il suo calendario univoco", async () => {
    apri(undefined, { ...appuntamento, assigned_to: "u1" });
    fireEvent.change(screen.getByRole("combobox", { name: "Venditore assegnato" }), { target: { value: "u2" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(writing.close).toHaveBeenCalledWith(false));
    expect(writing.update).toHaveBeenCalledWith({ calendar_id: "cal-2", assigned_to: "u2" });
  });

  it("non chiude e non dichiara salvato se il database non restituisce il record", async () => {
    writing.missing = true;
    apri();
    fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "Nota da conservare" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(writing.update).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeEnabled());
    expect(writing.close).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Descrizione")).toHaveValue("Nota da conservare");
  });

  it("modificare una nota conserva tipo, calendario, responsabile, stato e commessa", async () => {
    apri(undefined, { ...appuntamento, appointment_type: "sopralluogo", assigned_to: "u2" });
    fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "Nuova nota del cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(writing.update).toHaveBeenCalledTimes(1));
    expect(writing.update.mock.calls[0][0]).toEqual({ description: "Nuova nota del cliente" });
    await waitFor(() => expect(writing.close).toHaveBeenCalledWith(false));
  });

  it("blocca campi, chiusura e doppio salvataggio fino al termine della richiesta", async () => {
    let finish!: (value: unknown) => void;
    writing.promise = new Promise(resolve => { finish = resolve; });
    apri();
    await screen.findByRole("link", { name: /Apri contatto/ });
    fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "Nota aggiornata" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(writing.update).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Titolo dell'appuntamento *")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Calendario *" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(writing.close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salvataggio..." }));
    expect(writing.update).toHaveBeenCalledTimes(1);
    finish({ data: { id: "appointment-id" }, error: null });
    await waitFor(() => expect(writing.close).toHaveBeenCalledWith(false));
  });

  it("apre l'opportunità DELL'APPUNTAMENTO, non l'ultima aggiornata del contatto", async () => {
    apri();
    const opp = await screen.findByRole("link", { name: /Apri opportunità/ }, { timeout: TIMEOUT });
    expect(opp.getAttribute("href")).toBe(`/azienda/marketing/opportunita?apri=${OPP_APPUNTAMENTO}`);
    expect(screen.getByText("Tartani - Fotovoltaico")).toBeTruthy();
    expect(screen.queryByText("Tartani - Pompa di calore")).toBeNull();

    const contatto = screen.getByRole("link", { name: /Apri contatto/ });
    expect(contatto.getAttribute("href")).toBe(`/azienda/marketing/contatti/${TARTANI}`);
  }, TIMEOUT);

  it("dentro la scheda dell'opportunità non propone di riaprirla", async () => {
    apri("opportunita");
    await screen.findByRole("link", { name: /Apri contatto/ }, { timeout: TIMEOUT });
    expect(screen.queryByRole("link", { name: /Apri opportunità/ })).toBeNull();
  }, TIMEOUT);

  it("dentro la scheda del contatto non propone di riaprirlo", async () => {
    apri("contatto");
    await screen.findByRole("link", { name: /Apri opportunità/ }, { timeout: TIMEOUT });
    expect(screen.queryByRole("link", { name: /Apri contatto/ })).toBeNull();
  }, TIMEOUT);

  it("senza il permesso di vedere le opportunità il link non c'è", async () => {
    permessi.canViewMarketingOpportunities = false;
    apri();
    await screen.findByRole("link", { name: /Apri contatto/ }, { timeout: TIMEOUT });
    expect(screen.getByText("Tartani - Fotovoltaico")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Apri opportunità/ })).toBeNull();
  }, TIMEOUT);
});
