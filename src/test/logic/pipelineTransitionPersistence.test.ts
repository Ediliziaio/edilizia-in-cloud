import { beforeEach, describe, expect, it, vi } from "vitest";
import { savePipelineTransition } from "@/lib/api/pipelineTransitions";
import {
  planPipelineTransition,
  type PipelineDocument,
} from "@/lib/orders/pipelineTransitions";
const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
  filters: [] as unknown[][],
  readError: false,
  writeError: false,
  responses: 1,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let updating = false;
      const query = {
        select: () => query,
        eq: (...args: unknown[]) => {
          state.filters.push(args);
          return query;
        },
        is: (...args: unknown[]) => {
          state.filters.push(args);
          return query;
        },
        or: (...args: unknown[]) => {
          state.filters.push(args);
          return query;
        },
        update: (patch: Record<string, unknown>) => {
          updating = true;
          state.updates.push(patch);
          return query;
        },
        single: async () => ({
          data: updating ? (state.writeError ? null : { id: "1" }) : state.row,
          error: (updating ? state.writeError : state.readError)
            ? { message: "denied" }
            : null,
        }),
        then: (resolve: (value: unknown) => void) =>
          resolve({
            data:
              table === "supplier_rfq_suppliers"
                ? Array.from({ length: state.responses }, () => ({ id: "s" }))
                : [],
            error: null,
          }),
      };
      return query;
    },
  },
}));
vi.mock("@/lib/api/surveys", () => ({ logActivity: vi.fn() }));
const doc: PipelineDocument = {
  id: "1",
  label: "SOP-1",
  status: "draft",
  stage: "da_pianificare",
  href: "/detail",
};
beforeEach(() => {
  state.row = {
    id: "1",
    status: "draft",
    updated_at: "2026-10-26",
    client_signature_url: null,
    estimate_id: null,
    order_id: null,
  };
  state.updates = [];
  state.filters = [];
  state.readError = false;
  state.writeError = false;
  state.responses = 1;
});
describe("Salvataggio pipeline", () => {
  it("salva con perimetro aziendale, confronto stato e timestamp, e aggiorna le date del rilievo", async () => {
    await savePipelineTransition(
      planPipelineTransition("survey", doc, "in_corso")!,
      "co",
      "user",
    );
    expect(state.updates[0]).toMatchObject({ status: "in_progress" });
    expect(state.updates[0].started_at).toBeTruthy();
    expect(state.filters).toContainEqual(["company_id", "co"]);
    expect(state.filters).toContainEqual(["status", "draft"]);
    expect(state.filters).toContainEqual(["updated_at", "2026-10-26"]);
    expect(state.filters).toContainEqual(["client_signature_url", null]);
  });
  it("non scrive quando lo stato è cambiato, una firma è arrivata o RLS non restituisce la riga", async () => {
    for (const extra of [
      { status: "signed" },
      { client_signature_url: "firma.png" },
    ]) {
      state.row = { ...state.row, ...extra };
      await expect(
        savePipelineTransition(
          planPipelineTransition("survey", doc, "in_corso")!,
          "co",
          "user",
        ),
      ).rejects.toThrow();
    }
    state.readError = true;
    await expect(
      savePipelineTransition(
        planPipelineTransition("survey", doc, "in_corso")!,
        "co",
        "user",
      ),
    ).rejects.toThrow();
    expect(state.updates).toHaveLength(0);
  });
  it("se l’update non restituisce la riga segnala errore, mai successo fittizio", async () => {
    state.writeError = true;
    await expect(
      savePipelineTransition(
        planPipelineTransition("survey", doc, "completato")!,
        "co",
        "user",
      ),
    ).rejects.toThrow("Spostamento non salvato");
  });
  it("ricontrolla le risposte prima di portare un’offerta in valutazione", async () => {
    state.row = { id: "1", status: "inviata" };
    state.responses = 0;
    const plan = planPipelineTransition(
      "rfq",
      { ...doc, status: "inviata", stage: "inviata", responses: 1 },
      "in_valutazione",
    )!;
    await expect(savePipelineTransition(plan, "co", "user")).rejects.toThrow();
    expect(state.updates).toHaveLength(0);
  });
  it("verifica senza caricare merce e salva autore e data", async () => {
    state.row = {
      id: "1",
      stato: "ricevuto",
      has_damages: false,
      quantita_ricevuta: 2,
    };
    const plan = planPipelineTransition(
      "ddt",
      { ...doc, status: "ricevuto", stage: "ricevuto", quantity: 2 },
      "verificato",
    )!;
    await savePipelineTransition(plan, "co", "user");
    expect(state.updates[0]).toMatchObject({
      stato: "verificato",
      verified_by: "user",
    });
    expect(state.updates[0]).not.toHaveProperty("quantita_ricevuta");
    expect(state.filters).toContainEqual(["quantita_ricevuta", 2]);
  });
});
