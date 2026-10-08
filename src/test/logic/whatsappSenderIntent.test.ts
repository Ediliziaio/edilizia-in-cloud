import { describe, expect, it, vi } from "vitest";
import { numeroMittente } from "../../../supabase/functions/send-contact-message/numeroMittente";
function fixture(data: { id: string } | null, error: { message: string } | null = null) {
  const eq = vi.fn(); const order = vi.fn();
  const q = { select: () => q, eq: (...args: unknown[]) => { eq(...args); return q; }, not: () => q,
    is: () => q, order: (...args: unknown[]) => { order(...args); return q; }, limit: () => q,
    maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
  return { db: { from: () => q } as unknown as Parameters<typeof numeroMittente>[0], eq, order };
}
describe("WhatsApp sender selection is explicit and scoped", () => {
  it("uses only the selected active verified company number", async () => {
    const f = fixture({ id: "selected" });
    expect(await numeroMittente(f.db, "company", "selected")).toBe("selected");
    expect(f.eq.mock.calls).toEqual([["company_id", "company"], ["stato", "active"], ["webhook_verified", true], ["id", "selected"]]);
    expect(f.order).not.toHaveBeenCalled();
  });
  it("does not fall back when the selected number is revoked or belongs to another company", async () => {
    const f = fixture(null);
    await expect(numeroMittente(f.db, "company", "other")).rejects.toThrow("non è più disponibile");
    expect(f.order).not.toHaveBeenCalled();
  });
  it.each(["selected", null])("fails closed on sender lookup failure (%j)", async selected => {
    const f = fixture(null, { message: "offline" });
    await expect(numeroMittente(f.db, "company", selected)).rejects.toThrow("Nessun invio avviato");
  });
  it("retains legacy resolution only when no sender was explicitly chosen", async () => {
    const f = fixture(null);
    expect(await numeroMittente(f.db, "company", null)).toBeNull();
    expect(f.order).toHaveBeenCalledTimes(1);
  });
  it.each(["", " ", 5, {}])("rejects malformed explicit sender %j", async selected => {
    await expect(numeroMittente(fixture(null).db, "company", selected)).rejects.toThrow("non valido");
  });
});
