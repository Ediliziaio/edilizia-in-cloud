import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRetryDelivery, useUpdateWebhook } from "@/hooks/useWebhooks";

const db = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), update: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from, functions: { invoke: db.invoke } } }));
const open = <T,>(hook: () => T) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  return { invalidate, ...renderHook(hook, { wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }) };
};
beforeEach(() => {
  vi.clearAllMocks();
  const builder = { select: db.select, eq: db.eq, single: db.single, update: db.update };
  db.from.mockReturnValue(builder); db.select.mockReturnValue(builder); db.eq.mockReturnValue(builder); db.update.mockReturnValue(builder);
  db.single.mockResolvedValue({ data: { webhook_id: "w1", event_type: "contact.created", payload: { example: true } }, error: null });
  db.invoke.mockResolvedValue({ data: { status: "success", http_status: 200 }, error: null });
});
describe("Webhook: salvataggi e nuovi tentativi", () => {
  it("il rinvio mantiene la storia e verifica il risultato del server", async () => {
    const { result, invalidate } = open(() => useRetryDelivery("w1"));
    await act(async () => { await result.current.mutateAsync("d1"); });
    expect(db.eq).toHaveBeenCalledWith("webhook_id", "w1");
    expect(db.update).not.toHaveBeenCalled();
    expect(db.invoke).toHaveBeenCalledWith("send-webhook", { body: { webhook_id: "w1", event_type: "contact.created", payload: { example: true } } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["webhook-deliveries", "w1"] });
  });
  it("HTTP 200 della funzione non significa consegna riuscita se l'endpoint risponde 500", async () => {
    db.invoke.mockResolvedValue({ data: { status: "failed", http_status: 500 }, error: null });
    const { result, invalidate } = open(() => useRetryDelivery("w1"));
    await act(async () => { await expect(result.current.mutateAsync("d1")).rejects.toThrow("HTTP 500"); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["webhook-deliveries", "w1"] });
  });
  it("una risposta senza esito non viene dichiarata riuscita", async () => {
    db.invoke.mockResolvedValue({ data: null, error: null });
    const { result } = open(() => useRetryDelivery("w1"));
    await act(async () => { await expect(result.current.mutateAsync("d1")).rejects.toThrow("Invio non riuscito"); });
  });
  it("un invio non può essere riprovato senza webhook o con consegna non trovata", async () => {
    const empty = open(() => useRetryDelivery(null));
    await act(async () => { await expect(empty.result.current.mutateAsync("d1")).rejects.toThrow("Webhook richiesto"); });
    db.single.mockResolvedValue({ data: null, error: { message: "Riga non autorizzata" } });
    const scoped = open(() => useRetryDelivery("w1"));
    await act(async () => { await expect(scoped.result.current.mutateAsync("d1")).rejects.toThrow("Delivery non trovato"); });
    expect(db.invoke).not.toHaveBeenCalled();
  });
  it("zero righe modificate non equivale a un webhook salvato", async () => {
    db.single.mockResolvedValue({ data: null, error: { code: "PGRST116", message: "Nessuna riga modificata" } });
    const { result } = open(() => useUpdateWebhook("company-1"));
    await act(async () => { await expect(result.current.mutateAsync({ id: "w1", is_active: false })).rejects.toMatchObject({ code: "PGRST116" }); });
    expect(db.eq).toHaveBeenCalledWith("company_id", "company-1");
  });
});
