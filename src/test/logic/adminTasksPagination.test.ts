import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminTasks, type AdminTask } from "@/lib/adminTasks";
const mocks = vi.hoisted(() => ({ range: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ order: () => ({ order: () => ({ range: mocks.range }) }) }) }) } }));
function task(id: string, status = "open"): AdminTask {
  return { id, title: id, status, priority: "medium", description: null, due_date: null, company_id: null, assigned_to: null, completed_at: null, created_at: "2026-10-15", task_type: null };
}
beforeEach(() => mocks.range.mockReset());
describe("Lettura comune delle attività", () => {
  it("non perde le attività oltre le prime 500 e include gli stati storici", async () => {
    mocks.range.mockResolvedValueOnce({ data: Array.from({length: 500}, (_, i) => task(String(i))), error: null }).mockResolvedValueOnce({ data: [task("ultima", "pending")], error: null });
    const result = await fetchAdminTasks();
    expect(result).toHaveLength(501);
    expect(result[500].status).toBe("open");
    expect(mocks.range).toHaveBeenNthCalledWith(2, 500, 999);
  });
  it("propaga un errore della seconda pagina senza restituire un elenco parziale", async () => {
    mocks.range.mockResolvedValueOnce({ data: Array.from({length: 500}, (_, i) => task(String(i))), error: null }).mockResolvedValueOnce({ data: null, error: new Error("lettura interrotta") });
    await expect(fetchAdminTasks()).rejects.toThrow("lettura interrotta");
  });
});
