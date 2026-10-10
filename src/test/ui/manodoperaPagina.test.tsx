/**
 * Impostazioni → Listino → Manodopera e servizi (10/10/2026).
 *
 * Prima della prima voce c'erano un titolo ripetuto (il layout mette già «Listino»), la striscia dei numeri, un avviso
 * blu, una griglia di 13 pulsanti per scegliere l'area (che cambiava lo stesso filtro del menu «Filtra per area»), sei
 * filtri e sette schede di gruppo. Ora: una fila di schede con i pulsanti a destra, i numeri e l'avviso delle basi in una
 * riga, i filtri col menu dell'area (una volta sola) e le schede dei gruppi. Il testo sul semaforo del margine dice
 * quale soglia legge la tabella; da telefono ogni voce è una scheda invece di una tabella da 820 px.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsTariffe from "@/pages/azienda/settings/SettingsTariffe";

const state = vi.hoisted(() => ({
  role: "company_admin" as string,
  permissions: {} as Record<string, boolean>,
  soglia: 18,
  governanceCaricata: true,
  tabelle: {} as Record<string, unknown[]>,
  erroreCaricamento: null as unknown,
  erroreScrittura: null as unknown,
  errore: vi.fn(),
  successo: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" }, role: state.role }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/hooks/useVertical", () => ({ useVertical: () => ({ vertical: "serramentista" }) }));
vi.mock("@/hooks/useUserPermissions", () => ({ useUserPermissions: () => ({ data: { can_view_costs: false } }) }));
vi.mock("@/hooks/useGovernanceThresholds", () => ({
  useGovernanceThresholds: () => ({
    data: state.governanceCaricata ? { marginalita: { enabled: true, sogliaMinimaPerc: state.soglia } } : undefined,
  }),
}));
vi.mock("@/components/listino/TariffaProdottiCollegati", () => ({ TariffaProdottiCollegati: (): null => null }));
vi.mock("sonner", () => ({ toast: { error: state.errore, success: state.successo, info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (tabella: string) => {
  let scrittura = false;
  const risposta = () => {
    if (scrittura) return { data: null as unknown, error: state.erroreScrittura };
    if (tabella === "tariffe_aziendali" && state.erroreCaricamento) return { data: null as unknown, error: state.erroreCaricamento };
    return { data: (state.tabelle[tabella] ?? []) as unknown[], error: null as unknown };
  };
  const b: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "order", "range", "in"]) b[metodo] = () => b;
  for (const metodo of ["update", "delete", "insert"]) b[metodo] = () => { scrittura = true; return b; };
  b.then = (resolve: (valore: ReturnType<typeof risposta>) => unknown) => Promise.resolve(risposta()).then(resolve);
  return b;
} } }));

const voce = (extra: Record<string, unknown> & { id: string }) => ({
  company_id: "company-1", tipo: "posa", unita: "pz", unita_fatturazione: "pz", prezzo_vendita: 100, prezzo_costo: 60, costo_interno: 60,
  attivo: true, custom_field_values: {}, vertical_associato: "serramentista", ...extra,
});
const VOCI = [
  voce({ id: "t1", nome: "Posa finestra" }),
  voce({ id: "t2", nome: "Trasporto cantiere", tipo: "trasporto", unita_fatturazione: "a_corpo", prezzo_vendita: 80, prezzo_costo: 76, costo_interno: 76, vertical_associato: "bagno" }),
  voce({ id: "t3", nome: "Smaltimento serramento", tipo: "smaltimento", prezzo_vendita: 50, prezzo_costo: 60, costo_interno: 60 }),
  voce({ id: "t4", nome: "Base di posa", attivo: false, prezzo_vendita: 0, prezzo_costo: 0, costo_interno: 0, fonte: "Base standard da personalizzare" }),
  voce({ id: "t5", nome: "Vecchia voce archiviata", attivo: false, prezzo_vendita: 10, prezzo_costo: 5, costo_interno: 5 }),
];

const AMMINISTRATORE = { isAdmin: true, canEditSettingsPricing: true, canViewSettingsPricing: true, canViewCosts: true, canViewEmployees: false };
const SOLO_LETTURA = { isAdmin: false, canEditSettingsPricing: false, canViewSettingsPricing: true, canViewCosts: false, canViewEmployees: false };

function apri(percorso = "/azienda/impostazioni/tariffe") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}><SettingsTariffe /></MemoryRouter>
    </QueryClientProvider>,
  );
}
const caricata = () => waitFor(() => expect(screen.getByText("Posa finestra")).toBeInTheDocument());
/** L'elemento più piccolo che contiene tutti e due. */
function contenitoreComune(a: Element, b: Element): HTMLElement | null {
  let n: Element | null = a;
  while (n && !n.contains(b)) n = n.parentElement;
  return n as HTMLElement | null;
}
const testoPagina = () => (document.body.textContent ?? "").replace(/\s+/g, " ");
const larghezzaIniziale = window.innerWidth;
const larghezza = (px: number) => Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: px });

