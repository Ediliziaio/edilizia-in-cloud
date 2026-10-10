import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsFatturazioneUnified from "@/pages/azienda/settings/SettingsFatturazioneUnified";

const state = vi.hoisted(() => ({
  isNative: false, isChosen: true, isLoading: false, isMobile: false,
  mode: "external", chosenAt: null as string | null, switchMode: async () => true,
}));
vi.mock("@/contexts/BillingModeContext", () => ({ useBillingMode: () => state }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.isMobile }));
vi.mock("@/pages/azienda/settings/SettingsBilling", () => ({ default: () => <p>Provider</p> }));
vi.mock("@/pages/azienda/fatturazione/ImpostazioniFatturazione", () => ({ default: () => <><label htmlFor="billing-name">Ragione sociale</label><input id="billing-name" /><button>Salva configurazione</button></> }));
function View() { return <MemoryRouter initialEntries={["/azienda/impostazioni/fatturazione?tab=nativa"]}><SettingsFatturazioneUnified /></MemoryRouter>; }
beforeEach(() => { state.isNative = false; state.isChosen = true; state.isLoading = false; state.isMobile = false; });
afterEach(cleanup);
describe("Configurazione fatturazione: sola lettura reale", () => {
  it("modalità esterna disabilita campi, pulsanti e focus della configurazione nativa", async () => {
    render(<View />);
    const button = await screen.findByRole("button", { name: "Salva configurazione" });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText("Ragione sociale")).toBeDisabled();
    expect(button.closest("fieldset")).toHaveAttribute("inert");
  });
  it("rimuove il blocco quando la modalità diventa nativa", async () => {
    const { rerender } = render(<View />);
    await screen.findByRole("button", { name: "Salva configurazione" });
    state.isNative = true;
    rerender(<View />);
    const button = screen.getByRole("button", { name: "Salva configurazione" });
    expect(button).toBeEnabled();
    expect(button.closest("fieldset")).not.toHaveAttribute("inert");
  });
  it("in caricamento non permette modifiche", async () => {
    state.isNative = true; state.isLoading = true;
    render(<View />);
    expect(await screen.findByRole("button", { name: "Salva configurazione" })).toBeDisabled();
  });
  it("mantiene la regola mobile: configurazione da tablet o computer", () => {
    state.isMobile = true; render(<View />);
    expect(screen.getByText("Si imposta da computer o tablet")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Salva configurazione" })).toBeNull();
  });
});

function Vista({ percorso }: { percorso: string }) {
  return <MemoryRouter initialEntries={[percorso]}><SettingsFatturazioneUnified /></MemoryRouter>;
}
const schedaAperta = (nome: RegExp) => screen.getByRole("tab", { name: nome }).getAttribute("aria-selected") === "true";

describe("Fatturazione: la scelta «Come fatturi?» e la scheda che si apre", () => {
  it("la domanda sta in cima, sopra le schede", () => {
    render(<Vista percorso="/azienda/impostazioni/fatturazione" />);
    const domanda = screen.getByRole("heading", { name: "Come fatturi?" });
    const schede = screen.getByRole("tablist");
    expect(domanda.compareDocumentPosition(schede) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("senza una scheda nell'indirizzo si apre quella del modo in cui fatturi: con Edilizia in Cloud", async () => {
    state.isNative = true;
    render(<Vista percorso="/azienda/impostazioni/fatturazione" />);
    expect(schedaAperta(/Con Edilizia in Cloud/)).toBe(true);
    expect(await screen.findByRole("button", { name: "Salva configurazione" })).toBeEnabled();
  });

  it("senza una scheda nell'indirizzo si apre quella del modo in cui fatturi: con un altro programma", async () => {
    render(<Vista percorso="/azienda/impostazioni/fatturazione" />);
    expect(schedaAperta(/Con un altro programma/)).toBe(true);
    expect(await screen.findByText("Provider")).toBeInTheDocument();
  });

  it("la scheda scritta nell'indirizzo vince su quella del modo (la ricerca e i rimandi portano dove dicono)", () => {
    render(<Vista percorso="/azienda/impostazioni/fatturazione?tab=nativa" />);
    expect(schedaAperta(/Con Edilizia in Cloud/)).toBe(true);
  });

  it("chi non ha mai scelto lo legge nella scheda in sola lettura, e il pulsante porta alla scelta", async () => {
    state.isChosen = false;
    render(<Vista percorso="/azienda/impostazioni/fatturazione?tab=nativa" />);
    expect(screen.getByText("Per ora si possono solo guardare")).toBeInTheDocument();
    expect(screen.getByText(/Non hai ancora scelto come fatturi\. Queste impostazioni servono se scegli/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Scegli «Con Edilizia in Cloud»/ }));
    expect(document.activeElement?.id).toBe("come-fatturi-nativa");
  });

  it("chi fattura con un altro programma lo legge nella scheda in sola lettura", () => {
    render(<Vista percorso="/azienda/impostazioni/fatturazione?tab=nativa" />);
    expect(screen.getByText(/Oggi fatturi con un altro programma, quindi queste impostazioni non servono/)).toBeInTheDocument();
  });

  it("chi fattura con Edilizia in Cloud non vede l'avviso di sola lettura", () => {
    state.isNative = true;
    render(<Vista percorso="/azienda/impostazioni/fatturazione?tab=nativa" />);
    expect(screen.queryByText("Per ora si possono solo guardare")).toBeNull();
  });

  it("da telefono si dice come fatturi oggi, senza la scelta né le schede", () => {
    state.isMobile = true;
    state.isChosen = false;
    const { rerender } = render(<Vista percorso="/azienda/impostazioni/fatturazione" />);
    expect(screen.getByText("Non hai ancora scelto come fatturi.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Come fatturi?" })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    state.isChosen = true; state.isNative = true;
    rerender(<Vista percorso="/azienda/impostazioni/fatturazione" />);
    expect(screen.getByText("Oggi fatturi con Edilizia in Cloud.")).toBeInTheDocument();
    state.isNative = false;
    rerender(<Vista percorso="/azienda/impostazioni/fatturazione" />);
    expect(screen.getByText("Oggi fatturi con un altro programma.")).toBeInTheDocument();
  });

  it("dopo aver scelto la pagina porta alla scheda di quel modo", async () => {
    render(<Vista percorso="/azienda/impostazioni/fatturazione?tab=esterna" />);
    expect(schedaAperta(/Con un altro programma/)).toBe(true);
    // il pulsante della scelta e la scheda hanno lo stesso nome: la scelta è il pulsante, non la scheda
    fireEvent.click(screen.getByRole("button", { name: /Con Edilizia in Cloud/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Sì, fatturo con Edilizia in Cloud" }));
    await vi.waitFor(() => expect(schedaAperta(/Con Edilizia in Cloud/)).toBe(true));
  });

  it("mentre carica non dice «non hai ancora scelto»", () => {
    state.isMobile = true; state.isLoading = true; state.isChosen = false;
    render(<Vista percorso="/azienda/impostazioni/fatturazione" />);
    expect(screen.getByText("Si imposta da computer o tablet")).toBeInTheDocument();
    expect(screen.queryByText(/Non hai ancora scelto/)).toBeNull();
  });
});
