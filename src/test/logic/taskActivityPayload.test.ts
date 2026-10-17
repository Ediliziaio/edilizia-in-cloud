import { beforeEach, describe, expect, it, vi } from "vitest";
import { logTaskActivity } from "@/lib/taskActivityLog";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), warn: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/utils/logger", () => ({ logger: { warn: mocks.warn } }));

const context = { companyId: "azienda-locale", userId: "utente-locale", taskId: "attivita-locale", taskTitle: "Controllo contratto", eventType: "task_updated", description: "ha modificato la stima ore" };

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  mocks.warn.mockReset();
});

describe("registro attività: payload JSON e contesto invariati", () => {
  it("conserva decimali, null e dati annidati senza conversioni o arrotondamenti", async () => {
    const changes: NonNullable<Parameters<typeof logTaskActivity>[0]["changes"]> = { estimated_hours: 3.75, notes: null };
    const before = { estimated_hours: 2.5, details: { importo: 54.125, riferimenti: ["fase-1", null] } };
    const after = { ...before, ...changes };
    const metadata = { origin: "commessa", completed: false, count: 0 };
    await logTaskActivity({ ...context, changes, beforeSnapshot: before, afterSnapshot: after, metadata });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("log_activity", {
      p_company_id: context.companyId, p_actor_user_id: context.userId,
      p_target_table: "tasks", p_target_id: context.taskId, p_target_label: context.taskTitle,
      p_category: "modification", p_event_type: context.eventType, p_description: context.description,
      p_changes: changes, p_before_snapshot: before, p_after_snapshot: after,
      p_metadata: metadata, p_importance: "normal", p_source_function: "web:tasks",
    });
    expect(mocks.rpc.mock.calls[0][1].p_before_snapshot).toBe(before);
    expect(mocks.rpc.mock.calls[0][1].p_after_snapshot).toBe(after);
  });

  it("mantiene i valori predefiniti e non invia log senza azienda, utente o attività", async () => {
    await logTaskActivity(context);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_changes: null, p_before_snapshot: null, p_after_snapshot: null, p_metadata: {} });
    mocks.rpc.mockClear();
    await logTaskActivity({ ...context, companyId: null });
    await logTaskActivity({ ...context, userId: null });
    await logTaskActivity({ ...context, taskId: null });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("segnala un errore RPC con lo stesso comportamento non bloccante", async () => {
    const error = { message: "Errore di prova locale" };
    mocks.rpc.mockResolvedValue({ error });
    await expect(logTaskActivity(context)).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledWith("Task activity log non salvato", error);
  });
});
