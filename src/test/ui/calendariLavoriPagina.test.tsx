// src/test/ui/calendariLavoriPagina.test.tsx
// Impostazioni → Calendari lavori (squadre di posa): due schede invece di tre, il rimando vero verso l'account Google, i
// vecchi indirizzi che continuano ad aprire la scheda giusta, la sola lettura dichiarata.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const squadra = {
  id: "q1",
  name: "Squadra Rossi",
  kind: "esterna",
  is_active: true,
  color: "#ef4444",
  subappaltatore_id: null as string | null,
  google_connection_id: null as string | null,
  google_calendar_id: null as string | null,
  google_sync_enabled: false,
  google_last_error: null as string | null,
};

const state = vi.hoisted(() => ({
  role: "company_admin",
  modifica: false,
  caricamentoPermessi: false,
  accountCollegati: false,
  squadre: [] as unknown[],
  squadreOperai: [] as Array<{ id: string; componenti: object[]; responsabile: { nome: string; cognome: string } | null }>,
  schede: ["operai", "subappaltatori", "mezzi"] as Array<
    "operai" | "subappaltatori" | "mezzi"
  >,
  calendario: true,
  commesse: true,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ role: state.role, effectiveCompany: { id: "azienda-1" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isLoading: state.caricamentoPermessi,
    canEditSettingsOrders: state.modifica,
    canViewCalendar: state.calendario,
    canViewOrders: state.commesse,
  }),
}));
vi.mock("@/hooks/useOperai", () => ({ useSquadre: () => ({ data: state.squadreOperai, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock("@/hooks/useSchedeManodopera", () => ({
  useSchedeManodopera: () => ({
    schede: state.schede,
    inCaricamento: state.caricamentoPermessi,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: [] as unknown[],
            error: null as unknown,
          }),
        }),
      }),
    }),
  },
}));
vi.mock("@/hooks/useCalendariLavori", () => ({
  useSquadre: () => ({
    data: state.squadre,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSubappaltatoriAzienda: () => ({ data: [] as unknown[] }),
  useSalvaSquadra: () => ({ mutate: vi.fn(), isPending: false }),
  useEliminaSquadra: () => ({ mutate: vi.fn(), isPending: false }),
  useCollegaCalendarioSquadra: () => ({ mutate: vi.fn(), isPending: false }),
  useCalendarLinks: () => ({
    data: [] as unknown[],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSalvaCalendarLink: () => ({ mutate: vi.fn(), isPending: false }),
  useConnessioniGoogleAzienda: () => ({
    data: state.accountCollegati
      ? [
          {
            id: "a1",
            status: "connected",
            google_account_email: "azienda@example.it",
          },
        ]
      : [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCalendariDiConnessione: () => ({
    data: [] as unknown[],
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/employees/ExternalTeamDialog", () => ({
  ExternalTeamDialog: (): null => null,
}));
vi.mock("@/components/employees/ExternalTeamAttachments", () => ({
  ExternalTeamAttachments: (): null => null,
}));
vi.mock("@/components/employees/InternalTeamRosterDialog", () => ({
  InternalTeamRosterDialog: (): null => null,
}));
vi.mock("@/components/settings/GoogleCalendarConnectionTab", () => ({
  default: () => <div>collegamento Google</div>,
}));
vi.mock("@/components/integrations/CompanyCalendarsOverview", () => ({
  CalendariDelTeam: () => <div>elenco del team</div>,
}));

import CalendariLavoriConfig from "@/components/settings/calendari-lavori/CalendariLavoriConfig";
import { GoogleCalendarPicker } from "@/components/settings/calendari-lavori/GoogleCalendarPicker";

const apri = (percorso = "/azienda/impostazioni/calendari-lavori") =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[percorso]}>
        <CalendariLavoriConfig />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    role: "company_admin",
    modifica: false,
    caricamentoPermessi: false,
    accountCollegati: false,
    squadre: [squadra],
  });
  state.squadreOperai = [];
  state.schede = ["operai", "subappaltatori", "mezzi"];
  state.calendario = true;
  state.commesse = true;
});
afterEach(cleanup);

describe("Calendari lavori: due schede", () => {
  it("«Squadre» e «Google Calendar», non più tre; si apre sulle squadre", () => {
    apri();
    expect(
      screen.getAllByRole("tab").map((t) => t.textContent?.trim()),
    ).toEqual(["Squadre", "Google Calendar"]);
    expect(screen.getByRole("tab", { name: "Squadre" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Squadra Rossi")).toBeInTheDocument();
  });

  it.each(["google", "standard", "collegamenti"])(
    "l'indirizzo ?tab=%s apre «Google Calendar»",
    (scheda) => {
      apri(`/azienda/impostazioni/calendari-lavori?tab=${scheda}`);
      expect(
        screen.getByRole("tab", { name: "Google Calendar" }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
      ).toEqual([
        "Account Google",
        "Calendario di tutte le pose",
        "Calendari collegati dal team",
        "Dalle risorse al calendario",
      ]);
      expect(screen.getByText("collegamento Google")).toBeInTheDocument();
    },
  );

  it.each(["squadre", "una-scheda-che-non-esiste", ""])(
    "l'indirizzo ?tab=%s apre le squadre",
    (scheda) => {
      apri(`/azienda/impostazioni/calendari-lavori?tab=${scheda}`);
      expect(screen.getByRole("tab", { name: "Squadre" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    },
  );

  it("la scheda «Google Calendar» dice di collegare l'account con il titolare e ha il calendario di tutte le pose", () => {
    apri("/azienda/impostazioni/calendari-lavori?tab=google");
    expect(screen.getByText(/va collegato con l'utente/)).toHaveTextContent(
      "titolare",
    );
    const pose = screen.getByRole("region", {
      name: "Calendario di tutte le pose",
    });
    expect(
      within(pose).getByText(
        "Tutte le pose dell'azienda, di qualunque squadra.",
      ),
    ).toBeInTheDocument();
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
    expect(nota).toHaveTextContent(
      "Nessun account Google collegato: se vuoi un calendario per ogni squadra, collegalo da «Google Calendar».",
    );
    expect(
      within(nota).getByRole("link", {
        name: "collegalo da «Google Calendar»",
      }),
    ).toHaveAttribute(
      "href",
      "/azienda/impostazioni/calendari-lavori?tab=google",
    );
    // non in ogni riga
    expect(
      screen.queryAllByText(/Nessun account Google collegato/),
    ).toHaveLength(1);
  });

  it("il link porta alla scheda «Google Calendar»", () => {
    apri();
    fireEvent.click(
      screen.getByRole("link", { name: "collegalo da «Google Calendar»" }),
    );
    expect(
      screen.getByRole("tab", { name: "Google Calendar" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("heading", { level: 2, name: "Account Google" }),
    ).toBeInTheDocument();
  });

  it("con un account collegato la nota non c'è e ogni squadra ha i suoi menu", () => {
    state.accountCollegati = true;
    apri();
    expect(screen.queryByRole("note")).toBeNull();
    expect(
      screen.getAllByRole("combobox", { name: "Account Google" }).length,
    ).toBeGreaterThan(0);
  });

  it("nella scheda «Google Calendar», senza account, il calendario di tutte le pose rimanda alla sezione qui sopra (non a se stessa)", () => {
    apri("/azienda/impostazioni/calendari-lavori?tab=google");
    const pose = screen.getByRole("region", {
      name: "Calendario di tutte le pose",
    });
    expect(
      within(pose).getByText(
        "Nessun account Google collegato: collegalo nella sezione «Account Google», qui sopra.",
      ),
    ).toBeInTheDocument();
    expect(within(pose).queryByRole("link")).toBeNull();
  });

  it("il selettore da solo, dentro l'app, rimanda con un link; fuori da un Router resta una frase", () => {
    const { unmount } = render(
      <MemoryRouter>
        <GoogleCalendarPicker
          value={{ google_connection_id: null, google_calendar_id: null }}
          onChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: "Collegalo da «Google Calendar»" }),
    ).toHaveAttribute("href", "/?tab=google");
    unmount();
    render(
      <GoogleCalendarPicker
        value={{ google_connection_id: null, google_calendar_id: null }}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Collegalo da «Google Calendar»\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("Calendari lavori: parole", () => {
  it("le intestazioni distinguono l'accesso della ditta dall'invio a Google", () => {
    apri();
    const intestazioni = screen
      .getAllByRole("columnheader", { hidden: true })
      .map((th) => th.textContent?.trim());
    expect(intestazioni).toContain("Accesso della ditta");
    expect(intestazioni).toContain("Invio a Google");
    expect(intestazioni).not.toContain("Sync");
    expect(intestazioni).not.toContain("Accesso");
  });

  it("l'interruttore dell'invio ha il nome della squadra", () => {
    state.accountCollegati = true;
    state.squadre = [
      {
        ...squadra,
        google_connection_id: "a1",
        google_calendar_id: "g1",
        google_sync_enabled: true,
      },
    ];
    apri();
    expect(
      screen.getByRole("switch", {
        name: "Invia a Google Calendar: Squadra Rossi",
      }),
    ).toBeChecked();
  });
});

describe("Calendari lavori: sola lettura onesta", () => {
  it("chi non modifica trova la frase e i comandi spenti", () => {
    state.role = "staff";
    apri();
    expect(
      screen.getByText(
        /Stai consultando queste impostazioni: le cambia chi ha «Configurazione Ordini» in modifica\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Nuova squadra/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Modifica Squadra Rossi" }),
    ).toBeDisabled();
  });

  it("chi non è amministratore ma ha «Configurazione Ordini» in modifica può gestire le squadre", () => {
    state.role = "staff";
    state.modifica = true;
    apri();
    expect(
      screen.queryByText(/Stai consultando queste impostazioni/),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /Nuova squadra/ })).toBeEnabled();
  });

  it("chi modifica non vede la frase; mentre i permessi si caricano nemmeno", () => {
    apri();
    expect(
      screen.queryByText(/Stai consultando queste impostazioni/),
    ).toBeNull();
    cleanup();
    state.role = "staff";
    state.caricamentoPermessi = true;
    apri();
    expect(
      screen.queryByText(/Stai consultando queste impostazioni/),
    ).toBeNull();
  });
});

describe("Calendari e gestione principale delle risorse", () => {
  const interna = {
    ...squadra,
    id: "interna-2",
    name: "Squadra Nord",
    kind: "interna",
  };
  it("rimanda alle vere viste di operai, ditte e mezzi", () => {
    apri();
    const nav = screen.getByRole("navigation", { name: "Gestisci le risorse" });
    expect(
      within(nav).getByRole("link", { name: /Operai e squadre interne/ }),
    ).toHaveAttribute("href", "/azienda/manodopera?tab=operai&vista=squadre");
    expect(
      within(nav).getByRole("link", { name: /Ditte e accessi cantiere/ }),
    ).toHaveAttribute("href", "/azienda/manodopera?tab=subappaltatori");
    expect(
      within(nav).getByRole("link", { name: /Mezzi e attrezzature/ }),
    ).toHaveAttribute("href", "/azienda/manodopera?tab=mezzi");
  });
  it("la composizione apre la stessa squadra nella gestione operai", () => {
    state.squadre = [interna];
    apri();
    expect(
      screen.getByRole("link", { name: "Componenti e responsabile" }),
    ).toHaveAttribute(
      "href",
      "/azienda/manodopera?tab=operai&vista=squadre&squadra=interna-2",
    );
    expect(
      screen.queryByRole("button", { name: "Dipendenti della squadra" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Elimina Squadra Nord" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Modifica Squadra Nord" }),
    ).toBeEnabled();
  });
  it("rispetta le schede consentite dal piano e dai permessi", () => {
    state.schede = ["mezzi"];
    state.squadre = [interna];
    apri();
    expect(
      screen.queryByRole("link", { name: /Operai e squadre interne/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Componenti e responsabile" }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: /Mezzi e attrezzature/ }),
    ).toBeInTheDocument();
  });
  it("filtra per tipo e per referente, senza cambiare i dati", () => {
    state.squadre = [squadra, { ...interna, contact_name: "Mario" }];
    apri();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Tipo di squadra" }),
      { target: { value: "interna" } },
    );
    expect(screen.queryByText("Squadra Rossi")).toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca squadre e referenti" }),
      { target: { value: "mario" } },
    );
    expect(screen.getByText("Squadra Nord")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca squadre e referenti" }),
      { target: { value: "inesistente" } },
    );
    expect(
      screen.getByText("Nessuna squadra corrisponde ai filtri."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Azzera i filtri" }));
    expect(screen.getByText("Squadra Rossi")).toBeInTheDocument();
  });
  it("il rimando dal principale seleziona una squadra e mantiene il contesto passando a Google", () => {
    state.squadre = [squadra, interna];
    apri(
      "/azienda/impostazioni/calendari-lavori?tab=squadre&squadra=interna-2",
    );
    expect(screen.queryByText("Squadra Rossi")).toBeNull();
    const link = screen.getByRole("link", {
      name: "collegalo da «Google Calendar»",
    });
    expect(link).toHaveAttribute(
      "href",
      "/azienda/impostazioni/calendari-lavori?tab=google&squadra=interna-2",
    );
    fireEvent.click(link);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Squadre" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText("Calendario di Squadra Nord.")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Mostra tutte le squadre" }),
    );
    expect(screen.getByText("Squadra Rossi")).toBeInTheDocument();
  });
});

describe("Risorse: limiti e permessi dichiarati", () => {
  it("spiega il collegamento reale e il limite delle assegnazioni operative verso Google", () => {
    apri();
    const dettagli = screen
      .getByText("Come si collegano squadre, mezzi e Google")
      .closest("details")!;
    expect(dettagli.open).toBe(false);
    fireEvent.click(
      screen.getByText("Come si collegano squadre, mezzi e Google"),
    );
    expect(dettagli.open).toBe(true);
    const ambito = screen.getByText(/Ambito dell’invio a Google/).closest("p")!;
    expect(ambito).toHaveTextContent("non vengono inviate automaticamente a Google");
    expect(ambito.closest("details")).toBeNull();
    expect(dettagli).toHaveTextContent(
      "Il collegamento Google non prenota né assegna mezzi",
    );
  });
  it("non propone calendario e commesse quando mancano i permessi di consultazione", () => {
    state.calendario = false;
    state.commesse = false;
    apri();
    expect(
      screen.queryByRole("link", { name: "Apri calendario lavori" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Apri le commesse" })).toBeNull();
  });
});


describe("Squadre collegate alla gestione operai", () => {
  it("mostra componenti e responsabile della stessa squadra, letti dalla gestione operai", () => {
    state.squadre = [{ ...squadra, id: "interna-1", kind: "interna", name: "Squadra interna" }];
    state.squadreOperai = [{ id: "interna-1", componenti: [{}, {}], responsabile: { nome: "Ada", cognome: "Rossi" } }];
    apri();
    expect(screen.getByText("2 operai · Responsabile: Ada Rossi")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Componenti e responsabile" })).toHaveAttribute("href", "/azienda/manodopera?tab=operai&vista=squadre&squadra=interna-1");
  });
  it("i riepiloghi filtrano il catalogo senza creare squadre duplicate", () => {
    state.squadre = [{ ...squadra }, { ...squadra, id: "interna-1", kind: "interna", name: "Squadra interna" }];
    apri();
    fireEvent.click(within(screen.getByRole("group", { name: "Riepilogo squadre" })).getByRole("button", { name: /Interne/ }));
    expect(screen.getByText("Squadra interna")).toBeInTheDocument();
    expect(screen.queryByText("Squadra Rossi")).toBeNull();
  });
  it("un rimando a una squadra precisa la mostra; scegliere un altro tipo rimuove il rimando e applica il filtro", () => {
    state.squadre = [{ ...squadra }, { ...squadra, id: "interna-1", kind: "interna", name: "Squadra interna" }];
    apri("/azienda/impostazioni/calendari-lavori?tab=squadre&squadra=interna-1");
    expect(screen.getByText("Squadra interna")).toBeInTheDocument();
    expect(screen.queryByText("Squadra Rossi")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo di squadra" }), { target: { value: "esterna" } });
    expect(screen.getByText("Squadra Rossi")).toBeInTheDocument();
    expect(screen.queryByText("Squadra interna")).toBeNull();
  });
});
