import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TabPianoIndustriale } from "@/components/controllo-gestione/tabs/TabPianoIndustriale";
import { FilterBar, type CGFilters } from "@/components/controllo-gestione/FilterBar";
import type { PianoResult, PianoPeriodo } from "@/hooks/controlloGestione/usePianoIndustriale";

const state = vi.hoisted(() => ({ calls: vi.fn(), result: null as unknown as PianoResult }));
vi.mock("@/hooks/controlloGestione/useScenari", () => ({ useScenari: () => ({ data: [
  { id: "base-id", scenario: "base", orizzonte_anni: 1, is_default: true },
  { id: "aggressivo-id", scenario: "aggressivo", orizzonte_anni: 1, is_default: false },
  { id: "prudente-id", scenario: "prudente", orizzonte_anni: 1, is_default: false },
  { id: "custom-id", scenario: "Speciale", orizzonte_anni: 1, is_default: false },
], isLoading: false }) }));
vi.mock("@/hooks/controlloGestione/usePianoIndustriale", () => ({ usePianoIndustriale: (id: string | null) => {
  state.calls(id);
  return { data: state.result, isLoading: false, isError: false, refetch: vi.fn() };
} }));
vi.mock("@/components/controllo-gestione/ui/PianoChart", () => ({ PianoChart: (): null => null }));
vi.mock("@/components/controllo-gestione/ui/AssumptionEditor", () => ({ AssumptionEditor: ({ onResult }: { onResult: (r: PianoResult) => void }) => {
  const [changed, setChanged] = useState(false);
  return <button data-changed={changed} onClick={() => { setChanged(true); onResult(state.result); }}>Simula bozza</button>;
} }));

beforeEach(() => {
  state.calls.mockClear();
  const period: PianoPeriodo = { anno: 2025, t: 0, tipo: "consuntivo", ricavi: 1000, costi_var: 400, costi_fissi: 200, ebitda: 400, ammortamenti: 10, oneri_finanziari: 5, utile: 300, cespiti: 100, mezzi_propri: 200, debito_mlt: 50 };
  state.result = { meta: { company_id: "demo", scenario: "base", assumption_id: "base-id", anno_base: 2025, orizzonte: 1, tasso_debito_pct: 4, aliquota_imposte_pct: 28 }, periodi: [period, { ...period, anno: 2026, t: 1, tipo: "proiezione" }] };
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup() {
  function Harness() {
    const [filters, setFilters] = useState<CGFilters>({ anno: 2026, periodo: "annuale", mese: 1, scenarioId: null });
    return <><FilterBar value={filters} onChange={setFilters} showScenario showPeriodo={false} /><TabPianoIndustriale scenarioId={filters.scenarioId} onClearScenarioFilter={() => setFilters(prev => ({ ...prev, scenarioId: null }))} /></>;
  }
  render(<QueryClientProvider client={new QueryClient()}><Harness /></QueryClientProvider>);
}
async function choose(label: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Scenario piano" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: label }));
}
it("il menu applica anche gli scenari standard e i pulsanti riprendono il controllo", async () => {
  setup();
  await choose("aggressivo · 1 anni");
  await waitFor(() => expect(state.calls).toHaveBeenLastCalledWith("aggressivo-id"));
  expect(screen.getByRole("radio", { name: "Aggressivo" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("heading", { name: "Scenario aggressivo · 1 anni" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Prudente" }));
  await waitFor(() => expect(state.calls).toHaveBeenLastCalledWith("prudente-id"));
  expect(screen.getByRole("combobox", { name: "Scenario piano" })).toHaveTextContent("Predefinito");
});
it("uno scenario personalizzato non lascia selezionato Base e può tornare agli standard", async () => {
  setup();
  await choose("Speciale · 1 anni");
  expect(state.calls).toHaveBeenLastCalledWith("custom-id");
  expect(screen.getByRole("radio", { name: "Base" })).toHaveAttribute("aria-checked", "false");
  fireEvent.click(screen.getByRole("radio", { name: "Base" }));
  await waitFor(() => expect(state.calls).toHaveBeenLastCalledWith("base-id"));
  expect(screen.getByRole("heading", { name: "Scenario base · 1 anni" })).toBeInTheDocument();
});
it("il cambio dal menu azzera una simulazione dello scenario precedente", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Personalizza assunzioni" }));
  fireEvent.click(await screen.findByRole("button", { name: "Simula bozza" }));
  expect(screen.getByRole("heading", { name: "Simulazione personalizzata · 1 anni" })).toBeInTheDocument();
  await choose("aggressivo · 1 anni");
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Simulazione personalizzata · 1 anni" })).not.toBeInTheDocument());
  expect(screen.getByRole("heading", { name: "Scenario aggressivo · 1 anni" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Simula bozza" })).toHaveAttribute("data-changed", "false");
});
