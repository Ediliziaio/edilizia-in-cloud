import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const state = vi.hoisted(() => ({ readonly: false, loading: false, save: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ solaLettura: state.readonly, isLoading: state.loading }) }));
vi.mock("@/hooks/useFeatureFlags", () => ({ useFeatureFlags: () => ({ isFeatureEnabled: () => true, isLoading: false }) }));
vi.mock("@/lib/dashboardBuilder/hooks", () => ({
 useDashboard: () => ({ data: undefined as undefined, isLoading: false }),
 useMetricCatalog: () => ({ data: [] as unknown[] }),
 useSaveDashboard: () => ({ mutateAsync: state.save, isPending: false }),
}));
vi.mock("@/lib/dashboardBuilder/useResolveLayoutLive", () => ({ useResolveLayoutLive: () => ({ widgets: {}, isFetching: false }) }));
vi.mock("@/components/dashboardBuilder/builder/WidgetPalette", () => ({ WidgetPalette: () => <div>Strumenti widget</div> }));
vi.mock("@/components/dashboardBuilder/builder/ConfigPanel", () => ({ ConfigPanel: (): null => null }));
vi.mock("@/components/dashboardBuilder/builder/BuilderGrid", () => ({ BuilderGrid: (): null => null }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
import DashboardBuilder from "@/pages/azienda/dashboards/DashboardBuilder";
beforeEach(() => {
 state.readonly = false; state.loading = false; state.save.mockReset().mockResolvedValue({ dashboard_id: "test", version: 1 });
 vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each(["readonly", "loading"] as const)("blocca Salva e CtrlS se i permessi sono %s", async (mode) => {
 state[mode] = true;
 render(<MemoryRouter><DashboardBuilder /></MemoryRouter>);
 expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
 fireEvent.keyDown(window, { key: "s", ctrlKey: true });
 await Promise.resolve();
 expect(state.save).not.toHaveBeenCalled();
});
it("mantiene il salvataggio del nuovo builder per l’editor", async () => {
 render(<MemoryRouter><DashboardBuilder /></MemoryRouter>);
 fireEvent.click(screen.getByRole("button", { name: "Salva" }));
 await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
 expect(state.save.mock.calls[0][0]).toMatchObject({ name: "Nuova dashboard", layout: { widgets: [] } });
});

it("blocca CtrlS ripetuto mentre il salvataggio precedente è in corso", async () => {
 let finish!: (value: { dashboard_id: string; version: number }) => void;
 state.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
 render(<MemoryRouter><DashboardBuilder /></MemoryRouter>);
 fireEvent.keyDown(window, { key: "s", ctrlKey: true });
 fireEvent.keyDown(window, { key: "s", ctrlKey: true });
 expect(state.save).toHaveBeenCalledOnce();
 await act(async () => { finish({ dashboard_id: "created", version: 1 }); });
 expect(state.save).toHaveBeenCalledOnce();
});
