import { describe, expect, it, vi } from "vitest";
import { quoteWriteVersion } from "@/lib/preventivi/quoteWriteVersion";
import { esitoUpdateConGuardia, isConflittoModifica } from "@/lib/concorrenza";
describe("versione restituita dal salvataggio atomico", () => {
  it("usa la versione della transazione, senza accettare una modifica successiva", async () => {
    const read = vi.fn().mockResolvedValue("colleague-v3");
    expect(await quoteWriteVersion({ updated_at: "own-v2" }, read)).toBe("own-v2");
    expect(read).not.toHaveBeenCalled();
  });
  it("rimane compatibile con la risposta RPC precedente", async () => {
    const read = vi.fn().mockResolvedValue("own-v2");
    expect(await quoteWriteVersion({ ok: true }, read)).toBe("own-v2");
    expect(read).toHaveBeenCalledOnce();
  });
  it("non inventa una versione se la verifica fallisce", async () => {
    await expect(quoteWriteVersion(null, async () => null)).rejects.toThrow("Ricarica");
    await expect(quoteWriteVersion(null, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
  });
  it("mantiene attiva la guardia contro i veri conflitti", () => {
    try { esitoUpdateConGuardia([], "preventivo"); expect.unreachable(); }
    catch (error) { expect(isConflittoModifica(error)).toBe(true); }
  });
});
