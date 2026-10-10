/**
 * Impostazioni → Profilo aziendale (09/10/2026), rifatto come «Prezzo e margini».
 *
 * La funzione che si cerca (il voto su Google nei preventivi, il numero delle commesse, i bonus edilizi, il portale
 * clienti) stava in fondo a una pila di riquadri uguali, senza titolo né indirizzo; «Salva» in fondo a un modulo da sei
 * sezioni; e c'era un campo «Note interne», ora tolto (vedi CompanyProfileForm).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsProfile from "@/pages/azienda/settings/SettingsProfile";

const stato = vi.hoisted(() => ({
  permessi: { isAdmin: true, canViewSettingsProfile: true, canEditSettingsProfile: true } as Record<string, boolean>,
  telefono: false,
  azienda: {
    id: "az-1", name: "Rossi Costruzioni", email: "info@rossi.it", sector: "ristrutturazioni", business_name: "Rossi S.r.l.", vat_number: "01234567897", phone: "123",
    legal_address: "Via Roma 1", legal_city: "Milano", legal_province: "MI", legal_postal_code: "20100",
    operational_address: "Via Roma 1", operational_city: "Milano", operational_province: "MI", operational_postal_code: "20100",
    notes: "nota della piattaforma", logo_url: null as string | null, customer_portal_enabled: false,
  } as Record<string, unknown>,
  aggiornamenti: [] as Record<string, unknown>[],
  successo: vi.fn(),
  errore: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: stato.azienda, refreshAuth: async (): Promise<void> => {}, userRoles: ["company_admin"] }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.telefono }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az-1" }));
vi.mock("@/hooks/useVotiOnline", () => ({
  useVotiOnline: () => ({ voti: [] as unknown[], grezzo: [] as unknown[], caricato: true }),
  useAggiornaVotiOnline: () => async () => {},
}));
vi.mock("@/lib/geocoding", () => ({ forwardGeocode: async (): Promise<null> => null }));
vi.mock("sonner", () => ({ toast: { success: stato.successo, error: stato.errore } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ list: async () => ({ data: [] as unknown[] }), remove: async () => ({}), upload: async () => ({ error: null as unknown }), getPublicUrl: () => ({ data: { publicUrl: "https://x/logo.png" } }) }) },
    from: () => {
      const costruttore = {
        select: () => costruttore,
        eq: () => costruttore,
        maybeSingle: async () => ({ data: { order_code_prefix: "DEMO" }, error: null as unknown }),
        update: (valore: Record<string, unknown>) => { stato.aggiornamenti.push(valore); return costruttore; },
        single: async () => ({ data: { id: "az-1" }, error: null as unknown }),
      };
      return costruttore;
    },
  },
}));

const scorri = vi.fn();
function apri(percorso = "/azienda/impostazioni/profilo") {
  return render(<MemoryRouter initialEntries={[percorso]}><SettingsProfile /></MemoryRouter>);
}
async function caricata() { await waitFor(() => expect(screen.getByLabelText(/Prefisso del codice commessa/)).toHaveValue("DEMO")); }
const sezione = (id: string) => document.getElementById(id) as HTMLElement;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  stato.permessi = { isAdmin: true, canViewSettingsProfile: true, canEditSettingsProfile: true };
  stato.telefono = false;
  stato.aggiornamenti.length = 0;
  stato.successo.mockClear();
  stato.errore.mockClear();
  scorri.mockClear();
  Element.prototype.scrollIntoView = scorri;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Profilo aziendale: una sezione per argomento", () => {
  it("le sezioni hanno titolo e indirizzo, e i dati dell'azienda stanno per primi", async () => {
    apri(); await caricata();
    const titoli = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titoli).toEqual(["Dati dell'azienda", "Logo", "Recensioni online", "Portale clienti", "Bonus edilizi e blocca prezzo"]);
    expect(["dati-azienda", "logo", "recensioni", "portale-clienti", "bonus"].map((id) => sezione(id)?.tagName)).toEqual(Array(5).fill("SECTION"));
  });

  it("dice a cosa vale ogni sezione", async () => {
    apri(); await caricata();
    expect(within(sezione("dati-azienda")).getByText("Tutta l'azienda")).toBeInTheDocument();
    expect(within(sezione("recensioni")).getByText("Preventivi")).toBeInTheDocument();
    expect(within(sezione("bonus")).getByText("Commesse")).toBeInTheDocument();
    expect(within(sezione("portale-clienti")).getByText("Clienti")).toBeInTheDocument();
  });

  it("i blocchi dei dati sono sotto un titolo di secondo livello, non saltano da h1 a h3", async () => {
    apri(); await caricata();
    const dati = sezione("dati-azienda");
    expect(within(dati).getAllByRole("heading", { level: 3 }).map((h) => h.textContent?.trim())).toEqual(["Dati generali", "Dati fiscali", "Contatti", "Sede legale", "Sede operativa"]);
  });

  it("il portale clienti non promette quello che non si può fare", async () => {
    apri(); await caricata();
    const portale = sezione("portale-clienti");
    expect(within(portale).queryByText(/Scegli se abilitare/)).toBeNull();
    expect(within(portale).getAllByText(/La attiva EdiliziaInCloud su richiesta/).length).toBeGreaterThan(0);
    expect(within(portale).getByRole("switch", { name: "Area privata clienti" })).toBeDisabled();
  });

  it("i bonus hanno le loro due righe, con il nome collegato all'interruttore", async () => {
    apri(); await caricata();
    const bonus = sezione("bonus");
    expect(within(bonus).getByRole("switch", { name: "Bonus edilizi multipli" })).toBeInTheDocument();
    expect(within(bonus).getByRole("switch", { name: "Blocca prezzo" })).toBeChecked();
    expect(within(bonus).getByText(/ogni agevolazione ha la sua pratica/)).toBeInTheDocument();
  });
});

describe("Profilo aziendale: «Note interne» non c'è più", () => {
  it("nessun riquadro «Note» nel profilo del cliente", async () => {
    apri(); await caricata();
    expect(screen.queryByText(/Note interne/i)).toBeNull();
    expect(screen.queryByLabelText(/Note/i)).toBeNull();
    expect(screen.queryByDisplayValue("nota della piattaforma")).toBeNull();
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("salvando un altro campo non si scrive mai la colonna delle note", async () => {
    apri(); await caricata();
    fireEvent.change(screen.getByLabelText("Telefono"), { target: { value: "456" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva dati aziendali" }));
    await waitFor(() => expect(stato.successo).toHaveBeenCalledOnce());
    expect(stato.aggiornamenti).toEqual([{ phone: "456" }]);
    expect(JSON.stringify(stato.aggiornamenti)).not.toContain("notes");
  });
});

describe("Profilo aziendale: indice, àncore e «Salva» in vista", () => {
  it("l'indice porta alla sezione e la evidenzia", async () => {
    apri(); await caricata();
    fireEvent.click(screen.getByRole("link", { name: "Recensioni" }));
    await waitFor(() => expect(scorri).toHaveBeenCalled());
    expect(scorri.mock.instances.at(-1)).toBe(sezione("recensioni"));
    await waitFor(() => expect(sezione("recensioni")).toHaveAttribute("data-evidenziata", "true"));
  });

  it("…/profilo#bonus apre la pagina già scorsa ai bonus edilizi", async () => {
    apri("/azienda/impostazioni/profilo#bonus"); await caricata();
    await waitFor(() => expect(scorri).toHaveBeenCalled());
    expect(scorri.mock.instances[0]).toBe(sezione("bonus"));
    expect(sezione("bonus")).toHaveAttribute("data-evidenziata", "true");
  });

  it("…/profilo#prefisso-commessa porta al numero delle commesse e lo evidenzia", async () => {
    apri("/azienda/impostazioni/profilo#prefisso-commessa"); await caricata();
    await waitFor(() => expect(scorri).toHaveBeenCalled());
    expect(scorri.mock.instances[0]).toBe(sezione("prefisso-commessa"));
    expect(sezione("prefisso-commessa").className).toContain("ring-2");
    expect(sezione("prefisso-commessa").contains(screen.getByLabelText(/Prefisso del codice commessa/))).toBe(true);
  });

  it("«Salva dati aziendali» sta nella barra che resta in vista, insieme all'indice, e salva davvero", async () => {
    apri(); await caricata();
    const barra = screen.getByRole("navigation", { name: "Vai a una sezione" }).parentElement as HTMLElement;
    expect(barra.className).toContain("sticky");
    const salva = within(barra).getByRole("button", { name: "Salva dati aziendali" });
    expect(salva).toBeDisabled();
    expect(within(barra).getByRole("status")).toHaveTextContent("Nessuna modifica da salvare");
    fireEvent.change(screen.getByLabelText("Telefono"), { target: { value: "456" } });
    expect(within(barra).getByRole("status")).toHaveTextContent("Modifiche non salvate");
    expect(salva).toBeEnabled();
    fireEvent.click(salva);
    await waitFor(() => expect(stato.successo).toHaveBeenCalledOnce());
    expect(stato.aggiornamenti).toEqual([{ phone: "456" }]);
  });

  it("da telefono l'indice non c'è, il pulsante sì", async () => {
    stato.telefono = true;
    apri(); await caricata();
    expect(screen.queryByRole("navigation", { name: "Vai a una sezione" })).toBeNull();
    expect(screen.getByRole("button", { name: "Salva dati aziendali" })).toBeInTheDocument();
  });

  it("un'àncora che non esiste non rompe niente", async () => {
    apri("/azienda/impostazioni/profilo#non-esiste"); await caricata();
    expect(scorri).not.toHaveBeenCalled();
  });
});

describe("Profilo aziendale: chi può cosa", () => {
  it("sola lettura: l'avviso dice cosa manca, i campi sono spenti, niente logo, portale e bonus", async () => {
    stato.permessi = { isAdmin: false, canViewSettingsProfile: true, canEditSettingsProfile: false };
    apri();
    expect(await screen.findByText(/Stai consultando i dati: li cambia chi ha il permesso «Profilo aziendale» in modifica/)).toBeInTheDocument();
    await caricata();
    expect(screen.getByLabelText("Telefono")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salva dati aziendali" })).toBeDisabled();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Dati dell'azienda", "Recensioni online"]);
    // il voto su Google si guarda ma non si cambia: niente «Aggiungi un voto» né «Salva» delle recensioni
    expect(screen.queryByRole("button", { name: /Aggiungi un voto/ })).toBeNull();
  });

  it("senza il permesso di vista non si vede niente", () => {
    stato.permessi = { isAdmin: false, canViewSettingsProfile: false, canEditSettingsProfile: false };
    const { container } = apri();
    expect(container).toBeEmptyDOMElement();
  });
});
