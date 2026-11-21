import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const path = "supabase/functions/outreach-dispatch/index.ts";
const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.ES2022, true);
const callPass = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "processCallQueue")!;
const compiled = ts.transpileModule(callPass.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const now = new Date("2026-11-20T10:00:00Z");

function fixture(failure: "insert" | "lost-insert-reply" | "sent-update" | "lost-sent-reply") {
  const row = { id: "message-1", status: "queued", enrollment_id: "enr-1", contact_id: "cont-1", node_id: "node-1" };
  const tasks = new Set<string>();
  const advanceEnrollment = vi.fn();
  const bindings = {
    BATCH: 10,
    PLATFORM_COMPANY: "company-1",
    TERMINAL_ENROLLMENT: new Set(["completed"]),
    planChannelSend: () => ({ ok: true, phone: "numero-di-prova" }),
    contactToVars: () => ({}),
    hashSeed: () => 1,
    renderTemplate: () => "Richiamare nel pomeriggio",
    advanceEnrollment,
  };
  const handle = new Function(...Object.keys(bindings), `${compiled}; return processCallQueue;`)(...Object.values(bindings));
  let fail = true;

  const from = (table: string) => {
    const filters = new Map<string, unknown>();
    let update: Record<string, unknown> | undefined;
    const write = async (task: { id?: string }) => {
      if (fail && failure === "insert") {
        fail = false;
        return { error: { message: "scrittura interrotta" } };
      }
      tasks.add(task.id ?? `legacy-${tasks.size}`);
      if (fail && failure === "lost-insert-reply") {
        fail = false;
        return { error: { message: "risposta persa dopo scrittura" } };
      }
      return { error: null };
    };
    const q = {
      select: () => q, order: () => q, lte: () => q, limit: () => q, in: () => q,
      maybeSingle: async () => ({ data: { id: row.id, status: row.status }, error: null as null }),
      eq: (key: string, value: unknown) => { filters.set(key, value); return q; },
      update: (patch: Record<string, unknown>) => { update = patch; return q; },
      insert: write,
      upsert: write,
      then: (resolve: (response: unknown) => void) => {
        if (table === "outreach_enrollments") return resolve({ data: [{ id: "enr-1", status: "active", sequence_id: "seq-1" }] });
        if (table === "marketing_contacts") return resolve({ data: [{ id: "cont-1", phone: "numero-di-prova" }] });
        if (filters.has("status") && filters.get("status") !== row.status) return resolve({ data: [], error: null });
        if (fail && failure === "sent-update" && update?.status === "sent") {
          fail = false;
          return resolve({ data: null, error: { message: "aggiornamento interrotto" } });
        }
        if (update) Object.assign(row, update);
        if (fail && failure === "lost-sent-reply" && update?.status === "sent") {
          fail = false;
          return resolve({ data: null, error: { message: "risposta persa dopo conferma" } });
        }
        return resolve({ data: [{ ...row }], error: null });
      },
    };
    return q;
  };
  const run = async () => {
    const result = { processed: 0, sent: 0, failed: 0, skipped: 0, deferred: 0 };
    await handle({
      from,
      rpc: (name: string, args: unknown) => {
        expect(name).toBe("outreach_coda_multicanale");
        expect(args).toMatchObject({ p_kind: "send", p_channels: ["call"] });
        return from("outreach_send_queue").eq("status", "queued");
      },
    }, now, result);
    return result;
  };
  return { run, row, tasks, advanceEnrollment };
}

describe("attività di richiamata della coda", () => {
  it.each(["insert", "lost-insert-reply", "sent-update"] as const)("riparte da %s senza perdere o duplicare la richiamata", async (failure) => {
    const f = fixture(failure);
    expect(await f.run()).toMatchObject({ failed: 1, sent: 0 });
    expect(f.row.status).toBe("queued");
    expect(f.advanceEnrollment).not.toHaveBeenCalled();
    expect(await f.run()).toMatchObject({ failed: 0, sent: 1 });
    expect(f.row.status).toBe("sent");
    expect(f.tasks.size).toBe(1);
    expect(f.advanceEnrollment).toHaveBeenCalledTimes(1);
  });

  it("rilegge la coda se viene persa la risposta alla conferma", async () => {
    const f = fixture("lost-sent-reply");
    expect(await f.run()).toMatchObject({ sent: 1, failed: 0 });
    expect(f.row.status).toBe("sent");
    expect(f.advanceEnrollment).toHaveBeenCalledTimes(1);
  });
});
