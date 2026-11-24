import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TecnicoDalCommerciale } from "@/components/sopralluoghi/TecnicoDalCommerciale";
import type { SurveyRow } from "@/types/surveys";

/** Dal sopralluogo commerciale al rilievo tecnico (piano sopralluoghi, lotto 2). */
const s = vi.hoisted(() => ({
  navigate: vi.fn(), crea: vi.fn(), esistente: null as null | { id: string; code: string },
  permessi: { canViewSopralluoghi: true, solaLettura: false },
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => s.navigate }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => s.permessi }));
vi.mock("@/lib/api/surveys", () => ({ tecnicoDaCommerciale: async (id: string) => { s.crea(id); return "tec-1"; } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ enabled }: { enabled: boolean }) => ({ data: enabled ? s.esistente : undefined, isLoading: false }),
  useMutation: ({ mutationFn, onSuccess }: { mutationFn: () => Promise<string>; onSuccess: (id: string) => void }) => ({
    isPending: false, mutate: () => { void mutationFn().then(onSuccess); },
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const rilievo = (patch: Partial<SurveyRow & { origine_id: string | null }>) => ({ id: "com-1", tipo: "commerciale", origine_id: null, ...patch }) as SurveyRow & { origine_id: string | null };
beforeEach(() => { s.navigate.mockClear(); s.crea.mockClear(); s.esistente = null; s.permessi = { canViewSopralluoghi: true, solaLettura: false }; });
afterEach(cleanup);

it("commerciale senza tecnico: lo crea e lo apre", async () => {
  render(<TecnicoDalCommerciale survey={rilievo({})} />);
  fireEvent.click(screen.getByRole("button", { name: "Crea il rilievo tecnico" }));
  await waitFor(() => expect(s.navigate).toHaveBeenCalledWith("/azienda/sopralluoghi/tec-1"));
  expect(s.crea).toHaveBeenCalledWith("com-1");
});

it("commerciale col tecnico già fatto: lo apre, non ne crea un altro", () => {
  s.esistente = { id: "tec-9", code: "SOP-9" };
  render(<TecnicoDalCommerciale survey={rilievo({})} />);
  fireEvent.click(screen.getByRole("button", { name: "Apri il rilievo tecnico SOP-9" }));
  expect(s.navigate).toHaveBeenCalledWith("/azienda/sopralluoghi/tec-9");
  expect(s.crea).not.toHaveBeenCalled();
});

it("il tecnico nato da un commerciale riporta al commerciale; un tecnico qualunque non mostra niente", () => {
  const { unmount } = render(<TecnicoDalCommerciale survey={rilievo({ id: "t", tipo: "tecnico", origine_id: "com-1" })} />);
  fireEvent.click(screen.getByRole("button", { name: "Apri il commerciale" }));
  expect(s.navigate).toHaveBeenCalledWith("/azienda/sopralluoghi/com-1");
  unmount();
  const { container } = render(<TecnicoDalCommerciale survey={rilievo({ id: "t2", tipo: "tecnico" })} />);
  expect(container.textContent).toBe("");
});

it("in sola lettura non si crea", () => {
  s.permessi = { canViewSopralluoghi: true, solaLettura: true };
  render(<TecnicoDalCommerciale survey={rilievo({})} />);
  expect(screen.queryByRole("button", { name: "Crea il rilievo tecnico" })).toBeNull();
});
