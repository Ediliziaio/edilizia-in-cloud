import { beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ rpc: vi.fn(), open: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: s.rpc } }));
vi.mock("@/hooks/useFascicoloCantiere", () => ({ apriFileFascicolo: s.open }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewSicurezzaCantiere: true }),
}));
import {
  leggiDocumentiTecniciPos,
  apriDocumentoTecnicoPos,
} from "@/hooks/useDocumentiTecniciPos";
import { normalizzaDocumentoTecnico } from "../../../supabase/functions/_shared/posFontiTecniche";
const doc = () =>
  normalizzaDocumentoTecnico({
    id: "doc",
    order_id: "ordine",
    titolo: "TEST",
    impronta: "a".repeat(64),
  });
beforeEach(() => {
  s.rpc.mockReset();
  s.open.mockReset();
});
describe("RPC documenti tecnici per POS", () => {
  it("richiede l’ambito esatto e normalizza file non ancora ricevuti senza inventarli", async () => {
    s.rpc.mockResolvedValue({
      data: {
        company_id: "az",
        order_id: "ordine",
        documenti: [{ ...doc(), file_name: null, file_path: "NON ESPORRE" }],
      },
      error: null,
    });
    const q = await leggiDocumentiTecniciPos("az", "ordine");
    expect(s.rpc).toHaveBeenCalledWith("pos_documenti_tecnici_quadro", {
      _company: "az",
      _ordine: "ordine",
    });
    expect(q.documenti[0].file_name).toBe("");
    expect(JSON.stringify(q)).not.toContain("NON ESPORRE");
  });
  it.each([
    { company_id: "altra", order_id: "ordine", documenti: [] },
    { company_id: "az", order_id: "altra", documenti: [] },
    {
      company_id: "az",
      order_id: "ordine",
      documenti: [{ ...doc(), order_id: "altra" }],
    },
  ])("non accetta una risposta di un altro ambito: %j", async (data) => {
    s.rpc.mockResolvedValue({ data, error: null });
    await expect(leggiDocumentiTecniciPos("az", "ordine")).rejects.toThrow(
      "non disponibili",
    );
  });
  it("non trasforma un errore in assenza di documenti", async () => {
    s.rpc.mockResolvedValue({
      data: null,
      error: { message: "Non autorizzato" },
    });
    await expect(leggiDocumentiTecniciPos("az", "ordine")).rejects.toThrow(
      "Non autorizzato",
    );
  });
  it("apre solo il percorso risolto dalla RPC con l’impronta attesa", async () => {
    s.rpc.mockResolvedValue({ data: "az/doc/originale.pdf", error: null });
    await apriDocumentoTecnicoPos("az", "ordine", doc());
    expect(s.rpc).toHaveBeenCalledWith("pos_documento_tecnico_apri", {
      _company: "az",
      _ordine: "ordine",
      _documento: "doc",
      _impronta: "a".repeat(64),
    });
    expect(s.open).toHaveBeenCalledExactlyOnceWith("az/doc/originale.pdf");
  });
  it.each(["altra/doc/privato.pdf", "az/doc/../privato.pdf", null])(
    "non apre un percorso inatteso: %j",
    async (data) => {
      s.rpc.mockResolvedValue({ data, error: null });
      await expect(
        apriDocumentoTecnicoPos("az", "ordine", doc()),
      ).rejects.toThrow("non disponibile");
      expect(s.open).not.toHaveBeenCalled();
    },
  );
});
