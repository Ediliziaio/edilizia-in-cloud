// src/test/ui/calendariLavoriPagina.test.tsx
// Impostazioni → Calendari lavori (squadre di posa): due schede invece di tre, il rimando vero verso l'account Google, i
// vecchi indirizzi che continuano ad aprire la scheda giusta, la sola lettura dichiarata.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const squadra = {
  id: "q1", name: "Squadra Rossi", kind: "esterna", is_active: true, color: "#ef4444", subappaltatore_id: null as string | null,
  google_connection_id: null as string | null, google_calendar_id: null as string | null, google_sync_enabled: false, google_last_error: null as string | null,
};

const state = vi.hoisted(() => ({
  role: "company_admin", modifica: false, caricamentoPermessi: false,
  accountCollegati: false, squadre: [] as unknown[],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.role, effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: state.caricamentoPermessi, canEditSettingsOrders: state.modifica }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [] as unknown[], error: null as unknown }) }) }) }) },
}));
vi.mock("@/hooks/useCalendariLavori", () => ({
  useSquadre: () => ({ data: state.squadre, isLoading: false, isError: false, refetch: vi.fn() }),
  useSubappaltatoriAzienda: () => ({ data: [] as unknown[] }),
  useSalvaSquadra: () => ({ mutate: vi.fn(), isPending: false }),
  useEliminaSquadra: () => ({ mutate: vi.fn(), isPending: false }),
  useCollegaCalendarioSquadra: () => ({ mutate: vi.fn(), isPending: false }),
  useCalendarLinks: () => ({ data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() }),
  useSalvaCalendarLink: () => ({ mutate: vi.fn(), isPending: false }),
  useConnessioniGoogleAzienda: () => ({
    data: state.accountCollegati ? [{ id: "a1", status: "connected", google_account_email: "azienda@example.it" }] : [],
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useCalendariDiConnessione: () => ({ data: [] as unknown[], isLoading: false, error: null as unknown, refetch: vi.fn() }),
}));
vi.mock("@/components/employees/ExternalTeamDialog", () => ({ ExternalTeamDialog: (): null => null }));
vi.mock("@/components/employees/ExternalTeamAttachments", () => ({ ExternalTeamAttachments: (): null => null }));
vi.mock("@/components/employees/InternalTeamRosterDialog", () => ({ InternalTeamRosterDialog: (): null => null }));
vi.mock("@/components/settings/GoogleCalendarConnectionTab", () => ({ default: () => <div>collegamento Google</div> }));
vi.mock("@/components/integrations/CompanyCalendarsOverview", () => ({ CalendariDelTeam: () => <div>elenco del team</div> }));

import CalendariLavoriConfig from "@/components/settings/calendari-lavori/CalendariLavoriConfig";
import { GoogleCalendarPicker } from "@/components/settings/calendari-lavori/GoogleCalendarPicker";

const apri = (percorso = "/azienda/impostazioni/calendari-lavori") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[percorso]}>
        <CalendariLavoriConfig />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { role: "company_admin", modifica: false, caricamentoPermessi: false, accountCollegati: false, squadre: [squadra] });
});
afterEach(cleanup);

