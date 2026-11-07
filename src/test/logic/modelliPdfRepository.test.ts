import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  calls: [] as { method: string; args: unknown[] }[],
  data: null as unknown,
  error: null as unknown,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (name: string) => {
      m.calls.push({ method: "from", args: [name] });
      const b: Record<string, unknown> = {};
      for (const method of ["select", "eq", "insert", "update"]) {
        b[method] = (...args: unknown[]) => {
          m.calls.push({ method, args });
          return b;
        };
      }
      b.single = async () => ({ data: m.data, error: m.error });
      b.maybeSingle = b.single;
      return b;
    },
  },
}));
import { salvaModelloPdf, leggiModelloPdf } from "@/lib/modelliPdf/repository";
import { modelloPdfStandard } from "@/lib/modelliPdf/catalogo";
beforeEach(() => {
  m.calls = [];
  m.error = null;
  m.data = {
    document_type: "materiali",
    updated_at: "nuova-versione",
    config: {},
  };
});
describe("Modelli PDF: isolamento aziendale e conflitti", () => {
  it("la lettura usa sempre l'azienda e il tipo richiesti", async () => {
    await leggiModelloPdf("azienda-b", "richiesta");
    expect(m.calls).toContainEqual({
      method: "eq",
      args: ["company_id", "azienda-b"],
    });
    expect(m.calls).toContainEqual({
      method: "eq",
      args: ["document_type", "richiesta"],
    });
  });
  it("l'aggiornamento è condizionato dalla versione letta", async () => {
    await salvaModelloPdf(
      "azienda-a",
      "materiali",
      modelloPdfStandard("materiali"),
      "vecchia-versione",
    );
    for (const args of [
      ["company_id", "azienda-a"],
      ["document_type", "materiali"],
      ["updated_at", "vecchia-versione"],
    ])
      expect(m.calls).toContainEqual({ method: "eq", args });
  });
  it("una versione superata non viene sovrascritta silenziosamente", async () => {
    m.data = null;
    m.error = { code: "PGRST116" };
    await expect(
      salvaModelloPdf(
        "azienda-a",
        "materiali",
        modelloPdfStandard("materiali"),
        "vecchia",
      ),
    ).rejects.toThrow("altro terminale");
  });
  it("la prima personalizzazione appartiene soltanto all'azienda corrente", async () => {
    await salvaModelloPdf(
      "azienda-a",
      "materiali",
      modelloPdfStandard("materiali"),
      null,
    );
    expect(m.calls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
      company_id: "azienda-a",
      document_type: "materiali",
    });
  });
});
