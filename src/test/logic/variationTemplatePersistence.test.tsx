import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVariationTemplates } from "@/hooks/useVariationTemplates";
import { VARIATION_TEMPLATE_EXAMPLES } from "@/lib/orders/variationTemplates";
const mock = vi.hoisted(() => ({ allowed: true, from: vi.fn(), filters: vi.fn(), update: vi.fn(), insert: vi.fn(), receipt: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: false, canEditSettingsPricing: mock.allowed }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...args: unknown[]) => mock.from(...args) } }));
const id = "00000000-0000-4000-a000-000000000099";
const content = VARIATION_TEMPLATE_EXAMPLES[0];
const previous = { ...content, id, company_id: "company", revision: 3, is_active: true, created_at: "2026-10-14T08:00:00Z", updated_at: "2026-10-14T08:00:00Z" };
beforeEach(() => {
  vi.clearAllMocks(); mock.allowed = true;
  const chain = { eq: (...args: unknown[]) => { mock.filters(...args); return chain; }, select: () => chain, single: () => mock.receipt() };
  mock.from.mockReturnValue({ update: (value: unknown) => { mock.update(value); return chain; }, insert: (value: unknown) => { mock.insert(value); return chain; } });
  mock.receipt.mockResolvedValue({ data: { ...previous, revision: 4 }, error: null });
});
afterEach(cleanup);
function hook() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return renderHook(() => useVariationTemplates("company", false), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
describe("Salvataggio modelli con revisione e azienda", () => {
  it("aggiorna solo il modello e la revisione letta, con payload pubblico limitato", async () => {
    const { result } = hook(); await act(async () => { await result.current.save.mutateAsync({ content: previous, previous }); });
    expect(mock.filters.mock.calls).toEqual(expect.arrayContaining([["id", id], ["company_id", "company"], ["revision", 3], ["is_active", true]]));
    expect(mock.update.mock.calls[0][0]).toMatchObject({ revision: 4, name: content.name });
    expect(mock.update.mock.calls[0][0]).not.toHaveProperty("company_id"); expect(mock.update.mock.calls[0][0]).not.toHaveProperty("id");
  });
  it("una modifica simultanea senza ricevuta non diventa un successo", async () => {
    mock.receipt.mockResolvedValue({ data: null, error: { code: "PGRST116" } }); const { result } = hook();
    await act(async () => { await expect(result.current.save.mutateAsync({ content, previous })).rejects.toThrow("Salvataggio non confermato"); });
  });
  it("il permesso di modifica commessa da solo non permette di scrivere i modelli", async () => {
    mock.allowed = false; const { result } = hook();
    await act(async () => { await expect(result.current.save.mutateAsync({ content, creationId: id })).rejects.toThrow("Non puoi"); });
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("non aggiorna un modello di un'altra azienda", async () => {
    const { result } = hook(); await act(async () => { await expect(result.current.save.mutateAsync({ content, previous: { ...previous, company_id: "other" } })).rejects.toThrow("altra azienda"); });
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("una nuova bozza mantiene lo stesso identificativo quando si riprova, evitando duplicati", async () => {
    mock.receipt.mockResolvedValue({ data: null, error: { code: "NETWORK" } }); const { result } = hook();
    for (let i = 0; i < 2; i++) await act(async () => { await expect(result.current.save.mutateAsync({ content, creationId: id })).rejects.toThrow(); });
    expect(mock.insert.mock.calls.map(([payload]) => payload.id)).toEqual([id, id]);
  });
  it("l'archiviazione conserva il record e verifica revisione e ambito", async () => {
    mock.receipt.mockResolvedValue({ data: { id }, error: null }); const { result } = hook();
    await act(async () => { await result.current.archive.mutateAsync(previous); });
    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ is_active: false, revision: 4 }));
    expect(mock.filters.mock.calls).toContainEqual(["company_id", "company"]);
  });
});
