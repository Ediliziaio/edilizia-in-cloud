import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRiordinaCartelle, useSalvaCartella } from "@/hooks/useCartelleDocumenti";
import { useAddLossReason, useDeleteLossReason, useLossReasons, useRenameLossReason } from "@/hooks/useLossReasons";

const db = vi.hoisted(() => ({ companyId: "company-1" as string | null, from: vi.fn(), update: vi.fn(), insert: vi.fn(), remove: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), single: vi.fn(), rpc: vi.fn(), error: null as { message: string; code?: string } | null }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => db.companyId }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from, rpc: db.rpc } }));
const open = <T,>(hook: () => T) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...renderHook(hook, { wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }) };
};
beforeEach(() => {
  vi.clearAllMocks(); db.companyId = "company-1"; db.error = null;
  const builder = {
    select: db.select, eq: db.eq, order: db.order, update: db.update, insert: db.insert, delete: db.remove, limit: db.limit, single: db.single,
    then: (resolve: (value: { data: unknown[]; error: typeof db.error }) => unknown) => Promise.resolve({ data: [], error: db.error }).then(resolve),
  };
  db.from.mockReturnValue(builder); db.select.mockReturnValue(builder); db.eq.mockReturnValue(builder); db.order.mockReturnValue(builder);
  db.update.mockReturnValue(builder); db.remove.mockReturnValue(builder); db.limit.mockReturnValue(builder);
  db.single.mockImplementation(async () => ({ data: db.error ? null : { id: "f1" }, error: db.error }));
  db.insert.mockImplementation(async () => ({ error: db.error }));
});
describe("Persistenza impostazioni: ambito azienda e fallimenti", () => {
  it("la modifica della cartella è limitata all'azienda e richiede una riga aggiornata", async () => {
    const { result } = open(useSalvaCartella);
    await act(async () => { await result.current.mutateAsync({ id: "f1", nome: "  Contratti firmati  " }); });
    expect(db.eq).toHaveBeenCalledWith("id", "f1");
    expect(db.eq).toHaveBeenCalledWith("company_id", "company-1");
    expect(db.update).toHaveBeenCalledWith({ nome: "Contratti firmati" });
    expect(db.single).toHaveBeenCalledOnce();
  });
  it("zero righe aggiornate non è un salvataggio riuscito", async () => {
    db.error = { code: "PGRST116", message: "Nessuna riga aggiornata" };
    const { result } = open(useSalvaCartella);
    await act(async () => { await expect(result.current.mutateAsync({ id: "f1", nome: "Nuova" })).rejects.toThrow("Nessuna riga"); });
  });
  it("senza azienda non scrive cartelle né le riordina", async () => {
    db.companyId = null;
    const first = open(useSalvaCartella); const second = open(useRiordinaCartelle);
    await act(async () => {
      await expect(first.result.current.mutateAsync({ nome: "Contratti" })).rejects.toThrow("Contesto azienda mancante");
      await expect(second.result.current.mutateAsync(["f1"])).rejects.toThrow("Contesto azienda mancante");
    });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("un riordino fallito ripristina la cache precedente", async () => {
    const { result, client } = open(useRiordinaCartelle);
    const folders = [{ id: "f1", posizione: 1 }, { id: "f2", posizione: 2 }];
    client.setQueryData(["cartelle-documenti", "company-1"], folders);
    db.error = { message: "Riordino rifiutato" };
    await act(async () => { await expect(result.current.mutateAsync(["f2", "f1"])).rejects.toThrow("Riordino rifiutato"); });
    expect(client.getQueryData(["cartelle-documenti", "company-1"])).toEqual(folders);
    expect(db.eq.mock.calls.filter(call => call[0] === "company_id")).toHaveLength(2);
  });
  it("i motivi standard rimangono disponibili, ma l'errore è esposto", async () => {
    db.error = { message: "Lettura rifiutata" };
    const { result } = open(useLossReasons);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.motivi.length).toBe(7);
    expect(result.current.motivi.every(reason => reason.predefinito)).toBe(true);
  });
  it("non inserisce un motivo se non riesce a leggere le posizioni", async () => {
    db.error = { message: "Lettura posizioni fallita" };
    const { result } = open(useAddLossReason);
    await act(async () => { await expect(result.current.mutateAsync("Misure impossibili")).rejects.toEqual(db.error); });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("la rimozione di un motivo richiede azienda e conferma della riga", async () => {
    const { result } = open(useDeleteLossReason);
    await act(async () => { await result.current.mutateAsync("r1"); });
    expect(db.eq).toHaveBeenCalledWith("id", "r1");
    expect(db.eq).toHaveBeenCalledWith("company_id", "company-1");
    expect(db.single).toHaveBeenCalledOnce();
  });
  it("senza azienda non rinomina né elimina motivi", async () => {
    db.companyId = null;
    const first = open(useRenameLossReason); const second = open(useDeleteLossReason);
    await act(async () => {
      await expect(first.result.current.mutateAsync({ id: "r1", label: "Nuovo nome" })).rejects.toThrow("Contesto azienda mancante");
      await expect(second.result.current.mutateAsync("r1")).rejects.toThrow("Contesto azienda mancante");
    });
    expect(db.rpc).not.toHaveBeenCalled(); expect(db.from).not.toHaveBeenCalled();
  });
});
