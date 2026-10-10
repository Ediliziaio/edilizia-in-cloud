/**
 * Il ⌘K delle impostazioni, come lo vede chi lo usa: a casella vuota le voci che si cercano di più, scrivendo ogni
 * parola conta, il nome e la frase di ogni voce sono sotto gli occhi, e chi non può aprire una pagina non la trova.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SettingsSearch } from "@/components/layouts/SettingsSearch";

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  permessi: { isAdmin: true, isLoading: false } as Record<string, unknown>,
  fatturazione: null as unknown as { isNative: boolean } | null,
}));
vi.mock("react-router-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-router-dom")>()), useNavigate: () => state.navigate }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permessi }));
vi.mock("@/hooks/useStatoPiano", () => ({ useStatoPiano: () => ({ stato: { tuttoVisibile: true } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/contexts/BillingModeContext", () => ({ useBillingMode: () => state.fatturazione }));

beforeAll(() => {
  // cmdk misura e scorre: in jsdom non esiste.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  state.navigate.mockClear();
  state.permessi = { isAdmin: true, isLoading: false };
  state.fatturazione = null;
});

async function apri() {
  render(<MemoryRouter><SettingsSearch /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Cerca nelle impostazioni" }));
  return screen.findByPlaceholderText(/Cerca impostazioni/);
}
async function cerca(testo: string) {
  const campo = await apri();
  fireEvent.change(campo, { target: { value: testo } });
  return campo;
}

describe("a casella vuota", () => {
  it("prima le voci che si cercano di più, poi il menu", async () => {
    await apri();
    const gruppo = (await screen.findByText("Le più cercate")).closest("[cmdk-group]") as HTMLElement;
    const voci = within(gruppo).getAllByRole("option").map((o) => o.textContent ?? "");
    expect(voci).toHaveLength(8);
    expect(voci[0]).toContain("Prezzo scritto a mano");
    expect(voci[1]).toContain("Modelli di preventivo · Sconti");
    // …e sotto c'è tutto il menu, con i nomi dei suoi gruppi
    expect(screen.getByText("Preventivi & Listino")).toBeInTheDocument();
    expect(screen.getByText("Profilo aziendale")).toBeInTheDocument();
  });

  it("chi non può aprire una voce delle più cercate non la vede", async () => {
    state.permessi = { isAdmin: false, isLoading: false, canViewSettingsPricing: true };
    await apri();
    const gruppo = (await screen.findByText("Le più cercate")).closest("[cmdk-group]") as HTMLElement;
    const voci = within(gruppo).getAllByRole("option").map((o) => o.textContent ?? "");
    expect(voci.some((v) => v.includes("Prezzo scritto a mano"))).toBe(false);
    expect(voci.some((v) => v.includes("Notifiche"))).toBe(true);
  });

  it("il pulsante dice quale tasto la apre: ⌘K sul Mac, Ctrl K altrove", () => {
    render(<MemoryRouter><SettingsSearch /></MemoryRouter>);
    const tasto = screen.getByRole("button", { name: "Cerca nelle impostazioni" }).querySelector("kbd");
    expect(["⌘K", "Ctrl K"]).toContain(tasto?.textContent);
  });
});

describe("scrivendo", () => {
  it("ogni parola conta, in qualunque ordine, e sotto il nome si legge a cosa serve", async () => {
    await cerca("lavorate ore");
    expect(await screen.findByText("Rapportini e presenze")).toBeInTheDocument();
    expect(screen.getByText(/chi scrive il rapportino e da dove vengono le ore/)).toBeInTheDocument();
    expect(screen.queryByText("Le più cercate")).toBeNull();
  });

  it("gli accenti non contano: «attivita» trova «Registro attività»", async () => {
    await cerca("attivita");
    expect(await screen.findByText("Registro attività")).toBeInTheDocument();
  });

  it("«logo» porta al logo del Profilo aziendale e a Marchio e colori, non a «Catalogo render»", async () => {
    await cerca("logo");
    expect(await screen.findByText("Logo aziendale")).toBeInTheDocument();
    expect(screen.getByText("Marchio e colori")).toBeInTheDocument();
    expect(screen.queryByText("Catalogo render")).toBeNull();
  });

  it("senza risposta dice cosa provare", async () => {
    await cerca("zxqv");
    expect(await screen.findByText(/Nessun risultato\. Prova con un.altra parola/)).toBeInTheDocument();
    expect(screen.getByText(/«prezzo», «logo», «firma» o «fattura»/)).toBeInTheDocument();
  });

  it("Invio apre la prima voce, con l'àncora giusta", async () => {
    const campo = await cerca("prezzo a mano");
    await screen.findByText("Prezzo scritto a mano");
    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith("/azienda/impostazioni/margini#prezzo"));
  });

  it("i risultati hanno il nome del gruppo del menu, non un vocabolario a parte", async () => {
    await cerca("commercialista");
    await screen.findByText("Commercialista");
    // «Persone & Accessi» è il gruppo del menu
    expect(screen.getAllByText("Persone & Accessi").length).toBeGreaterThan(0);
    expect(screen.queryByText("Persone")).toBeNull();
  });
});

describe("la Fatturazione", () => {
  it("le voci dentro la Fatturazione compaiono solo se l'azienda fattura con Edilizia in Cloud", async () => {
    state.fatturazione = { isNative: false };
    await cerca("iban");
    await screen.findByText("Fornitori"); // l'IBAN del fornitore sì, quello dell'azienda no: fattura altrove
    expect(screen.queryByText("Fatturazione · Conto corrente e IBAN")).toBeNull();
    cleanup();
    state.fatturazione = { isNative: true };
    await cerca("iban");
    expect(await screen.findByText("Fatturazione · Conto corrente e IBAN")).toBeInTheDocument();
  });

  it("la voce apre la sezione giusta della Fatturazione", async () => {
    state.fatturazione = { isNative: true };
    await cerca("split payment");
    fireEvent.click(await screen.findByText("Fatturazione · IVA per cassa, split payment, bollo"));
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith("/azienda/impostazioni/fatturazione?tab=nativa&sezione=avanzate"),
    );
  });
});
