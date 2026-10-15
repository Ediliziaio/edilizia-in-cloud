import { describe, expect, it } from "vitest";
import { adminTaskStatusPatch, matchesAdminTaskStatus, normalizeAdminTaskStatus } from "@/lib/adminTaskState";
describe("Attività storiche e gestione completa", () => {
  it("include open, pending e todo tra le attività da fare", () => {
    expect(["open", "pending", "todo", "in_progress", "completed"].filter(s => matchesAdminTaskStatus(s, "open"))).toEqual(["open", "pending", "todo"]);
    expect(normalizeAdminTaskStatus("pending")).toBe("open");
  });
  it("mantiene le attività in corso tra le aperte ed esclude le completate", () => {
    expect(["open", "pending", "in_progress", "completed"].filter(s => matchesAdminTaskStatus(s, "active"))).toEqual(["open", "pending", "in_progress"]);
    expect(matchesAdminTaskStatus("completed", "all")).toBe(true);
  });
  it("cancella la data di completamento quando si riapre un'attività", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(adminTaskStatusPatch("todo", now)).toEqual({ status: "open", completed_at: null, updated_at: now.toISOString() });
    expect(adminTaskStatusPatch("completed", now).completed_at).toBe(now.toISOString());
  });
});
