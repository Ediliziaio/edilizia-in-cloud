/**
 * Manodopera e servizi → Manutenzione (10/10/2026).
 *
 * «Manutenzione» stava dentro una seconda fila di schede: Listino → [Manodopera e Servizi | Manutenzione] →
 * [Tipi Impianto | Tipi Intervento | Tariffe]. Ora una fila sola: Manodopera e servizi | Impianti | Interventi | Prezzi di
 * manutenzione. La pagina e l'indirizzo sono gli stessi (`…/tariffe`); `?tab=manutenzione`, l'indirizzo di prima (voce
 * «Listino Manutenzione» della ricerca, vecchia pagina `listino-manutenzione`), apre gli impianti.
 *
 * Chi può scrivere (lo dicono le policy del database): i prezzi, l'amministratore e chi ha «Listino & Prezzi» in modifica;
 * i tipi di impianto e di intervento, solo l'amministratore. Gli altri vedono l'elenco senza pulsanti, con una frase.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import SettingsTariffe from "@/pages/azienda/settings/SettingsTariffe";
import { ImpiantoDialog } from "@/pages/azienda/settings/ListinoManutenzione/dialogs/ImpiantoDialog";
import { InterventoDialog } from "@/pages/azienda/settings/ListinoManutenzione/dialogs/InterventoDialog";
import { ListinoDialog } from "@/pages/azienda/settings/ListinoManutenzione/dialogs/ListinoDialog";
import { useListinoData } from "@/pages/azienda/settings/ListinoManutenzione/hooks/useListinoData";
import type { ListinoPrezzo, TipoImpianto, TipoIntervento } from "@/pages/azienda/settings/ListinoManutenzione/types";

const state = vi.hoisted(() => ({
  role: "company_admin" as string,
  permissions: {} as Record<string, boolean>,
  tabelle: {} as Record<string, unknown[]>,
  righeScritte: [{ id: "x" }] as unknown[],
  erroreScrittura: null as unknown,
  scritture: [] as { tabella: string; azione: string; dati?: unknown }[],
  errore: vi.fn(),
  successo: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" }, role: state.role }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/hooks/useVertical", () => ({ useVertical: () => ({ vertical: "caldaie" }) }));
vi.mock("@/hooks/useUserPermissions", () => ({ useUserPermissions: () => ({ data: { can_view_costs: false } }) }));
vi.mock("@/hooks/useGovernanceThresholds", () => ({ useGovernanceThresholds: () => ({ data: { marginalita: { enabled: true, sogliaMinimaPerc: 15 } } }) }));
vi.mock("@/components/listino/TariffaProdottiCollegati", () => ({ TariffaProdottiCollegati: (): null => null }));
vi.mock("sonner", () => ({ toast: { error: state.errore, success: state.successo, info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (tabella: string) => {
  let azione = "lettura";
  const risposta = () => {
    if (azione === "lettura") return { data: (state.tabelle[tabella] ?? []) as unknown[], error: null as unknown };
    if (state.erroreScrittura) return { data: null as unknown, error: state.erroreScrittura };
    return { data: state.righeScritte, error: null as unknown };
  };
  const b: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "order", "range", "in"]) b[metodo] = () => b;
  for (const metodo of ["update", "delete", "insert"]) {
    b[metodo] = (dati?: unknown) => { azione = metodo; state.scritture.push({ tabella, azione: metodo, dati }); return b; };
  }
  b.then = (resolve: (valore: ReturnType<typeof risposta>) => unknown) => Promise.resolve(risposta()).then(resolve);
  return b;
} } }));

const AMMINISTRATORE = { isAdmin: true, canEditSettingsPricing: true, canViewSettingsPricing: true, canViewCosts: true, canViewEmployees: false };
const COLLEGA_CON_LISTINO = { isAdmin: false, canEditSettingsPricing: true, canViewSettingsPricing: true, canViewCosts: false, canViewEmployees: false };
const SOLO_LETTURA = { isAdmin: false, canEditSettingsPricing: false, canViewSettingsPricing: true, canViewCosts: false, canViewEmployees: false };

const IMPIANTI: TipoImpianto[] = [
  { id: "i1", company_id: "company-1", nome: "Caldaia", icona: "🔥", ordine: 10, attivo: true },
  { id: "i2", company_id: "company-1", nome: "Condizionatore", icona: "❄️", ordine: 20, attivo: false },
];
const INTERVENTI: TipoIntervento[] = [
  { id: "n1", company_id: "company-1", nome: "Manutenzione ordinaria", categoria: "manutenzione_ordinaria", durata_stimata_h: 2, attivo: true },
];
const PREZZI: ListinoPrezzo[] = [
  {
    id: "p1", company_id: "company-1", tipo_impianto_id: "i1", tipo_intervento_id: "n1", prezzo_base: 120, iva_percentuale: 22,
    unita: "intervento", attivo: true, note: null, valido_dal: null, valido_al: null,
    tipo_impianto: IMPIANTI[0], tipo_intervento: INTERVENTI[0],
  },
];

function Sonda() {
  const luogo = useLocation();
  return <output data-testid="indirizzo">{luogo.pathname + luogo.search}</output>;
}
function apri(percorso: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}><SettingsTariffe /><Sonda /></MemoryRouter>
    </QueryClientProvider>,
  );
}
const indirizzo = () => screen.getByTestId("indirizzo").textContent;
const scheda = (nome: string) => screen.getAllByRole("tab").slice(0, 4).find((t) => t.textContent === nome) as HTMLElement;
const vai = (nome: string) => fireEvent.mouseDown(scheda(nome), { button: 0, ctrlKey: false });
const selezionata = () => screen.getAllByRole("tab").slice(0, 4).filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.textContent);

beforeEach(() => {
  state.role = "company_admin";
  state.permissions = { ...AMMINISTRATORE };
  state.tabelle = { tipi_impianto: IMPIANTI, tipi_intervento: INTERVENTI, listino_prezzi: PREZZI, tariffe_aziendali: [], external_teams: [] };
  state.righeScritte = [{ id: "x" }];
  state.erroreScrittura = null;
  state.scritture.length = 0;
  state.errore.mockClear();
  state.successo.mockClear();
});
afterEach(cleanup);

describe("Manutenzione: una fila sola di schede", () => {
  it("niente seconda fila: nella parte di Manutenzione c'è un solo elenco di schede", async () => {
    apri("/azienda/impostazioni/tariffe?tab=prezzi");
    await waitFor(() => expect(screen.getByTitle("Manutenzione ordinaria")).toBeInTheDocument());
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Manodopera e servizi", "Impianti", "Interventi", "Prezzi di manutenzione"]);
  });

  it("niente titolo grande di pagina: lo mette il layout", async () => {
    apri("/azienda/impostazioni/tariffe?tab=impianti");
    await waitFor(() => expect(screen.getByText("Caldaia")).toBeInTheDocument());
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.queryByText("Listino Prezzi Manutenzione")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Manutenzione: tipi di impianto" })).toBeInTheDocument();
  });
});

describe("Manutenzione: ogni indirizzo apre la scheda giusta", () => {
  const CASI: Array<[string, string[]]> = [
    ["/azienda/impostazioni/tariffe", ["Manodopera e servizi"]],
    ["/azienda/impostazioni/tariffe?tab=manodopera", ["Manodopera e servizi"]],
    ["/azienda/impostazioni/tariffe?tab=manutenzione", ["Impianti"]],
    ["/azienda/impostazioni/tariffe?tab=impianti", ["Impianti"]],
    ["/azienda/impostazioni/tariffe?tab=interventi", ["Interventi"]],
    ["/azienda/impostazioni/tariffe?tab=prezzi", ["Prezzi di manutenzione"]],
    ["/azienda/impostazioni/tariffe?tab=boh", ["Manodopera e servizi"]],
  ];
  it.each(CASI)("%s → %j", async (percorso, attesa) => {
    apri(percorso);
    await waitFor(() => expect(screen.getAllByRole("tab").length).toBeGreaterThanOrEqual(4));
    expect(selezionata()).toEqual(attesa);
  });

  it("l'indirizzo di prima (?tab=manutenzione) mostra i tipi di impianto, come faceva", async () => {
    apri("/azienda/impostazioni/tariffe?tab=manutenzione");
    await waitFor(() => expect(screen.getByText("Caldaia")).toBeInTheDocument());
    expect(screen.getByText("Condizionatore")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuovo impianto" })).toBeInTheDocument();
  });

  it("ogni scheda mostra il suo elenco: impianti, interventi, prezzi", async () => {
    apri("/azienda/impostazioni/tariffe?tab=interventi");
    await waitFor(() => expect(screen.getByTitle("Manutenzione ordinaria")).toBeInTheDocument());
    expect(screen.getByText("2h")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuovo intervento" })).toBeInTheDocument();
    cleanup();

    apri("/azienda/impostazioni/tariffe?tab=prezzi");
    await waitFor(() => expect(screen.getByText("120,00 €")).toBeInTheDocument());
    expect(screen.getByText("22%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuovo prezzo" })).toBeInTheDocument();
  });

  it("il totale di ogni elenco sta accanto ai filtri (prima era nel numero della scheda interna)", async () => {
    apri("/azienda/impostazioni/tariffe?tab=impianti");
    await waitFor(() => expect(screen.getByText("2 tipi")).toBeInTheDocument());
  });
});

describe("Manutenzione: passare da una scheda all'altra", () => {
  it("scrive la scheda nell'indirizzo, e dalla manodopera lo ripulisce", async () => {
    apri("/azienda/impostazioni/tariffe");
    await waitFor(() => expect(scheda("Impianti")).toBeInTheDocument());
    vai("Interventi");
    await waitFor(() => expect(indirizzo()).toBe("/azienda/impostazioni/tariffe?tab=interventi"));
    expect(selezionata()).toEqual(["Interventi"]);
    expect(await screen.findByTitle("Manutenzione ordinaria")).toBeInTheDocument();
    vai("Prezzi di manutenzione");
    await waitFor(() => expect(indirizzo()).toBe("/azienda/impostazioni/tariffe?tab=prezzi"));
    vai("Manodopera e servizi");
    await waitFor(() => expect(indirizzo()).toBe("/azienda/impostazioni/tariffe"));
    expect(selezionata()).toEqual(["Manodopera e servizi"]);
  });

  it("gli altri parametri dell'indirizzo restano", async () => {
    apri("/azienda/impostazioni/tariffe?altro=1&tab=prezzi");
    await waitFor(() => expect(scheda("Impianti")).toBeInTheDocument());
    vai("Manodopera e servizi");
    await waitFor(() => expect(indirizzo()).toBe("/azienda/impostazioni/tariffe?altro=1"));
  });

  it("dal vecchio indirizzo, un clic su una scheda lo porta al nuovo", async () => {
    apri("/azienda/impostazioni/tariffe?tab=manutenzione");
    await waitFor(() => expect(scheda("Impianti")).toBeInTheDocument());
    vai("Prezzi di manutenzione");
    await waitFor(() => expect(indirizzo()).toBe("/azienda/impostazioni/tariffe?tab=prezzi"));
  });
});

describe("Manutenzione: chi può scrivere e chi no", () => {
  it("l'amministratore: tutti i pulsanti e il catalogo pronto", async () => {
    apri("/azienda/impostazioni/tariffe?tab=impianti");
    await waitFor(() => expect(screen.getByText("Caldaia")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Importa un catalogo pronto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Azioni per Caldaia" })).toBeInTheDocument();
    expect(screen.queryByText(/Stai consultando/)).toBeNull();
  });

  it("chi può solo guardare: l'elenco senza pulsanti, con la frase che spiega perché", async () => {
    state.role = "staff";
    state.permissions = { ...SOLO_LETTURA };
    apri("/azienda/impostazioni/tariffe?tab=impianti");
    await waitFor(() => expect(screen.getByText("Caldaia")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Nuovo impianto" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Importa un catalogo pronto" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Azioni per/ })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Stai consultando i tipi di impianto: li cambia l'amministratore dell'azienda.");
    // la riga non apre la modifica
    fireEvent.click(screen.getByText("Caldaia"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("chi ha «Listino & Prezzi» in modifica cambia i prezzi ma non i tipi di impianto e di intervento", async () => {
    state.role = "staff";
    state.permissions = { ...COLLEGA_CON_LISTINO };
    apri("/azienda/impostazioni/tariffe?tab=prezzi");
    await waitFor(() => expect(screen.getByText("120,00 €")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Nuovo prezzo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Azioni per il prezzo Caldaia · Manutenzione ordinaria" })).toBeInTheDocument();
    expect(screen.queryByText(/Stai consultando/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Importa un catalogo pronto" })).toBeNull();
    cleanup();

    state.role = "staff";
    apri("/azienda/impostazioni/tariffe?tab=impianti");
    await waitFor(() => expect(screen.getByText("Caldaia")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Nuovo impianto" })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("li cambia l'amministratore dell'azienda");
  });

  it("i prezzi, per chi può solo guardare, hanno la loro frase", async () => {
    state.role = "staff";
    state.permissions = { ...SOLO_LETTURA };
    apri("/azienda/impostazioni/tariffe?tab=prezzi");
    await waitFor(() => expect(screen.getByText("120,00 €")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Nuovo prezzo" })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Stai consultando i prezzi di manutenzione: li cambia chi ha il permesso «Listino & Prezzi» in modifica.");
  });

  it("l'elenco vuoto dice cosa fare solo a chi può farlo", async () => {
    state.tabelle.tipi_impianto = [];
    apri("/azienda/impostazioni/tariffe?tab=impianti");
    await waitFor(() => expect(screen.getByText(/Nessun tipo di impianto\./)).toBeInTheDocument());
    expect(screen.getByText("Nessun tipo di impianto. Aggiungine uno o usa «Importa un catalogo pronto».")).toBeInTheDocument();
    cleanup();
    state.role = "staff";
    state.permissions = { ...SOLO_LETTURA };
    apri("/azienda/impostazioni/tariffe?tab=impianti");
    await waitFor(() => expect(screen.getByText("Nessun tipo di impianto.")).toBeInTheDocument());
  });
});

describe("Manutenzione: il catalogo pronto", () => {
  it("«Importa un catalogo pronto» apre la finestra, senza la parola «template»", async () => {
    apri("/azienda/impostazioni/tariffe?tab=impianti");
    await waitFor(() => expect(screen.getByText("Caldaia")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Importa un catalogo pronto" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByRole("heading", { level: 2, name: "Importa un catalogo pronto" })).toBeInTheDocument();
    expect(within(finestra).getByRole("heading", { level: 3, name: /^Cataloghi pronti/ })).toBeInTheDocument();
    expect(finestra.textContent).not.toMatch(/template|tariff|pacchetti professionali/i);
    expect(within(finestra).getByRole("button", { name: /^Termoidraulica/ })).toHaveAttribute("aria-pressed");
  });
});

describe("Manutenzione: finestre con le etichette collegate e errori in italiano", () => {
  const propsComuni = { open: true, onClose: vi.fn(), companyId: "company-1", onSaved: vi.fn() };

  it("tipo di impianto: ogni campo ha il suo nome", () => {
    render(<ImpiantoDialog {...propsComuni} editing={null} />);
    expect(screen.getByRole("heading", { name: "Nuovo tipo di impianto" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome/)).toBeInTheDocument();
    expect(screen.getByLabelText("Ordine")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Attivo" })).toBeChecked();
    const icone = within(screen.getByRole("group", { name: "Icona" })).getAllByRole("button");
    expect(icone.length).toBeGreaterThanOrEqual(10);
    expect(icone.filter((i) => i.getAttribute("aria-pressed") === "true")).toHaveLength(1);
  });

  it("tipo di intervento e prezzo: ogni etichetta punta a un campo che esiste", () => {
    render(<InterventoDialog {...propsComuni} editing={null} />);
    for (const etichetta of Array.from(screen.getByRole("dialog").querySelectorAll("label[for]"))) {
      expect(document.getElementById(etichetta.getAttribute("for")!), etichetta.textContent ?? "").not.toBeNull();
    }
    expect(screen.getByLabelText("Categoria")).toBeInTheDocument();
    expect(screen.getByLabelText("Durata stimata (h)")).toBeInTheDocument();
    cleanup();

    render(<ListinoDialog {...propsComuni} editing={null} tipiImpianto={IMPIANTI} tipiIntervento={INTERVENTI} />);
    for (const nome of [/^Tipo di impianto/, /^Tipo di intervento/, "Prezzo €", "IVA %", "Unità", "Note (opzionale)"]) {
      expect(screen.getByLabelText(nome), String(nome)).toBeInTheDocument();
    }
    expect(screen.getByRole("switch", { name: "Prezzo attivo" })).toBeChecked();
    expect(screen.getByRole("heading", { name: "Nuovo prezzo di manutenzione" })).toBeInTheDocument();
  });

  it("senza nome non salva e lo dice", async () => {
    render(<ImpiantoDialog {...propsComuni} editing={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(state.errore).toHaveBeenCalledWith("Il nome è obbligatorio");
    expect(state.scritture).toHaveLength(0);
  });

  it("un tipo nuovo si salva con i dati di sempre", async () => {
    render(<ImpiantoDialog {...propsComuni} editing={null} />);
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "  Pompa di calore " } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.successo).toHaveBeenCalledWith("Tipo di impianto creato"));
    expect(state.scritture).toEqual([{ tabella: "tipi_impianto", azione: "insert", dati: { company_id: "company-1", nome: "Pompa di calore", icona: "🔧", ordine: null, attivo: true } }]);
  });

  it("senza rete lo dice in italiano", async () => {
    state.erroreScrittura = new TypeError("Failed to fetch");
    render(<ImpiantoDialog {...propsComuni} editing={null} />);
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "Pompa" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.errore).toHaveBeenCalledOnce());
    expect(state.errore).toHaveBeenCalledWith("Tipo di impianto non salvato. Connessione persa. Controlla la rete e riprova.");
  });

  it("una modifica che il database ignora (permesso mancante) non si annuncia come «aggiornata»", async () => {
    state.righeScritte = [];
    const onSaved = vi.fn();
    render(<ImpiantoDialog {...propsComuni} onSaved={onSaved} editing={IMPIANTI[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.errore).toHaveBeenCalledOnce());
    expect(state.errore).toHaveBeenCalledWith("Modifica non salvata: verifica i permessi e riprova.");
    expect(state.successo).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("la stessa cosa vale per il tipo di intervento e per il prezzo", async () => {
    state.righeScritte = [];
    render(<InterventoDialog {...propsComuni} editing={INTERVENTI[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.errore).toHaveBeenCalledWith("Modifica non salvata: verifica i permessi e riprova."));
    cleanup();
    state.errore.mockClear();
    render(<ListinoDialog {...propsComuni} editing={PREZZI[0]} tipiImpianto={IMPIANTI} tipiIntervento={INTERVENTI} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.errore).toHaveBeenCalledWith("Modifica non salvata: verifica i permessi e riprova."));
    expect(state.successo).not.toHaveBeenCalled();
  });

  it("il prezzo chiede di scegliere impianto e intervento con parole chiare", () => {
    render(<ListinoDialog {...propsComuni} editing={null} tipiImpianto={IMPIANTI} tipiIntervento={INTERVENTI} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(state.errore).toHaveBeenCalledWith("Scegli un tipo di impianto");
  });
});

describe("Manutenzione: eliminare", () => {
  const conCliente = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>
  );

  it("una cancellazione che il database ignora non si annuncia come «eliminata»", async () => {
    state.righeScritte = [];
    const { result } = renderHook(() => useListinoData("company-1"), { wrapper: conCliente });
    result.current.deleteImpiantoMutation.mutate("i1");
    await waitFor(() => expect(state.errore).toHaveBeenCalledOnce());
    expect(state.errore).toHaveBeenCalledWith("Non eliminato: verifica i permessi e riprova.");
    expect(state.successo).not.toHaveBeenCalled();
  });

  it("eliminato davvero: la frase di prima, con «di» e in italiano", async () => {
    const { result } = renderHook(() => useListinoData("company-1"), { wrapper: conCliente });
    result.current.deleteInterventoMutation.mutate("n1");
    await waitFor(() => expect(state.successo).toHaveBeenCalledWith("Tipo di intervento eliminato"));
    result.current.deleteListinoMutation.mutate("p1");
    await waitFor(() => expect(state.successo).toHaveBeenCalledWith("Prezzo eliminato"));
  });

  it("un errore del database diventa una frase", async () => {
    state.erroreScrittura = { code: "23503", message: "update or delete on table \"tipi_impianto\" violates foreign key constraint" };
    const { result } = renderHook(() => useListinoData("company-1"), { wrapper: conCliente });
    result.current.deleteImpiantoMutation.mutate("i1");
    await waitFor(() => expect(state.errore).toHaveBeenCalledOnce());
    expect(state.errore).toHaveBeenCalledWith("Tipo di impianto non eliminato. Impossibile completare: l'elemento è collegato ad altri dati.");
  });
});
