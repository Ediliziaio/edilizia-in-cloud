import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";

const mocks = vi.hoisted(() => ({ invalidate: vi.fn(), from: vi.fn(), rows: [] as { id: string; title: string; status: string; priority: string }[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.rows }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useMutation: (config: { mutationFn: (arg: unknown) => Promise<unknown>; onSuccess: () => void }) => ({
    mutate: async (arg: unknown) => { await config.mutationFn(arg); config.onSuccess(); },
  }),
}));
vi.mock("@/components/tasks/TaskDialog", () => ({ TaskDialog: ({ open, onSaved }: { open: boolean; onSaved: () => void }) => open ? <button onClick={onSaved}>Simula salvataggio</button> : null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.rows = []; });

describe("Aggiornamento riepilogo da attività collegate (API simulate)", () => {
  it("aggiorna la prossima attività dopo il salvataggio nel Cantiere", () => {
    render(<LinkedTasks orderId="order" category="ordini" />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    fireEvent.click(screen.getByRole("button", { name: "Simula salvataggio" }));
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["order-next-task", "order"] });
  });
  it("aggiorna la testata anche quando si completa un'attività", async () => {
    mocks.rows = [{ id: "task", title: "Posa", status: "da_fare", priority: "normale" }];
    const query = { update: vi.fn(), eq: vi.fn() };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValueOnce(query).mockResolvedValueOnce({ error: null });
    mocks.from.mockReturnValue(query);
    render(<LinkedTasks orderId="order" category="ordini" />);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["order-next-task", "order"] }));
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ status: "completata" }));
  });
  it("non invalida riepiloghi commessa per task di altre entità", () => {
    render(<LinkedTasks stockItemId="stock" category="generale" />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    fireEvent.click(screen.getByRole("button", { name: "Simula salvataggio" }));
    expect(mocks.invalidate.mock.calls.some(([arg]) => arg.queryKey[0] === "order-next-task")).toBe(false);
  });
});
