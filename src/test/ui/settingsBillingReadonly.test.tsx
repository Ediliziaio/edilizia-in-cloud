import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsFatturazioneUnified from "@/pages/azienda/settings/SettingsFatturazioneUnified";

const state = vi.hoisted(() => ({ isNative: false, isLoading: false, isMobile: false }));
vi.mock("@/contexts/BillingModeContext", () => ({ useBillingMode: () => state }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.isMobile }));
vi.mock("@/pages/azienda/settings/SettingsBilling", () => ({ default: () => <p>Provider</p> }));
vi.mock("@/pages/azienda/fatturazione/ImpostazioniFatturazione", () => ({ default: () => <><label htmlFor="billing-name">Ragione sociale</label><input id="billing-name" /><button>Salva configurazione</button></> }));
function View() { return <MemoryRouter initialEntries={["/azienda/impostazioni/fatturazione?tab=nativa"]}><SettingsFatturazioneUnified /></MemoryRouter>; }
beforeEach(() => { state.isNative = false; state.isLoading = false; state.isMobile = false; });
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
