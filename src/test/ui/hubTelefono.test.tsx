/**
 * L'elenco delle impostazioni da telefono: si cerca per parola come il ⌘K («password», «logo», «iban»), si nasconde
 * una voce quando una qualsiasi delle sue schede non c'è da telefono, e i titoli di gruppo sono h2.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsMobileHub from "@/pages/azienda/settings/SettingsMobileHub";

const state = vi.hoisted(() => ({
  mobile: true,
  permessi: { isAdmin: true, isLoading: false } as Record<string, unknown>,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ signOut: vi.fn(), user: { email: "mario@esempio.it" }, profile: { first_name: "Mario", last_name: "Rossi" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permessi }));
vi.mock("@/hooks/useStatoPiano", () => ({ useStatoPiano: () => ({ stato: { tuttoVisibile: true } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/contexts/BillingModeContext", () => ({ useBillingMode: () => ({ isNative: true }) }));

afterEach(() => {
  cleanup();
  state.mobile = true;
  state.permessi = { isAdmin: true, isLoading: false };
});

const apri = () => render(<MemoryRouter><SettingsMobileHub /></MemoryRouter>);
const cerca = (testo: string) => fireEvent.change(screen.getByLabelText("Cerca un'impostazione"), { target: { value: testo } });
const voci = () => screen.queryAllByRole("link").map((l) => l.textContent ?? "");

describe("hub da telefono: cosa si vede", () => {
  it("l'amministratore ha le voci da telefono e non quelle da computer", () => {
    apri();
    const nomi = voci();
    for (const si of ["Il mio profilo", "Profilo aziendale", "Utenti e permessi", "Notifiche", "Sicurezza & Privacy", "Esporta i dati"]) {
      expect(nomi.some((n) => n.includes(si)), si).toBe(true);
    }
    for (const no of ["Listino", "Modelli di preventivo", "Firma e condizioni", "Finanziamenti", "Integrazioni", "Piano abbonamento", "Stati commessa", "Sedi", "Marchio e colori"]) {
      expect(nomi.some((n) => n.startsWith(no)), no).toBe(false);
    }
  });

  it("si nasconde la voce, non l'indirizzo della prima scheda: chi ha solo «Sconti» non vede «Modelli di preventivo»", () => {
    state.permessi = { isAdmin: false, isLoading: false, canViewSettingsScontistica: true };
    apri();
    expect(voci().some((n) => n.startsWith("Modelli di preventivo"))).toBe(false);
  });

  it("…e così chi ha solo «Kit e pacchetti» non vede «Listino», e chi ha solo «Integrazioni» non vede «Firma e condizioni»", () => {
    state.permessi = { isAdmin: false, isLoading: false, canViewSettingsBundle: true };
    apri();
    expect(voci().some((n) => n.startsWith("Listino"))).toBe(false);
    cleanup();
    state.permessi = { isAdmin: false, isLoading: false, canViewSettingsIntegrations: true };
    apri();
    expect(voci().some((n) => n.startsWith("Firma e condizioni"))).toBe(false);
  });

  it("da tablet e computer le stesse voci ci sono", () => {
    state.mobile = false;
    state.permessi = { isAdmin: false, isLoading: false, canViewSettingsScontistica: true };
    apri();
    expect(voci().some((n) => n.startsWith("Modelli di preventivo"))).toBe(true);
  });

  it("i titoli dei gruppi sono h2 (sopra c'è l'h1 della testata)", () => {
    apri();
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    const gruppi = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(gruppi).toEqual(expect.arrayContaining(["Il mio account", "La mia azienda", "Account corrente"]));
  });

  it("«Crediti e ricariche» è fra le voci della sua azienda (da telefono la pagina c'è)", () => {
    apri();
    expect(voci().some((n) => n.startsWith("Crediti e ricariche"))).toBe(true);
  });
});

describe("hub da telefono: la ricerca", () => {
  it("«password» porta alla scheda della password, non solo ai nomi delle voci", () => {
    apri();
    cerca("password");
    const link = screen.getByRole("link", { name: /Sicurezza profilo/ });
    expect(link).toHaveAttribute("href", "/azienda/impostazioni/mio-profilo?tab=sicurezza");
    expect(screen.getByRole("heading", { level: 2, name: "Risultati" })).toBeInTheDocument();
    // la griglia dei gruppi lascia il posto ai risultati
    expect(screen.queryByText("La mia azienda")).toBeNull();
  });

  it("«logo» trova il logo del Profilo aziendale; Marchio e colori, nascosto da telefono, no", () => {
    apri();
    cerca("logo");
    expect(screen.getByRole("link", { name: /Logo aziendale/ })).toHaveAttribute("href", "/azienda/impostazioni/profilo#logo");
    expect(screen.queryByRole("link", { name: /Marchio e colori/ })).toBeNull();
  });

  it("«prezzo a mano» non c'è da telefono ma da computer sì, e lo dice", () => {
    apri();
    cerca("prezzo a mano");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/Le impostazioni per «prezzo a mano» si cambiano da computer o tablet/)).toBeInTheDocument();
  });

  it("una parola che non c'è dice cosa provare", () => {
    apri();
    cerca("zxqv");
    expect(screen.getByText(/Nessuna impostazione trovata per «zxqv»\. Prova con un.altra parola/)).toBeInTheDocument();
  });

  it("gli accenti e le maiuscole non contano", () => {
    apri();
    cerca("attività");
    const conAccento = voci();
    expect(conAccento.length).toBeGreaterThan(0);
    cerca("ATTIVITA");
    expect(voci()).toEqual(conAccento);
    cerca("NOTIFICHE");
    // la pagina e le sue sezioni (avvisi, orari di silenzio…): la pagina viene prima
    expect(screen.getAllByRole("link", { name: /Notifiche/ })[0]).toHaveAttribute("href", "/azienda/impostazioni/notifiche");
  });

  it("la casella vuota riporta l'elenco dei gruppi", () => {
    apri();
    cerca("logo");
    cerca("");
    expect(screen.getByText("La mia azienda")).toBeInTheDocument();
  });
});
