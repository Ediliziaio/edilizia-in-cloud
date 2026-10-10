/**
 * Marchio (White-Label): la richiesta d'attivazione, le schede, la barra «Salva marchio», le parole e gli errori.
 *
 * - Il pulsante della funzione a pagamento apriva /cliente/assistenza, l'area dei CLIENTI finali: l'amministratore
 *   finiva sulla sua home in una scheda nuova. Ora apre la richiesta al consulente (la finestra di «sblocca questa
 *   funzione») e il suo «Chiama» non è più un numero finto.
 * - «Indirizzo web» ha il suo indirizzo (?tab=indirizzo) e «Salva marchio» c'è solo dove serve (Aspetto).
 * - Subdomain/tier/brand/footer sono in italiano; i pulsanti «Carica» dicono per cosa; i campi colore hanno l'etichetta.
 * - Gli errori dicono il motivo: sottodominio già preso, dominio già di un'altra azienda (la frase sta nel corpo della
 *   risposta della funzione), marchio rifiutato dalle regole di accesso, colore scritto male.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { BrandSettings } from "@/hooks/useBrandSettings";

const stato = vi.hoisted(() => ({
  admin: true,
  gate: { isWhiteLabel: false, tier: "none", name: "Nessuno" } as Record<string, unknown>,
  azienda: { id: "company-1", name: "Rossi Costruzioni", business_name: "Rossi Costruzioni", logo_url: null as string | null },
  utente: { id: "user-1", email: "titolare@rossi.it" },
  brand: {
    white_label_enabled: false, brand_primary_color: "#1E40AF", brand_secondary_color: "#3B82F6", brand_accent_color: "#DBEAFE",
    brand_text_on_primary: "#FFFFFF", brand_platform_name: "", brand_hide_powered_by: false, brand_favicon_url: null, brand_login_bg_url: null,
    logo_url: null, brand_logo_dark_url: null,
  } as BrandSettings,
  branding: { subdomain: "", custom_domain: "" } as { subdomain: string; custom_domain: string },
  salvaErrore: null as unknown,
  sottodominioErrore: null as unknown,
  dominioErrore: null as unknown,
  richieste: [] as Record<string, unknown>[],
  success: vi.fn(), warning: vi.fn(), error: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: stato.azienda, user: stato.utente, refreshAuth: async (): Promise<void> => {} }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: stato.admin }) }));
vi.mock("@/hooks/useBrandSettings", () => ({
  useBrandSettings: () => ({
    brand: stato.brand, isLoading: false, isError: false, refetch: vi.fn(), uploadBrandFile: vi.fn(),
    saveBrand: {
      mutateAsync: async (valore: Partial<BrandSettings>) => {
        if (stato.salvaErrore) throw stato.salvaErrore;
        stato.brand = { ...stato.brand, ...valore };
        return stato.brand;
      },
    },
  }),
}));
vi.mock("@/hooks/useBranding", () => ({ useBranding: () => ({ branding: stato.branding }) }));
vi.mock("@/hooks/useWhitelabelGate", () => ({ useWhitelabelGate: () => stato.gate }));
vi.mock("@/hooks/useBrandingByDomain", () => ({
  isValidCustomDomain: (valore: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(valore),
  normalizeCustomDomainInput: (valore: string) => valore,
  useSaveSubdomain: () => ({
    isPending: false,
    mutateAsync: async () => { if (stato.sottodominioErrore) throw stato.sottodominioErrore; },
  }),
  useRequestDomainVerification: () => ({
    isPending: false,
    mutateAsync: async () => { if (stato.dominioErrore) throw stato.dominioErrore; return { success: true, cname_target: "x" }; },
  }),
  useVerifyCustomDomain: () => ({ isPending: false, mutateAsync: async () => ({ verified: true }) }),
  useRemoveCustomDomain: () => ({ isPending: false, mutateAsync: async () => ({ success: true }) }),
}));
vi.mock("@/components/settings/LogoUploader", () => ({ LogoUploader: () => <p>Logo</p> }));
vi.mock("@/components/billing/AddonWhatsAppOfferta", () => ({ AddonWhatsAppOfferta: (): null => null }));
vi.mock("sonner", () => ({ toast: { success: stato.success, warning: stato.warning, error: stato.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => ({
      upsert: async () => ({ error: null as { message: string } | null }),
      insert: async (valore: Record<string, unknown>) => { stato.richieste.push({ tabella, ...valore }); return { error: null as { message: string } | null }; },
    }),
  },
}));

import SettingsBranding from "@/pages/azienda/settings/SettingsBranding";

const Posizione = () => {
  const { pathname, search, hash } = useLocation();
  return <p data-testid="posizione">{pathname}{search}{hash}</p>;
};

function apri(percorso = "/azienda/impostazioni/branding") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[percorso]}>
      <QueryClientProvider client={client}><SettingsBranding /><Posizione /></QueryClientProvider>
    </MemoryRouter>,
  );
}
const posizione = () => screen.getByTestId("posizione").textContent;
const conWhiteLabel = (gate: Record<string, unknown> = {}) => {
  stato.gate = { isWhiteLabel: true, tier: "full", name: "Completo", ...gate };
  stato.brand = { ...stato.brand, white_label_enabled: true };
};

beforeEach(() => {
  stato.admin = true;
  stato.gate = { isWhiteLabel: false, tier: "none", name: "Nessuno" };
  stato.brand = { ...stato.brand, white_label_enabled: false, brand_platform_name: "" };
  stato.branding = { subdomain: "", custom_domain: "" };
  stato.salvaErrore = null; stato.sottodominioErrore = null; stato.dominioErrore = null;
  stato.richieste.length = 0;
  stato.success.mockClear(); stato.warning.mockClear(); stato.error.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Marchio: la funzione a pagamento si chiede, non rimanda all'area dei clienti", () => {
  it("«Chiedi l'attivazione» apre la richiesta al consulente e non la pagina /cliente/assistenza", async () => {
    const apertura = vi.spyOn(window, "open").mockImplementation(() => null);
    apri();
    expect(screen.queryByText(/Contatta il Supporto/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Chiedi l'attivazione" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByText("Sblocca White-Label")).toBeInTheDocument();
    expect(finestra).toHaveTextContent("Per personalizzare il marchio ti serve l'accesso completo.");
    expect(apertura).not.toHaveBeenCalled();
  });

  it("nella richiesta «Chiama» è il numero commerciale, «Email» scrive all'assistenza e il link di chiusura non parla di demo", async () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Chiedi l'attivazione" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByRole("link", { name: "Chiama" })).toHaveAttribute("href", "tel:+393501780908");
    expect(within(finestra).getByRole("link", { name: "Email" }).getAttribute("href")).toMatch(/^mailto:info@ediliziaincloud\.com\?subject=Sblocco%20White-Label/);
    expect(within(finestra).getByRole("button", { name: "Non ora" })).toBeInTheDocument();
    expect(within(finestra).queryByText(/esplorare la demo/)).toBeNull();
  });

  it("«Contatta il consulente» manda la richiesta con la funzione e l'azienda giuste", async () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Chiedi l'attivazione" }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.click(within(finestra).getByRole("button", { name: /Contatta il consulente/ }));
    expect(await screen.findByText(/Richiesta inviata/)).toBeInTheDocument();
    const richieste = stato.richieste.filter((r) => r.tabella === "feature_unlock_requests");
    expect(richieste).toHaveLength(1);
    expect(richieste[0]).toMatchObject({ company_id: "company-1", feature_key: "white_label", requested_by: "user-1" });
  });

  it("chi può solo guardare non vede il pulsante: gli si dice di parlarne con l'amministratore", () => {
    stato.admin = false;
    apri();
    expect(screen.queryByRole("button", { name: "Chiedi l'attivazione" })).toBeNull();
    expect(screen.getByText("Per attivarla parlane con l'amministratore dell'azienda.")).toBeInTheDocument();
    expect(screen.getByText(/lo cambia solo un amministratore/)).toBeInTheDocument();
  });

  it("con il White-Label attivo il riquadro a pagamento non c'è", () => {
    conWhiteLabel();
    apri();
    expect(screen.queryByRole("button", { name: "Chiedi l'attivazione" })).toBeNull();
    expect(screen.queryByText(/funzione a pagamento/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Marchio personalizzato" })).toBeInTheDocument();
  });
});

describe("Marchio: le schede stanno nell'indirizzo e «Salva marchio» c'è dove serve", () => {
  beforeEach(() => conWhiteLabel());

  it("si apre su «Aspetto», con «Salva marchio» in vista", () => {
    apri();
    expect(screen.getByRole("tab", { name: "Aspetto" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Salva marchio" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Sottodominio" })).toBeNull();
  });

  it("?tab=indirizzo apre «Indirizzo web» e lì non c'è «Salva marchio»", () => {
    apri("/azienda/impostazioni/branding?tab=indirizzo");
    expect(screen.getByRole("tab", { name: "Indirizzo web" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Sottodominio" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dominio personalizzato" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salva marchio" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Annulla modifiche" })).toBeNull();
  });

  it("cambiare scheda cambia l'indirizzo, e tornare ad «Aspetto» lo libera", () => {
    apri();
    expect(posizione()).toBe("/azienda/impostazioni/branding");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Indirizzo web" }), { button: 0, ctrlKey: false });
    expect(posizione()).toBe("/azienda/impostazioni/branding?tab=indirizzo");
    expect(screen.getByRole("heading", { name: "Sottodominio" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Aspetto" }), { button: 0, ctrlKey: false });
    expect(posizione()).toBe("/azienda/impostazioni/branding");
    expect(screen.getByRole("button", { name: "Salva marchio" })).toBeInTheDocument();
  });

  it("una modifica accende «Modifiche non salvate» e «Annulla modifiche» la toglie", () => {
    apri();
    const barra = screen.getByRole("status");
    expect(barra).not.toHaveTextContent("Modifiche non salvate");
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Rossi Casa" } });
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    expect(screen.getByRole("button", { name: "Salva marchio" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Annulla modifiche" }));
    expect(screen.getByRole("status")).not.toHaveTextContent("Modifiche non salvate");
    expect(screen.getByLabelText("Nome della piattaforma")).toHaveValue("");
  });

  it("«Profilo aziendale» è un collegamento dell'app (non ricarica la pagina) e porta al logo", () => {
    apri();
    const collegamento = screen.getByRole("link", { name: "Profilo aziendale" });
    expect(collegamento).toHaveAttribute("href", "/azienda/impostazioni/profilo#logo");
    fireEvent.click(collegamento);
    expect(posizione()).toBe("/azienda/impostazioni/profilo#logo");
  });
});

describe("Marchio: le parole sono in italiano e i campi hanno il loro nome", () => {
  beforeEach(() => conWhiteLabel());

  it.each(["/azienda/impostazioni/branding", "/azienda/impostazioni/branding?tab=indirizzo"])(
    "nessuna parola inglese di prima (Subdomain, tier, brand, footer, Premium) in %s",
    (percorso) => {
      apri(percorso);
      const testo = document.body.textContent ?? "";
      expect(testo).not.toMatch(/subdomain/i);
      expect(testo).not.toMatch(/\btier\b/i);
      expect(testo).not.toMatch(/\bbrand\b/i);
      expect(testo).not.toMatch(/footer/i);
      expect(testo).not.toMatch(/premium/i);
    },
  );

  it("il sottodominio ha la sua etichetta e il suo suffisso", () => {
    apri("/azienda/impostazioni/branding?tab=indirizzo");
    expect(screen.getByLabelText("Il tuo sottodominio")).toBeInTheDocument();
    expect(screen.getByText(".ediliziaincloud.com")).toBeInTheDocument();
  });

  it("ogni campo colore ha la sua etichetta e le caselle dei colori dicono se sono scelte", () => {
    apri();
    expect(screen.getByLabelText("Colore del marchio")).toHaveValue("#1E40AF");
    expect(screen.getByLabelText("Sfondo delle voci attive")).toHaveValue("#DBEAFE");
    expect(screen.getByLabelText("Testo sui bottoni")).toHaveValue("#FFFFFF");
    expect(screen.getByRole("button", { name: "Usa il colore #1E40AF" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Usa il colore #0F766E" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("group", { name: "Oppure parti da uno di questi" })).toBeInTheDocument();
  });

  it("i tre «Carica» dicono per cosa sono", () => {
    apri();
    expect(screen.getByRole("button", { name: "Carica il logo chiaro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carica l'icona del browser" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carica lo sfondo della pagina di accesso" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Logo chiaro" })).toBeInTheDocument();
  });

  it("quello che il piano non include porta il nome vero del piano", () => {
    conWhiteLabel({ canChangeColors: false, canCustomDomain: false, canHidePoweredBy: false, name: "Base" });
    apri();
    expect(screen.getByText("Il tuo piano (Base) non include i colori personalizzati.")).toBeInTheDocument();
    expect(screen.getAllByText("Non incluso nel tuo piano").length).toBeGreaterThan(0);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Indirizzo web" }), { button: 0, ctrlKey: false });
    expect(screen.getByText("Il tuo piano (Base) non include i domini personalizzati.")).toBeInTheDocument();
  });

  it("i titoli dei riquadri sono di secondo livello: il primo lo mette il layout", () => {
    apri();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    for (const titolo of ["Logo aziendale", "Colori", "Nome e immagini", "Anteprima"]) {
      expect(screen.getByRole("heading", { level: 2, name: titolo })).toBeInTheDocument();
    }
  });
});

describe("Marchio: gli errori dicono il motivo", () => {
  beforeEach(() => conWhiteLabel());

  it("un sottodominio già di un'altra azienda lo dice", async () => {
    stato.sottodominioErrore = { code: "23505", message: "duplicate key value violates unique constraint \"company_branding_subdomain_key\"" };
    apri("/azienda/impostazioni/branding?tab=indirizzo");
    fireEvent.change(screen.getByLabelText("Il tuo sottodominio"), { target: { value: "rossi" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva sottodominio" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Sottodominio non salvato", { description: "Questo sottodominio è già di un'altra azienda: provane un altro." });
  });

  it("un dominio già di un'altra azienda: si legge la frase della funzione, non «non-2xx»", async () => {
    stato.dominioErrore = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: { json: async () => ({ error: "Questo dominio è già associato a un'altra azienda" }) },
    });
    apri("/azienda/impostazioni/branding?tab=indirizzo");
    fireEvent.change(screen.getByLabelText("Dominio"), { target: { value: "crm.rossi.it" } });
    fireEvent.click(screen.getByRole("button", { name: "Configura il dominio" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Dominio non configurato", { description: "Questo dominio è già associato a un'altra azienda" });
  });

  it("se la funzione non risponde con una frase, un errore di rete si traduce", async () => {
    stato.dominioErrore = Object.assign(new Error("Failed to fetch"), { context: { json: async () => { throw new Error("niente corpo"); } } });
    apri("/azienda/impostazioni/branding?tab=indirizzo");
    fireEvent.change(screen.getByLabelText("Dominio"), { target: { value: "crm.rossi.it" } });
    fireEvent.click(screen.getByRole("button", { name: "Configura il dominio" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Dominio non configurato", { description: "Connessione persa. Controlla la rete e riprova." });
  });

  it("un marchio rifiutato dalle regole di accesso (nessuna riga toccata) lo dice", async () => {
    stato.salvaErrore = { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" };
    apri();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Rossi Casa" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva marchio" }));
    await waitFor(() => expect(stato.error).toHaveBeenCalledOnce());
    expect(stato.error).toHaveBeenCalledWith("Marchio non salvato", { description: "Il tuo utente non può modificare il marchio dell'azienda." });
    expect(screen.getByLabelText("Nome della piattaforma")).toHaveValue("Rossi Casa");
  });

  it("un colore scritto male nomina il campo come lo vede chi lo ha scritto", async () => {
    apri();
    fireEvent.click(screen.getByText("Regola i dettagli"));
    fireEvent.change(screen.getByLabelText("Sfondo delle voci attive"), { target: { value: "#12" } });
    expect(screen.getByLabelText("Sfondo delle voci attive")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("Scrivi il colore così: #1E40AF").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Salva marchio" }));
    expect(stato.error).toHaveBeenCalledWith("Sfondo delle voci attive: scrivi il colore così, #1E40AF");
  });

  it("un marchio salvato dice «Marchio aggiornato»", async () => {
    apri();
    fireEvent.change(screen.getByLabelText("Nome della piattaforma"), { target: { value: "Rossi Casa" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva marchio" }));
    await waitFor(() => expect(stato.success).toHaveBeenCalledWith("Marchio aggiornato"));
  });
});