describe("Calendari lavori: due schede", () => {
  it("«Squadre» e «Google Calendar», non più tre; si apre sulle squadre", () => {
    apri();
    expect(screen.getAllByRole("tab").map((t) => t.textContent?.trim())).toEqual(["Squadre", "Google Calendar"]);
    expect(screen.getByRole("tab", { name: "Squadre" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Squadra Rossi")).toBeInTheDocument();
  });

  it.each(["google", "standard", "collegamenti"])("l'indirizzo ?tab=%s apre «Google Calendar»", (scheda) => {
    apri(`/azienda/impostazioni/calendari-lavori?tab=${scheda}`);
    expect(screen.getByRole("tab", { name: "Google Calendar" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Account Google",
      "Calendario di tutte le pose",
      "Calendari collegati dal team",
    ]);
    expect(screen.getByText("collegamento Google")).toBeInTheDocument();
  });

  it.each(["squadre", "una-scheda-che-non-esiste", ""])("l'indirizzo ?tab=%s apre le squadre", (scheda) => {
    apri(`/azienda/impostazioni/calendari-lavori?tab=${scheda}`);
    expect(screen.getByRole("tab", { name: "Squadre" })).toHaveAttribute("aria-selected", "true");
  });

  it("la scheda «Google Calendar» dice di collegare l'account con il titolare e ha il calendario di tutte le pose", () => {
    apri("/azienda/impostazioni/calendari-lavori?tab=google");
    expect(screen.getByText(/va collegato con l'utente/)).toHaveTextContent("titolare");
    const pose = screen.getByRole("region", { name: "Calendario di tutte le pose" });
    expect(within(pose).getByText("Tutte le pose dell'azienda, di qualunque squadra.")).toBeInTheDocument();
  });

  it("nessun titolo di primo livello", () => {
    apri();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
  });
});

describe("Calendari lavori: il passo che serve è un link", () => {
  it("senza account Google lo dice una volta sopra la tabella, con il link alla scheda giusta", () => {
    apri();
    const nota = screen.getByRole("note");
    expect(nota).toHaveTextContent("Nessun account Google collegato: se vuoi un calendario per ogni squadra, collegalo da «Google Calendar».");
    expect(within(nota).getByRole("link", { name: "collegalo da «Google Calendar»" })).toHaveAttribute("href", "/azienda/impostazioni/calendari-lavori?tab=google");
    // non in ogni riga
    expect(screen.queryAllByText(/Nessun account Google collegato/)).toHaveLength(1);
  });

  it("il link porta alla scheda «Google Calendar»", () => {
    apri();
    fireEvent.click(screen.getByRole("link", { name: "collegalo da «Google Calendar»" }));
    expect(screen.getByRole("tab", { name: "Google Calendar" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 2, name: "Account Google" })).toBeInTheDocument();
  });

  it("con un account collegato la nota non c'è e ogni squadra ha i suoi menu", () => {
    state.accountCollegati = true;
    apri();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getAllByRole("combobox", { name: "Account Google" }).length).toBeGreaterThan(0);
  });

  it("nella scheda «Google Calendar», senza account, il calendario di tutte le pose rimanda alla sezione qui sopra (non a se stessa)", () => {
    apri("/azienda/impostazioni/calendari-lavori?tab=google");
    const pose = screen.getByRole("region", { name: "Calendario di tutte le pose" });
    expect(within(pose).getByText("Nessun account Google collegato: collegalo nella sezione «Account Google», qui sopra.")).toBeInTheDocument();
    expect(within(pose).queryByRole("link")).toBeNull();
  });

  it("il selettore da solo, dentro l'app, rimanda con un link; fuori da un Router resta una frase", () => {
    const { unmount } = render(
      <MemoryRouter>
        <GoogleCalendarPicker value={{ google_connection_id: null, google_calendar_id: null }} onChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Collegalo da «Google Calendar»" })).toHaveAttribute("href", "/?tab=google");
    unmount();
    render(<GoogleCalendarPicker value={{ google_connection_id: null, google_calendar_id: null }} onChange={vi.fn()} />);
    expect(screen.getByText(/Collegalo da «Google Calendar»\./)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("Calendari lavori: parole", () => {
  it("le intestazioni dicono «Accesso della ditta» e «Google», non «Accesso» e «Sync»", () => {
    apri();
    const intestazioni = screen.getAllByRole("columnheader", { hidden: true }).map((th) => th.textContent?.trim());
    expect(intestazioni).toContain("Accesso della ditta");
    expect(intestazioni).toContain("Google");
    expect(intestazioni).not.toContain("Sync");
    expect(intestazioni).not.toContain("Accesso");
  });

  it("l'interruttore dell'invio ha il nome della squadra", () => {
    state.accountCollegati = true;
    state.squadre = [{ ...squadra, google_connection_id: "a1", google_calendar_id: "g1", google_sync_enabled: true }];
    apri();
    expect(screen.getByRole("switch", { name: "Invia a Google Calendar: Squadra Rossi" })).toBeChecked();
  });
});

describe("Calendari lavori: sola lettura onesta", () => {
  it("chi non modifica trova la frase e i comandi spenti", () => {
    state.role = "staff";
    apri();
    expect(screen.getByText(/Stai consultando queste impostazioni: le cambia chi ha «Configurazione Ordini» in modifica\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nuova squadra/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Modifica Squadra Rossi" })).toBeDisabled();
  });

  it("chi modifica non vede la frase; mentre i permessi si caricano nemmeno", () => {
    apri();
    expect(screen.queryByText(/Stai consultando queste impostazioni/)).toBeNull();
    cleanup();
    state.role = "staff"; state.caricamentoPermessi = true;
    apri();
    expect(screen.queryByText(/Stai consultando queste impostazioni/)).toBeNull();
  });
});
