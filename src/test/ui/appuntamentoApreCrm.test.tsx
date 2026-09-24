import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

type Risposta = { data: unknown; error: { message: string } | null };

function builder(tabella: string) {
  const filtri: Record<string, unknown> = {};
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "is", "gte", "lte", "order", "limit", "or", "not"]) {
    b[m] = (...args: unknown[]) => {
      if (m === "eq") filtri[String(args[0])] = args[1];
      return b;
    };
  }
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
  b.single = async () => risposta();
  b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(risposta()).then(ok, ko);
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
vi.mock("@/hooks/useGoogleCalendarSync", () => ({ useGoogleCalendarSync: () => ({ isConnected: false, syncAppointment: async () => {} }) }));
vi.mock("@/hooks/useAppleCalendarSync", () => ({ useAppleCalendarSync: () => ({ isConnected: false, syncAppointment: async () => {} }) }));
vi.mock("@/components/shared/AddressAutocomplete", () => ({
  default: (): null => null,
  emptyAddress: { address_line: "", address_city: "", address_postal_code: "", address_province: "", address_country: "IT", address_notes: "", formatted_address: "", lat: null as number | null, lng: null as number | null, place_id: "" },
}));
vi.mock("@/components/shared/AddressMapPreview", () => ({ default: (): null => null }));
vi.mock("@/components/marketing/CalendarSuggestions", () => ({ default: (): null => null }));

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

function apri(contestoScheda?: "contatto" | "opportunita") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/azienda/marketing/calendario"]}>
      <QueryClientProvider client={client}>
        <MarketingAppointmentDialog
          open
          onOpenChange={() => {}}
          appointment={appuntamento}
          onSaved={() => {}}
          calendars={[{ id: "cal-1", name: "Agenda commerciale" }]}
          users={[]}
          contestoScheda={contestoScheda}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  permessi.canViewMarketingContacts = true;
  permessi.canViewMarketingOpportunities = true;
});
afterEach(cleanup);

const TIMEOUT = 30_000;

describe("appuntamento: aprire contatto e opportunità collegati", () => {
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
