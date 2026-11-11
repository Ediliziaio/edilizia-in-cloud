import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
const state = vi.hoisted(() => ({ guard: vi.fn(), from: vi.fn(), stages: [
  { id: "fase-1", name: "Primo contatto", position: 10, auto_status: null as null, win_probability: null, stalled_threshold_days: 14 },
  { id: "fase-2", name: "Offerta", position: 20, auto_status: null as null, win_probability: 50, stalled_threshold_days: 14 },
] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: false, canEditSettingsCustomization: true }) }));
vi.mock("@/hooks/useSettingsDraftGuard", () => ({ useSettingsDraftGuard: state.guard }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: state.stages, isLoading: false, isError: false, refetch: vi.fn() }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
import { PipelineStagesConfig } from "@/components/settings/PipelineStagesConfig";
beforeEach(() => { state.guard.mockClear(); state.from.mockClear(); });
afterEach(cleanup);
function setup() { render(<PipelineStagesConfig pipelineId="pipeline-demo" pipelineName="Pipeline demo" />); }
it("aggiungere e togliere una fase locale ripristina lo stato pulito, anche con posizioni non consecutive", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi una fase" }));
  expect(screen.getByRole("button", { name: "Salva le fasi" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Elimina la fase «Nuova fase»" }));
  expect(screen.queryByRole("button", { name: "Salva le fasi" })).not.toBeInTheDocument();
  expect(state.guard).toHaveBeenLastCalledWith(false);
  expect(state.from).not.toHaveBeenCalled();
});
it("annulla la bozza e ripristina nome e ordine senza scrivere sul server", () => {
  setup();
  fireEvent.change(screen.getByRole("textbox", { name: "Nome della fase 1" }), { target: { value: "Nome provvisorio" } });
  fireEvent.click(screen.getByRole("button", { name: "Sposta «Nome provvisorio» più in basso" }));
  fireEvent.click(screen.getByRole("button", { name: "Annulla modifiche" }));
  expect(screen.getByRole("textbox", { name: "Nome della fase 1" })).toHaveValue("Primo contatto");
  expect(screen.getByRole("textbox", { name: "Nome della fase 2" })).toHaveValue("Offerta");
  expect(screen.getByRole("button", { name: "Aggiungi una fase" })).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Salva le fasi" })).not.toBeInTheDocument();
  expect(state.guard).toHaveBeenLastCalledWith(false);
  expect(state.from).not.toHaveBeenCalled();
});