beforeEach(() => {
  state.role = "company_admin";
  state.permissions = { ...AMMINISTRATORE };
  state.soglia = 18;
  state.governanceCaricata = true;
  state.tabelle = { tariffe_aziendali: VOCI, external_teams: [{ id: "sq1", name: "Squadra Nord" }] };
  state.erroreCaricamento = null;
  state.erroreScrittura = null;
  state.errore.mockClear();
  state.successo.mockClear();
  larghezza(larghezzaIniziale);
});
afterEach(() => { cleanup(); larghezza(larghezzaIniziale); });

describe("Manodopera e servizi: una sola testata", () => {
  it("niente titolo di pagina qui dentro (lo mette il layout) e niente frase ripetuta", async () => {
    apri(); await caricata();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.queryByText("Manodopera e Servizi")).toBeNull();
    expect(testoPagina()).not.toContain("Scegli l'area e la lavorazione");
  });

  it("una fila di schede: Manodopera e servizi, Impianti, Interventi, Prezzi di manutenzione", async () => {
    apri(); await caricata();
    const schede = screen.getAllByRole("tab").slice(0, 4);
    expect(schede.map((s) => s.textContent)).toEqual(["Manodopera e servizi", "Impianti", "Interventi", "Prezzi di manutenzione"]);
    expect(schede[0]).toHaveAttribute("aria-selected", "true");
  });

  it("«Importa / Esporta» e «Nuova voce» stanno sulla riga delle schede, a destra", async () => {
    apri(); await caricata();
    const schede = screen.getByRole("tablist", { name: /Manodopera e servizi, impianti/ });
    const riga = schede.parentElement as HTMLElement;
    expect(within(riga).getByRole("button", { name: "Importa / Esporta" })).toBeInTheDocument();
    expect(within(riga).getByRole("button", { name: "Nuova voce" })).toBeInTheDocument();
    // a destra: vengono dopo le schede
    expect(Boolean(schede.compareDocumentPosition(screen.getByRole("button", { name: "Nuova voce" })) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("chi può solo consultare non vede «Nuova voce» né l'import: solo «Esporta», e una frase che spiega perché", async () => {
    state.role = "staff";
    state.permissions = { ...SOLO_LETTURA };
    apri(); await caricata();
    expect(screen.queryByRole("button", { name: "Nuova voce" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Importa / Esporta" })).toBeNull();
    expect(screen.getByRole("button", { name: "Esporta" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Stai consultando il listino: le voci le modifica chi ha il permesso «Listino & Prezzi» in modifica.");
    // niente costi né margini
    expect(screen.queryByText("Margine medio")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /Costo/ })).toBeNull();
  });

  it("chi modifica non vede l'avviso di sola lettura", async () => {
    apri(); await caricata();
    expect(screen.queryByText(/Stai consultando il listino/)).toBeNull();
  });
});

describe("Manodopera e servizi: i numeri e l'avviso delle basi in una riga", () => {
  it("quante voci, margine medio, sotto soglia e basi da completare stanno nello stesso riquadro", async () => {
    apri(); await caricata();
    const completa = screen.getByRole("button", { name: "Completa le basi" });
    const riquadro = contenitoreComune(screen.getByText("voci"), completa)!;
    expect(within(riquadro).getByText("Margine medio")).toBeInTheDocument();
    expect(within(riquadro).getByText(/Hai 1 lavorazione standard da personalizzare/)).toBeInTheDocument();
    expect(within(riquadro).getByRole("button", { name: /sotto soglia/ })).toBeInTheDocument();
    // è solo la riga dei numeri: niente filtri né tabella dentro
    expect(riquadro.querySelector("table, input")).toBeNull();
  });

  it("la spiegazione delle basi resta, collegata al pulsante", async () => {
    apri(); await caricata();
    expect(screen.getByRole("button", { name: "Completa le basi" })).toHaveAccessibleDescription(
      "Apri una voce, controlla cosa comprende e imposta i tuoi prezzi. Le basi non sono attive nei preventivi.",
    );
  });

  it("«Completa le basi» mostra solo le basi da completare", async () => {
    apri(); await caricata();
    fireEvent.click(screen.getByRole("button", { name: "Completa le basi" }));
    await waitFor(() => expect(screen.getByText("Base di posa")).toBeInTheDocument());
    expect(screen.queryByText("Posa finestra")).toBeNull();
    expect(screen.getByText("Stato: basi da completare")).toBeInTheDocument();
  });

  it("senza basi da completare non c'è nessun avviso", async () => {
    state.tabelle.tariffe_aziendali = VOCI.filter((v) => v.id !== "t4");
    apri(); await caricata();
    expect(screen.queryByRole("button", { name: "Completa le basi" })).toBeNull();
    expect(screen.queryByText(/lavorazion[ei] standard da personalizzare/)).toBeNull();
  });

  it("«N sotto soglia» filtra le voci sotto il margine minimo", async () => {
    apri(); await caricata();
    fireEvent.click(screen.getByRole("button", { name: /sotto soglia \(18%\)/ }));
    await waitFor(() => expect(screen.queryByText("Posa finestra")).toBeNull());
    expect(screen.getByText("Trasporto cantiere")).toBeInTheDocument();
  });
});

describe("Manodopera e servizi: l'area di lavoro si sceglie una volta sola", () => {
  it("la griglia «Aree di lavoro» non c'è più; resta il menu «Filtra per area»", async () => {
    apri(); await caricata();
    expect(screen.queryByRole("group", { name: "Aree della manodopera" })).toBeNull();
    expect(screen.queryByText("Aree di lavoro")).toBeNull();
    for (const area of [/Serramenti/, /Bagni/, /Tetti/, /Fotovoltaico/, /Comuni/]) {
      expect(screen.queryByRole("button", { name: area })).toBeNull();
    }
    const menu = screen.getByRole("combobox", { name: "Filtra per area di lavoro" });
    expect(menu).toHaveTextContent("Tutte le aree");
  });

  it("restano gli altri filtri, tutti con un nome", async () => {
    apri(); await caricata();
    expect(screen.getByRole("textbox", { name: "Cerca tra le voci" })).toBeInTheDocument();
    for (const nome of ["Filtra per stato della voce", "Filtra per gruppo di lavorazioni", "Filtra per listino", "Filtra per redditività"]) {
      expect(screen.getByRole("combobox", { name: nome }), nome).toBeInTheDocument();
    }
  });

  it("prima della tabella ci sono 12 comandi in meno di prima", async () => {
    apri(); await caricata();
    const tabella = screen.getByRole("table");
    const comandi = Array.from(document.querySelectorAll("button, a[href], input, select, [role='tab'], [role='combobox'], summary"));
    const davanti = comandi.filter((c) => Boolean(c.compareDocumentPosition(tabella) & Node.DOCUMENT_POSITION_FOLLOWING));
    // 4 schede + «Importa / Esporta» + «Nuova voce» + «2 sotto soglia» + «Completa le basi» + la ricerca + 5 filtri
    // + 3 schede di gruppo = 17. Con gli stessi dati la pagina di prima ne aveva 29: due schede, i quattro pulsanti
    // e le due scorciatoie, il titolo «Aree di lavoro» con i suoi 13 pulsanti, la ricerca, i filtri, i gruppi.
    expect(davanti.length).toBeLessThanOrEqual(17);
  });

  it("gli elenchi vuoti hanno un titolo di secondo livello", async () => {
    state.tabelle.tariffe_aziendali = [];
    apri();
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Nessuna voce ancora" })).toBeInTheDocument());
    cleanup();
    state.tabelle.tariffe_aziendali = VOCI;
    apri(); await caricata();
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca tra le voci" }), { target: { value: "zzzz" } });
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Nessun risultato" })).toBeInTheDocument());
  });
});

describe("Manodopera e servizi: il testo sul semaforo del margine dice la verità di oggi", () => {
  it("dice quale soglia legge la tabella, con il link per cambiarla", async () => {
    apri(); await caricata();
    expect(testoPagina()).toContain("Il margine è (vendita − costo) / vendita. Il semaforo della tabella usa il «Margine minimo delle commesse» di Approvazioni: ora 18%.");
    expect(screen.getByRole("link", { name: "Cambia" })).toHaveAttribute("href", "/azienda/impostazioni/approvazioni");
  });

  it("la soglia è quella di Approvazioni, non una fissa", async () => {
    state.soglia = 25;
    apri(); await caricata();
    expect(testoPagina()).toContain("ora 25%");
    expect(testoPagina()).toContain("verde, 25% o più");
    expect(testoPagina()).toContain("giallo, tra 0% e 25%");
  });

  it("con la soglia a zero non c'è il giallo: il margine è verde da 0% in su e rosso sotto", async () => {
    state.soglia = 0;
    apri(); await caricata();
    expect(testoPagina()).toContain("verde, 0% o più");
    expect(testoPagina()).not.toContain("giallo, tra 0% e");
    expect(testoPagina()).toContain("rosso, sotto lo 0%");
  });

  it("niente «governance», «standard CFO» né «salvataggio bloccato a <0%»", async () => {
    apri(); await caricata();
    const testo = testoPagina();
    expect(testo).not.toMatch(/governance/i);
    expect(testo).not.toMatch(/CFO/);
    expect(testo).not.toMatch(/salvataggio bloccato/i);
    expect(testo).not.toContain("<0%");
  });

  it("il blocco vero: costo uguale o più alto del prezzo (anche a margine 0%)", async () => {
    apri(); await caricata();
    expect(testoPagina()).toContain("Se il costo è uguale o più alto del prezzo di vendita, la voce non si salva.");
    expect(testoPagina()).toContain("rosso, sotto lo 0%");
  });

  it("il semaforo della tabella segue davvero quella soglia", async () => {
    // «Trasporto cantiere»: margine 5%. Con soglia 18 è sotto; con soglia 4 è sano.
    apri(); await caricata();
    const riga = screen.getByText("Trasporto cantiere").closest("tr") as HTMLElement;
    expect(within(riga).getByText("Sotto la soglia minima (18%)")).toBeInTheDocument();
    cleanup();
    state.soglia = 4;
    apri(); await caricata();
    expect(within(screen.getByText("Trasporto cantiere").closest("tr") as HTMLElement).getByText("Margine sano")).toBeInTheDocument();
  });

  it("una voce in perdita è rossa a prescindere dalla soglia", async () => {
    apri(); await caricata();
    expect(within(screen.getByText("Smaltimento serramento").closest("tr") as HTMLElement).getByText("In perdita (sottocosto)")).toBeInTheDocument();
  });

  it("chi non può aprire Approvazioni legge la frase ma non trova il link", async () => {
    state.permissions = { ...AMMINISTRATORE, isAdmin: false, canViewCosts: false };
    apri(); await caricata();
    expect(testoPagina()).toContain("ora 18%");
    expect(screen.queryByRole("link", { name: "Cambia" })).toBeNull();
  });

  it("finché la soglia non è caricata la frase non mostra un numero sbagliato", async () => {
    state.governanceCaricata = false;
    apri(); await caricata();
    expect(testoPagina()).not.toContain("Il semaforo della tabella usa");
  });

  it("chi non vede i costi non ha la nota sul margine", async () => {
    state.role = "staff";
    state.permissions = { ...SOLO_LETTURA };
    apri(); await caricata();
    expect(testoPagina()).not.toContain("Il margine è (vendita − costo)");
  });
});

describe("Manodopera e servizi: nomi per chi usa il lettore di schermo e parole giuste", () => {
  it("l'interruttore dello stato dice cosa fa: «Archivia …» / «Riattiva …»", async () => {
    state.tabelle.tariffe_aziendali = [...VOCI];
    apri(); await caricata();
    expect(screen.getByRole("switch", { name: "Archivia Posa finestra" })).toBeChecked();
  });

  it("anche per le voci archiviate: «Riattiva …»", async () => {
    apri(); await caricata();
    fireEvent.click(screen.getByRole("button", { name: "Completa le basi" }));
    await waitFor(() => expect(screen.getByText("Base di posa")).toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Riattiva Base di posa" })).not.toBeChecked();
  });

  it("chi non modifica ha l'interruttore spento e con un nome vero", async () => {
    state.role = "staff";
    state.permissions = { ...SOLO_LETTURA };
    apri(); await caricata();
    const interruttore = screen.getByRole("switch", { name: "Posa finestra: attiva" });
    expect(interruttore).toBeDisabled();
  });

  it("il menu ⋮ di ogni voce ha il nome della voce", async () => {
    apri(); await caricata();
    expect(screen.getByRole("button", { name: "Azioni per Posa finestra" })).toBeInTheDocument();
  });

  it("niente «tariffa» nel testo della pagina", async () => {
    apri(); await caricata();
    expect(testoPagina()).not.toMatch(/tariff/i);
  });
});

describe("Manodopera e servizi: gli errori sono in italiano", () => {
  it("se il listino non si carica lo dice con parole semplici", async () => {
    state.erroreCaricamento = { message: "Failed to fetch" };
    apri();
    await waitFor(() => expect(screen.getByText("Manodopera e servizi non caricati")).toBeInTheDocument());
    expect(screen.getByText("Manodopera e servizi non caricati").tagName).toBe("H2");
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a leggere le voci. Connessione persa. Controlla la rete e riprova.");
    expect(testoPagina()).not.toContain("Failed to fetch");
  });

  it("archiviare una voce senza rete: avviso in italiano, non «Failed to fetch»", async () => {
    state.erroreScrittura = new TypeError("Failed to fetch");
    apri(); await caricata();
    fireEvent.click(screen.getByRole("switch", { name: "Archivia Posa finestra" }));
    await waitFor(() => expect(state.errore).toHaveBeenCalledOnce());
    expect(state.errore).toHaveBeenCalledWith("Stato della voce non cambiato. Connessione persa. Controlla la rete e riprova.");
  });

  it("archiviare con successo dice «Voce archiviata»", async () => {
    apri(); await caricata();
    fireEvent.click(screen.getByRole("switch", { name: "Archivia Posa finestra" }));
    await waitFor(() => expect(state.successo).toHaveBeenCalledWith("Voce archiviata"));
  });
});

describe("Manodopera e servizi: da telefono", () => {
  it("sul computer c'è la tabella", async () => {
    apri(); await caricata();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Elenco delle voci" })).toBeNull();
  });

  it("a 375 px ogni voce è una scheda: nome, prezzo, costo e margine uno sotto l'altro", async () => {
    larghezza(375);
    apri(); await caricata();
    expect(screen.queryByRole("table")).toBeNull();
    const elenco = screen.getByRole("list", { name: "Elenco delle voci" });
    const schede = within(elenco).getAllByRole("listitem");
    expect(schede).toHaveLength(3);
    const finestra = schede[0];
    expect(finestra).toHaveTextContent("Posa finestra");
    expect(within(finestra).getByText("Vendita")).toBeInTheDocument();
    expect(finestra).toHaveTextContent("100,00");
    expect(within(finestra).getByText("Costo")).toBeInTheDocument();
    expect(finestra).toHaveTextContent("60,00");
    expect(within(finestra).getByText("Margine")).toBeInTheDocument();
    expect(finestra).toHaveTextContent("40,0%");
  });

  it("l'unità si legge «a corpo», non «a_corpo»", async () => {
    larghezza(375);
    apri(); await caricata();
    const trasporto = within(screen.getByRole("list", { name: "Elenco delle voci" })).getAllByRole("listitem")[1];
    expect(trasporto).toHaveTextContent("Trasporto cantiere");
    expect(trasporto).toHaveTextContent("/ a corpo");
    expect(trasporto).not.toHaveTextContent("a_corpo");
  });

  it("anche nella tabella da computer l'unità si legge «a corpo», non «a_corpo»", async () => {
    larghezza(1200);
    apri(); await caricata();
    const riga = screen.getByText("Trasporto cantiere").closest("tr") as HTMLElement;
    expect(within(riga).getByText("a corpo")).toBeInTheDocument();
    expect(riga).not.toHaveTextContent("a_corpo");
    // le altre unità restano com'erano
    expect(within(screen.getByText("Posa finestra").closest("tr") as HTMLElement).getByText("pz")).toBeInTheDocument();
  });

  it("l'interruttore e la casella della scheda hanno un'area da toccare di 44 px (loro sono alti 24 e 16)", async () => {
    larghezza(375);
    apri(); await caricata();
    const finestra = within(screen.getByRole("list", { name: "Elenco delle voci" })).getAllByRole("listitem")[0];
    expect(within(finestra).getByRole("switch").className).toContain("before:-inset-y-2.5");
    expect(within(finestra).getByRole("checkbox").className).toContain("before:-inset-3.5");
  });

  it("la scheda ha gli stessi comandi della riga: interruttore, menu ⋮ e casella per scegliere", async () => {
    larghezza(375);
    apri(); await caricata();
    const finestra = within(screen.getByRole("list", { name: "Elenco delle voci" })).getAllByRole("listitem")[0];
    expect(within(finestra).getByRole("switch", { name: "Archivia Posa finestra" })).toBeInTheDocument();
    expect(within(finestra).getByRole("button", { name: "Azioni per Posa finestra" })).toBeInTheDocument();
    expect(within(finestra).getByRole("checkbox", { name: "Seleziona Posa finestra" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Seleziona tutte le voci visibili" })).toBeInTheDocument();
  });

  it("scegliendo una scheda compare la barra delle azioni in blocco", async () => {
    larghezza(375);
    apri(); await caricata();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Posa finestra" }));
    await waitFor(() => expect(screen.getByText("1 voce selezionata")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Archivia/ })).toBeInTheDocument();
  });

  it("toccando la scheda si apre la modifica; toccando l'interruttore no", async () => {
    larghezza(375);
    apri(); await caricata();
    const finestra = within(screen.getByRole("list", { name: "Elenco delle voci" })).getAllByRole("listitem")[0];
    fireEvent.click(within(finestra).getByRole("switch", { name: "Archivia Posa finestra" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(within(finestra).getByText("Posa finestra"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Modifica voce" })).toBeInTheDocument();
  });

  it("chi non modifica vede prezzo e basta: niente costo, margine, caselle", async () => {
    larghezza(375);
    state.role = "staff";
    state.permissions = { ...SOLO_LETTURA };
    apri(); await caricata();
    const finestra = within(screen.getByRole("list", { name: "Elenco delle voci" })).getAllByRole("listitem")[0];
    expect(within(finestra).getByText("Vendita")).toBeInTheDocument();
    expect(within(finestra).queryByText("Costo")).toBeNull();
    expect(within(finestra).queryByText("Margine")).toBeNull();
    expect(within(finestra).queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Seleziona tutte le voci visibili" })).toBeNull();
  });

  it("i filtri, oltre alla ricerca, stanno chiusi sotto «Filtri»; sul computo no", async () => {
    apri(); await caricata();
    expect(screen.queryByText("Filtri")).toBeNull();
    cleanup();

    larghezza(375);
    apri(); await caricata();
    const filtri = screen.getByText("Filtri").closest("details") as HTMLDetailsElement;
    expect(filtri.open).toBe(false);
    for (const nome of ["Filtra per stato della voce", "Filtra per area di lavoro", "Filtra per gruppo di lavorazioni", "Filtra per listino", "Filtra per redditività"]) {
      expect(within(filtri).getByLabelText(nome), nome).toBeInTheDocument();
    }
    // la ricerca resta fuori, sempre in vista
    expect(filtri.contains(screen.getByRole("textbox", { name: "Cerca tra le voci" }))).toBe(false);
    fireEvent.click(screen.getByText("Filtri"));
    expect(filtri.open).toBe(true);
  });

  it("la scritta dice quanti filtri sono attivi", async () => {
    larghezza(375);
    apri(); await caricata();
    expect(screen.getByText("Filtri")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Completa le basi" }));
    await waitFor(() => expect(screen.getByText("Filtri (1)")).toBeInTheDocument());
  });

  it("i campi dei filtri sono alti 44 px da telefono", async () => {
    larghezza(375);
    apri(); await caricata();
    expect(screen.getByRole("textbox", { name: "Cerca tra le voci" }).className).toContain("max-md:h-11");
    for (const nome of ["Filtra per stato della voce", "Filtra per area di lavoro", "Filtra per gruppo di lavorazioni", "Filtra per listino", "Filtra per redditività"]) {
      expect(screen.getByRole("combobox", { name: nome }).className, nome).toContain("max-md:h-11");
    }
  });
});
