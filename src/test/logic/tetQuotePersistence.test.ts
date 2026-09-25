import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { makeTetQuoteModel } from "@/lib/tetti/quoteModel";
import { createFullTettiTemplate } from "@/lib/moduli-vendita/fullTettiModules";
import type { TetTemplatePdf } from "@/types/tetti";

const db = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), missing: false }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "A" }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(), useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (options: { mutationFn: unknown }) => ({ mutateAsync: options.mutationFn }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    let value: Record<string, unknown> = {};
    const chain = {
      select: () => chain, eq: () => chain,
      insert: (input: Record<string, unknown>) => { value = input; db.insert(input); return chain; },
      update: (input: Record<string, unknown>) => { value = input; db.update(input); return chain; },
      maybeSingle: async () => ({ data: { default_iva_pct: 22 }, error: null as null }),
      single: async () => db.missing && value.modello_snapshot
        ? { data: null as null, error: { message: "column modello_snapshot does not exist" } }
        : { data: JSON.parse(JSON.stringify({ ...value, id: "quote" })), error: null as null },
    };
    return chain;
  },
} }));
import { useUpsertProgetto } from "@/hooks/useTettiProgetto";

const snapshotFor = (company: string) => makeTetQuoteModel(company, "ripasso", createFullTettiTemplate({ company_id: company } as TetTemplatePdf, "ripasso"));
beforeEach(() => { vi.clearAllMocks(); db.missing = false; });
describe("salvataggio Tetti — contratto su database simulato", () => {
  it("salva progetto e identità del modello nello stesso inserimento", async () => {
    const { result } = renderHook(useUpsertProgetto);
    const snapshot = snapshotFor("A");
    const created = await result.current.mutateAsync({ code: "TEST", cliente_nome: "Cliente", modello_snapshot: snapshot });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(created.modello_snapshot?.modelId).toBe("ripasso");
    expect(created.company_id).toBe("A");
    snapshot.template.cover_title = "Modifica successiva";
    expect(created.modello_snapshot?.template.cover_title).not.toBe("Modifica successiva");
    expect(db.insert.mock.calls[0][0]).not.toHaveProperty("computo");
  });
  it("non ripiega sul generale se la colonna non esiste", async () => {
    db.missing = true;
    const { result } = renderHook(useUpsertProgetto);
    await expect(result.current.mutateAsync({ code: "TEST", modello_snapshot: snapshotFor("A") })).rejects.toThrow(/modello_snapshot/);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
  it("rifiuta il modello di un'altra azienda prima di scrivere", async () => {
    const { result } = renderHook(useUpsertProgetto);
    await expect(result.current.mutateAsync({ code: "TEST", modello_snapshot: snapshotFor("B") })).rejects.toThrow();
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("l'autosalvataggio non sostituisce il modello", async () => {
    const { result } = renderHook(useUpsertProgetto);
    await result.current.mutateAsync({ id: "quote", cliente_nome: "Aggiornato", modello_snapshot: null as null });
    expect(db.update.mock.calls[0][0]).not.toHaveProperty("modello_snapshot");
    expect(db.update.mock.calls[0][0].cliente_nome).toBe("Aggiornato");
  });
  it("il preventivo generale non richiede la nuova colonna", async () => {
    db.missing = true;
    const { result } = renderHook(useUpsertProgetto);
    await result.current.mutateAsync({ code: "TEST", cliente_nome: "Generale" });
    expect(db.insert.mock.calls[0][0]).not.toHaveProperty("modello_snapshot");
  });
});
