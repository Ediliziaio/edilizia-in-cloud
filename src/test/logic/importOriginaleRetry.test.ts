import { expect, it, vi } from "vitest";
import { salvaLavoroConRate, type ScritturaLavoro } from "@/lib/appalto/creaLavoro";
const m = vi.hoisted(() => ({ collega: vi.fn() }));
vi.mock("@/lib/orders/documentImportAi", () => ({ collegaOriginaleAi: m.collega }));
it("originale non collegato dopo la creazione: il retry completa la stessa richiesta e lo stesso ordine", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { success: true, id: "ordine-unico" } });
  const scrittura: ScritturaLavoro = { ordine: { id: "richiesta-unica", company_id: "demo", created_by: "utente" }, rate: [], documento: { bucket: "order-attachments", path: "demo/ai-contratti/file.pdf", name: "file.pdf", mime: "application/pdf" } };
  m.collega.mockRejectedValueOnce(new Error("Originale ancora da collegare")).mockResolvedValueOnce(undefined);
  await expect(salvaLavoroConRate({ rpc }, scrittura)).rejects.toThrow("Originale");
  await expect(salvaLavoroConRate({ rpc }, scrittura)).resolves.toBe("ordine-unico");
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]); expect(m.collega.mock.calls[0].slice(1)).toEqual(["ordine-unico", "demo", "utente", scrittura.documento]);
});
