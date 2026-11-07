import { describe, expect, it, vi } from "vitest";
import { normalizeRenderStatus, isRenderStale, renderStatusLabel } from "@/lib/render/renderStatus";
import { classificaBozzeRender } from "@/lib/render/renderDrafts";
const mock = vi.hoisted(() => ({ eq: vi.fn(), inside: vi.fn(), select: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from } }));

describe("le bozze non sono generazioni interrotte", () => {
  it("un'analisi completata resta da configurare anche se risale a mesi prima", () => {
    expect(normalizeRenderStatus("analysis_done")).toBe("draft");
    expect(renderStatusLabel("analysis_done")).toBe("Da completare");
    expect(isRenderStale("analysis_done", "2020-01-01")).toBe(false);
    expect(isRenderStale("processing", "2020-01-01")).toBe(true);
  });
  it("distingue una foto caricata da una coda già avviata, leggendo soltanto l'azienda corrente", async () => {
    const query = { eq: mock.eq, in: mock.inside, select: mock.select };
    mock.from.mockReturnValue(query); mock.select.mockReturnValue(query); mock.eq.mockReturnValue(query);
    mock.inside.mockResolvedValue({ data: [{ session_id: "avviato" }], error: null });
    const rows = [{ id: "foto", status: "pending" }, { id: "avviato", status: "pending" }, { id: "finito", status: "completed" }];
    expect(await classificaBozzeRender(rows, "azienda-corrente")).toEqual([{ id: "foto", status: "draft" }, rows[1], rows[2]]);
    expect(mock.eq).toHaveBeenCalledWith("company_id", "azienda-corrente");
    expect(mock.inside).toHaveBeenCalledWith("session_id", ["foto", "avviato"]);
    mock.inside.mockResolvedValue({ data: null, error: { message: "registro non leggibile" } });
    expect(await classificaBozzeRender(rows, "azienda-corrente")).toEqual(rows);
  });
});
