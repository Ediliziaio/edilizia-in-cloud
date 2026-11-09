import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Integration } from "@/types/integrations";

const { state } = vi.hoisted(() => ({ state: { selected: false, pageSelected: true, loading: false, purge: vi.fn().mockResolvedValue({}) } }));
vi.mock("@/hooks/useMetaIntegration", () => ({ useMetaIntegration: () => ({
  assets: [{ asset_type: "ad_account", selected: state.selected }], selectedPages: state.pageSelected ? [{}] : [], companyId: "cliente", isLoadingPages: state.loading,
  callProxy: state.purge, disconnect: { isPending: false },
}) }));
vi.mock("@/components/integrations/steps/PageSelectionStep", () => ({ PageSelectionStep: () => <p>Scelta risorse</p> }));
vi.mock("@/components/integrations/steps/AdAccountSelectionStep", () => ({ AdAccountSelectionStep: () => <p>Scelta account pubblicitario</p> }));
vi.mock("@/components/integrations/steps/ConnectionConfirmStep", () => ({ ConnectionConfirmStep: () => <p>Riepilogo risorse</p> }));
vi.mock("@/components/integrations/steps/FormListStep", () => ({ FormListStep: () => <p>Moduli lead</p> }));
vi.mock("@/components/integrations/steps/ActivationStep", () => ({ ActivationStep: () => <p>Attivazione completata</p> }));
vi.mock("@/components/integrations/steps/OAuthStep", () => ({ OAuthStep: (): null => null }));
vi.mock("@/components/integrations/steps/FieldMappingStep", () => ({ FieldMappingStep: (): null => null }));
vi.mock("@/components/integrations/IntegrationLogsPanel", () => ({ IntegrationLogsPanel: (): null => null }));
import { MetaIntegrationWizard } from "@/components/integrations/MetaIntegrationWizard";
afterEach(() => { cleanup(); state.selected = false; state.pageSelected = true; state.loading = false; state.purge.mockClear(); });
function setup() {
  const close = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><MetaIntegrationWizard open onOpenChange={close} onComplete={vi.fn()} integration={{ status: "connected", id: "integrazione" } as Integration} /></QueryClientProvider>);
  return close;
}
describe("Wizard Meta: account e pagine", () => {
  it("impedisce di avanzare senza selezionare una pagina", () => {
    state.pageSelected = false;
    setup();
    expect((screen.getByRole("button", { name: "Avanti" }) as HTMLButtonElement).disabled).toBe(true);
    expect(state.purge).not.toHaveBeenCalled();
  });
  it("mostra le pagine prima dell’account e permette di continuare senza conto", () => {
    setup();
    expect(screen.getByText("Scelta risorse")).toBeTruthy();
    expect(screen.queryByText("Scelta account pubblicitario")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByText("Scelta account pubblicitario")).toBeTruthy();
    expect(state.purge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continua senza account pubblicitario" }));
    expect(screen.getByText("Riepilogo risorse")).toBeTruthy();
    expect(state.purge).toHaveBeenCalledWith("purge-unselected");
  });
  it("permette di tornare dalle scelte dell’account alle pagine prima di confermare", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));
    expect(screen.getByText("Scelta risorse")).toBeTruthy();
    expect(state.purge).not.toHaveBeenCalled();
  });
  it("chiude dopo il riepilogo senza obbligare a configurare i lead", () => {
    state.selected = true;
    const close = setup();
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(state.purge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(state.purge).toHaveBeenCalledWith("purge-unselected");
    expect(screen.getByText("Riepilogo risorse")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salva e chiudi" }));
    expect(close).toHaveBeenCalledWith(false);
  });
  it("salta la mappatura vuota se non viene scelto un modulo", () => {
    state.selected = true;
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.click(screen.getByRole("button", { name: "Configura lead" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByText("Attivazione completata")).toBeTruthy();
  });
});
