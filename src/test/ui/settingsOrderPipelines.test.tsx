import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SettingsOrderStatus from "@/pages/azienda/settings/SettingsOrderStatus";
import { setupRadixMenus, scegliNelMenu } from "@/test/helpers/radixMenus";

setupRadixMenus();

const state = vi.hoisted(() => ({
  salva: vi.fn(),
  solaLettura: false,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "renova" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditSettingsOrders: true, solaLettura: state.solaLettura }),
}));
vi.mock("@/components/orders/PlaybookEditorDialog", () => ({ PlaybookEditorDialog: (): null => null }));
vi.mock("@/components/settings/OrderStatusConfig", () => ({ OrderStatusConfig: () => <p>Stati della pipeline principale</p> }));
vi.mock("@/lib/orders/pipelineLocali", () => ({
  PRINCIPALE: "principale",
  usePipelineLocali: () => ({
    pipeline: [
      { id: "serramenti", nome: "Serramenti", versione: 3, fasi: [{ id: "firma-serramenti", name: "Contratto Firmato", color: "#2563eb" }] },
      { id: "fotovoltaico", nome: "Fotovoltaico", versione: 2, fasi: [{ id: "firma-fotovoltaico", name: "Contratto Firmato", color: "#2563eb" }] },
    ],
    salvaPipeline: state.salva,
  }),
}));

beforeEach(() => {
  vi.stubEnv("DEV", false);
  state.solaLettura = false;
  state.salva.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

it("modifica e salva il modello selezionato dalle impostazioni in produzione", async () => {
  render(<MemoryRouter><SettingsOrderStatus /></MemoryRouter>);
  expect(screen.getByText("Stati della pipeline principale")).toBeVisible();
  await scegliNelMenu("Pipeline commesse", "Fotovoltaico");
  fireEvent.click(screen.getByRole("button", { name: "Modifica stati" }));
  await scegliNelMenu("Usa un modello standard", "Fotovoltaico");
  expect(screen.getByRole("textbox", { name: "Nome fase 1" })).toHaveValue("Contratto Firmato");
  expect(screen.getByRole("textbox", { name: "Nome fase 6" })).toHaveValue("Attiva e Consegnata");
  fireEvent.click(screen.getByRole("button", { name: "Salva pipeline" }));
  await waitFor(() => expect(state.salva).toHaveBeenCalledOnce());
  expect(state.salva).toHaveBeenCalledWith(expect.objectContaining({
    id: "fotovoltaico", versione: 2,
    fasi: expect.arrayContaining([expect.objectContaining({ id: "firma-fotovoltaico", name: "Contratto Firmato" })]),
  }));
});

it("mostra gli stati senza azioni di modifica in sola lettura", async () => {
  state.solaLettura = true;
  render(<MemoryRouter><SettingsOrderStatus /></MemoryRouter>);
  await scegliNelMenu("Pipeline commesse", "Serramenti");
  expect(screen.getByText("Contratto Firmato")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Modifica stati" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Nuova pipeline" })).not.toBeInTheDocument();
});
