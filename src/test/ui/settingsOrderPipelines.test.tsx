import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SettingsOrderStatus from "@/pages/azienda/settings/SettingsOrderStatus";
import { setupRadixMenus, scegliNelMenu } from "@/test/helpers/radixMenus";
import { AZIENDA_RENOVA } from "@/lib/orders/pipelinePrincipale";

setupRadixMenus();

const state = vi.hoisted(() => ({
  salva: vi.fn(),
  solaLettura: false,
  azienda: "generica",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: state.azienda } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditSettingsOrders: true, solaLettura: state.solaLettura }),
}));
vi.mock("@/components/orders/PlaybookEditorDialog", () => ({ PlaybookEditorDialog: (): null => null }));
vi.mock("@/components/settings/OrderStatusConfig", () => ({ OrderStatusConfig: () => <p>Stati della pipeline principale</p> }));
vi.mock("@/lib/orders/pipelineLocali", () => ({
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
  state.azienda = "generica";
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
  await scegliNelMenu("Usa un modello standard", "Fotovoltaico");
  expect(screen.getByRole("textbox", { name: "Nome dello stato 1" })).toHaveValue("Contratto Firmato");
  expect(screen.getByRole("textbox", { name: "Nome dello stato 6" })).toHaveValue("Attiva e Consegnata");
  fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
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
  expect(screen.getByRole("textbox", { name: "Nome dello stato 1" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Salva modifiche" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Nuova pipeline" })).not.toBeInTheDocument();
});

it("apre Serramenti per Renova e offre solo le pipeline operative", async () => {
  state.azienda = AZIENDA_RENOVA;
  render(<MemoryRouter><SettingsOrderStatus /></MemoryRouter>);
  expect(screen.queryByText("Stati della pipeline principale")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Nome dello stato 1" })).toBeEnabled();
  fireEvent.click(screen.getByRole("combobox", { name: "Pipeline commesse" }));
  expect(await screen.findByRole("option", { name: "Fotovoltaico" })).toBeVisible();
  expect(screen.queryByRole("option", { name: "Principale" })).not.toBeInTheDocument();
});
