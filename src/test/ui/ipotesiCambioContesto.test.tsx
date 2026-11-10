import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AssumptionEditor } from "@/components/controllo-gestione/ui/AssumptionEditor";
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/hooks/controlloGestione/cgRpc", () => ({ cgRpc: state.rpc }));
beforeEach(() => {
  vi.useFakeTimers();
  state.rpc.mockReset();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const result = vi.fn();
  function Harness() {
    const [scenario, setScenario] = useState("base-id");
    return <><button onClick={() => setScenario("aggressivo-id")}>Cambia scenario</button><AssumptionEditor key={scenario} scenarioId={scenario} onResult={result} /></>;
  }
  render(<QueryClientProvider client={new QueryClient()}><Harness /></QueryClientProvider>);
  return result;
}
it("non simula all'apertura e cancella un debounce del vecchio contesto", async () => {
  setup();
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(state.rpc).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("slider", { name: "Crescita dei ricavi ogni anno" }), { key: "ArrowRight" });
  fireEvent.click(screen.getByRole("button", { name: "Cambia scenario" }));
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(state.rpc).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Torna allo scenario" })).toBeNull();
});
it("un risultato in ritardo non applica la simulazione del contesto smontato", async () => {
  let finish!: (value: unknown) => void;
  state.rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const result = setup();
  fireEvent.keyDown(screen.getByRole("slider", { name: "Crescita dei ricavi ogni anno" }), { key: "ArrowRight" });
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(state.rpc).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Cambia scenario" }));
  await act(async () => { finish({ data: { meta: { assumption_id: "base-id" }, periodi: [] }, error: null }); await Promise.resolve(); });
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(result).not.toHaveBeenCalled();
  expect(state.rpc).toHaveBeenCalledTimes(1);
});
