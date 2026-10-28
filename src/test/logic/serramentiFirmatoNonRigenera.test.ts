import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SerramentoPdfPayload } from "@/hooks/useSerramentoPDF";
const mock = vi.hoisted(() => ({ signed: vi.fn() }));
vi.mock("@/lib/preventivi/pdfFirmatoPreventivo", () => ({ pdfFirmatoPreventivo: mock.signed }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { renderSerramentoBlob } from "@/hooks/useSerramentoPDF";
const input = () => ({ detail: { progetto: { id: "p1", company_id: "c1", stato: "accettato", firmato_il: "2026-10-26" } } }) as SerramentoPdfPayload;
beforeEach(() => mock.signed.mockReset());
describe("Serramenti: anteprima, download e condivisione dopo la firma", () => {
  it("restituisce gli stessi byte conservati senza leggere modelli, foto o prezzi nuovi", async () => {
    const blob = new Blob(["%PDF-1.7 firmato"]);
    mock.signed.mockResolvedValue({ blob, nomeFile: "firmato.pdf" });
    expect(await renderSerramentoBlob(input())).toBe(blob);
    expect(mock.signed).toHaveBeenCalledWith({ companyId: "c1", progettoId: "p1", tipo: "sr" });
  });
  it("se manca la copia firmata non ripiega su un preventivo rigenerato", async () => {
    mock.signed.mockResolvedValue(null);
    await expect(renderSerramentoBlob(input())).rejects.toThrow("senza rigenerare");
  });
});
