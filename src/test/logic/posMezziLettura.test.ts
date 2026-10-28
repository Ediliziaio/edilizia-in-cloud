import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc } }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewSicurezzaCantiere: true }),
}));
import { leggiMezziPos } from "@/hooks/useMezziPos";
const f = {
  mezzo_id: "11111111-1111-4111-8111-111111111111",
  fonte_id: "22222222-2222-4222-8222-222222222222",
  order_id: "ordine",
  nome: "TEST",
  fonte_tipo: "corrente",
  impronta: "a".repeat(64),
};
const q = () => ({
  company_id: "azienda",
  order_id: "ordine",
  fonti: [{ ...f }],
});
beforeEach(() => m.rpc.mockReset());
describe("Lettura attrezzature POS", () => {
  it("richiede azienda e commessa e riduce la risposta ai dati operativi", async () => {
    m.rpc.mockResolvedValue({
      data: {
        ...q(),
        note: "PRIVATE",
        fonti: [{ ...f, valore_acquisto: 999, file_path: "privato" }],
      },
      error: null,
    });
    const result = await leggiMezziPos("azienda", "ordine");
    expect(m.rpc).toHaveBeenCalledWith("pos_mezzi_quadro", {
      _company: "azienda",
      _ordine: "ordine",
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|999|privato/);
  });
  it.each([
    "azienda",
    "commessa",
    "riga",
    "tipo",
    "impronta",
    "duplicata",
    "limite",
  ])("rifiuta una risposta incoerente: %s", async (tipo) => {
    const a = q();
    if (tipo === "azienda") a.company_id = "altra";
    if (tipo === "commessa") a.order_id = "altra";
    if (tipo === "riga") a.fonti[0].order_id = "altra";
    if (tipo === "tipo") a.fonti[0].fonte_tipo = "inventata";
    if (tipo === "impronta") a.fonti[0].impronta = "mancante";
    if (tipo === "duplicata") a.fonti.push({ ...f });
    if (tipo === "limite")
      a.fonti = Array.from({ length: 501 }, () => ({ ...f }));
    m.rpc.mockResolvedValue({ data: a, error: null });
    await expect(leggiMezziPos("azienda", "ordine")).rejects.toThrow();
  });
  it("non trasforma un errore del server in un inventario vuoto", async () => {
    m.rpc.mockResolvedValue({
      data: null,
      error: { message: "Accesso negato" },
    });
    await expect(leggiMezziPos("azienda", "ordine")).rejects.toThrow(
      "Accesso negato",
    );
  });
});
