import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEliminaSquadra, useSalvaSquadra, useCollegaCalendarioSquadra, useSalvaCalendarLink } from "@/hooks/useCalendariLavori";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import { useCustomFieldFolders, useUpdateCustomFieldFolder, useDeleteCustomFieldFolder } from "@/hooks/useCustomFieldFolders";

const db = vi.hoisted(() => ({ companyId: "c1" as string | null, from: vi.fn(), eq: vi.fn(), single: vi.fn(), update: vi.fn(), remove: vi.fn(), upsert: vi.fn(), rpc: vi.fn(), error: null as { message: string } | null }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: db.companyId ? { id: db.companyId } : null }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => db.companyId }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from, rpc: db.rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
function open<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return renderHook(hook, { wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
beforeEach(() => {
  vi.clearAllMocks(); db.companyId = "c1"; db.error = null;
  const b = { select: vi.fn(), is: vi.fn(), eq: db.eq, order: vi.fn(), maybeSingle: vi.fn(), single: db.single, update: db.update, delete: db.remove, upsert: db.upsert,
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: db.error }).then(ok) };
  db.from.mockReturnValue(b);
  for (const fn of [b.select, b.is, b.order, b.maybeSingle, db.eq, db.update, db.remove, db.upsert]) fn.mockReturnValue(b);
  db.single.mockImplementation(async () => ({ data: db.error ? null : { id: "s1" }, error: db.error }));
});
describe("Calendari e modelli: persistenza protetta", () => {
  it("la modifica squadra verifica sia azienda che riga aggiornata", async () => {
    const { result } = open(useSalvaSquadra);
    await act(async () => { await result.current.mutateAsync({ id: "s1", name: "Interni", is_active: true, vat_rate: 22, kind: "interna" }); });
    expect(db.eq).toHaveBeenCalledWith("company_id", "c1"); expect(db.single).toHaveBeenCalledOnce();
  });
  it("eliminazione limitata all'azienda", async () => {
    const { result } = open(useEliminaSquadra);
    await act(async () => { await result.current.mutateAsync("s1"); });
    expect(db.eq).toHaveBeenCalledWith("company_id", "c1"); expect(db.single).toHaveBeenCalledOnce();
  });
  it("zero righe non risulta una squadra salvata", async () => {
    db.error = { message: "Nessuna riga" }; const { result } = open(useSalvaSquadra);
    await act(async () => { await expect(result.current.mutateAsync({ id: "s1", name: "Interni", is_active: true, vat_rate: 22, kind: "interna" })).rejects.toEqual(db.error); });
  });
  it("scollegamento scoped e sincronizzazione spenta", async () => {
    const { result } = open(useCollegaCalendarioSquadra);
    await act(async () => { await result.current.mutateAsync({ id: "s1", google_connection_id: null, google_calendar_id: null }); });
    expect(db.eq).toHaveBeenCalledWith("company_id", "c1");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ google_sync_enabled: false }));
  });
  it("senza azienda non scrive né scollega", async () => {
    db.companyId = null;
    const a = open(useEliminaSquadra); const b = open(useSalvaCalendarLink);
    await act(async () => {
      await expect(a.result.current.mutateAsync("s1")).rejects.toThrow("Azienda non disponibile");
      await expect(b.result.current.mutateAsync({ kind: "posa", google_connection_id: null, google_calendar_id: null })).rejects.toThrow("Azienda non disponibile");
    });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("errore lettura modelli esposto, non un falso elenco vuoto riuscito", async () => {
    db.error = { message: "Rete indisponibile" }; const { result } = open(useModelliFasi);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.disponibile).toBe(false); expect(db.rpc).not.toHaveBeenCalled();
  });
  it("senza azienda non chiama RPC dei modelli", async () => {
    db.companyId = null; const { result } = open(useModelliFasi);
    await act(async () => {
      await expect(result.current.elimina.mutateAsync("m1")).rejects.toThrow("Azienda non disponibile");
      await expect(result.current.inizializza.mutateAsync({ modelli: [], soloMancanti: true })).rejects.toThrow("Azienda non disponibile");
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("una cartella personalizzata si aggiorna solo nell'azienda corrente", async () => {
    const { result } = open(useUpdateCustomFieldFolder);
    await act(async () => { await result.current.mutateAsync({ id: "f1", name: "Impianti" }); });
    expect(db.eq).toHaveBeenCalledWith("company_id", "c1"); expect(db.single).toHaveBeenCalledOnce();
  });
  it("una cartella eliminata logicamente richiede conferma della riga", async () => {
    const { result } = open(useDeleteCustomFieldFolder);
    await act(async () => { await result.current.mutateAsync("f1"); });
    expect(db.eq).toHaveBeenCalledWith("company_id", "c1"); expect(db.single).toHaveBeenCalledOnce();
  });
  it("tabella cartelle assente: errore, non catalogo vuoto", async () => {
    db.error = { message: "relation marketing_custom_field_folders does not exist" };
    const { result } = open(useCustomFieldFolders);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
