import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import StepImmobile from "@/pages/azienda/pavimenti/PavimentiWizard/StepImmobile";
import { interventoDelModulo } from "@/lib/moduli/modelloPreventivo";
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
afterEach(cleanup);
it("descrive l'area verde e salva superficie e vincoli nei campi esistenti", () => {
  const change = vi.fn();
  render(<StepImmobile form={{}} onChange={change} model={interventoDelModulo("pavimenti", "giardino")} />);
  expect(screen.getByText("Area interessata (m²)")).toBeTruthy();
  expect(screen.getByText("N. aree (facoltativo)")).toBeTruthy();
  expect(screen.getByText("Materiale di eventuali pavimentazioni (facoltativo)")).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText("80"), { target: { value: "120" } });
  expect(change).toHaveBeenCalledWith("immobile_superficie_mq", 120);
  fireEvent.change(screen.getByPlaceholderText(/Terreno, drenaggio/), { target: { value: "Conservare gli alberi esistenti" } });
  expect(change).toHaveBeenCalledWith("note", "Conservare gli alberi esistenti");
});
it("conserva i campi del pavimento nei preventivi senza modello verde", () => {
  render(<StepImmobile form={{}} onChange={vi.fn()} />);
  expect(screen.getByText("Materiale", { exact: true })).toBeTruthy();
  expect(screen.getByText("N. ambienti")).toBeTruthy();
});
