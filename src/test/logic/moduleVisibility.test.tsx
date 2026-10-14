import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useModuliVisibilita } from "@/lib/moduli-vendita/useModuliVisibilita";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";

const mocks = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn(), eq: vi.fn(), success: vi.fn(), error: vi.fn(), companyId: "company-test" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: mocks.companyId }, user: { id: "user-test" } }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
let rows: { modulo_slug: string; visibile: boolean }[];
beforeEach(() => {
  vi.clearAllMocks(); rows = []; mocks.companyId = "company-test";
  mocks.eq.mockImplementation(async () => ({ data: rows, error: null }));
  mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eq }), upsert: mocks.upsert });
  mocks.upsert.mockImplementation(async (row) => {
    rows = [...rows.filter(r => r.modulo_slug !== row.modulo_slug), { modulo_slug: row.modulo_slug, visibile: row.visibile }];
    return { error: null };
  });
});
afterEach(cleanup);
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useModuliVisibilita(), { wrapper }) };
}
it("legge e salva esclusivamente la preferenza della company corrente", async () => {
  const { result } = setup(); await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(mocks.from).toHaveBeenCalledWith("company_modulo_preferenze");
  expect(mocks.eq).toHaveBeenCalledWith("company_id", "company-test");
  act(() => result.current.setModuloVisibile("serramenti", false));
  await waitFor(() => expect(result.current.isModuloVisibile("serramenti")).toBe(false));
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ company_id: "company-test", modulo_slug: "serramenti", visibile: false, updated_by: "user-test" }), { onConflict: "company_id,modulo_slug" });
  act(() => result.current.setModuloVisibile("serramenti", true));
  await waitFor(() => expect(result.current.isModuloVisibile("serramenti")).toBe(true));
});
it("aggiorna la cache condivisa appena il salvataggio riesce, prima del refetch", async () => {
  const { result, client } = setup(); await waitFor(() => expect(result.current.isLoading).toBe(false));
  mocks.eq.mockReturnValue(new Promise(() => {}));
  act(() => result.current.setModuloVisibile("bagni", false));
  await waitFor(() => expect(client.getQueryData<ReadonlyMap<string, boolean>>(["moduli-visibilita", "company-test", "aree-v2"])?.get("bagni")).toBe(false));
  expect(mocks.success).toHaveBeenCalled();
});
it("un errore di salvataggio non spegne il modulo e non mostra successo", async () => {
  mocks.upsert.mockResolvedValue({ error: new Error("Salvataggio negato") });
  const { result } = setup(); await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => result.current.setModuloVisibile("serramenti", false));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  expect(result.current.isModuloVisibile("serramenti")).toBe(true); expect(mocks.success).not.toHaveBeenCalled();
});

it.each(SALES_AREAS)("spegnere $title non modifica nessuna delle altre aree", async area => {
  const { result } = setup(); await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => result.current.setAreaVisibile(area, false));
  await waitFor(() => expect(result.current.isAreaVisibile(area)).toBe(false));
  for (const other of SALES_AREAS.filter(a => a.id !== area.id)) expect(result.current.isAreaVisibile(other)).toBe(true);
  expect(rows).toEqual([{ modulo_slug: `area:${area.id}`, visibile: false }]);
  act(() => result.current.setAreaVisibile(area, true));
  await waitFor(() => expect(result.current.isAreaVisibile(area)).toBe(true));
});

it("conserva le preferenze precedenti e riattiva solo l'area scelta", async () => {
  rows = [{ modulo_slug: "ristrutturazione", visibile: false }, { modulo_slug: "bagni", visibile: false }];
  const pergole = SALES_AREAS.find(a => a.id === "pergole")!;
  const pareti = SALES_AREAS.find(a => a.id === "pareti-soffitti")!;
  const { result } = setup(); await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.isAreaVisibile(pergole)).toBe(false);
  act(() => result.current.setAreaVisibile(pergole, true));
  await waitFor(() => expect(result.current.isAreaVisibile(pergole)).toBe(true));
  expect(result.current.isAreaVisibile(pareti)).toBe(false);
  expect(result.current.isModuloVisibile("bagni")).toBe(false);
  expect(result.current.isModuloVisibile("ristrutturazione")).toBe(true);
  expect(rows).toContainEqual({ modulo_slug: "ristrutturazione", visibile: false });
});

it("un errore di rilettura non azzera le preferenze già caricate", async () => {
  rows = [{ modulo_slug: "area:pergole", visibile: false }];
  const { result, client } = setup(); await waitFor(() => expect(result.current.isLoading).toBe(false));
  mocks.eq.mockResolvedValue({ data: null, error: { message: "Rete non disponibile" } });
  await act(async () => { await client.invalidateQueries({ queryKey: ["moduli-visibilita", "company-test"] }); });
  expect(result.current.isAreaVisibile(SALES_AREAS.find(a => a.id === "pergole")!)).toBe(false);
});

it("due clic rapidi non si sovrascrivono e finiscono nell'ordine del clic", async () => {
  const { result } = setup(); await waitFor(() => expect(result.current.isLoading).toBe(false));
  const pergole = SALES_AREAS.find(a => a.id === "pergole")!;
  const giardini = SALES_AREAS.find(a => a.id === "giardini")!;
  const save = mocks.upsert.getMockImplementation()!;
  let complete!: () => void;
  mocks.upsert.mockImplementationOnce(row => new Promise<void>(resolve => { complete = resolve; }).then(() => save(row)));
  act(() => {
    result.current.setAreaVisibile(pergole, false);
    result.current.setAreaVisibile(giardini, false);
    result.current.setAreaVisibile(pergole, true);
  });
  await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
  expect(result.current.isSaving).toBe(true);
  await act(async () => { complete(); });
  await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(result.current.isSaving).toBe(false));
  expect(result.current.isAreaVisibile(pergole)).toBe(true);
  expect(result.current.isAreaVisibile(giardini)).toBe(false);
  expect(result.current.isAreaVisibile(SALES_AREAS.find(a => a.id === "pavimenti")!)).toBe(true);
});

it("un cambio azienda durante il salvataggio non modifica la cache della nuova azienda", async () => {
  const { result, rerender, client } = setup(); await waitFor(() => expect(result.current.isLoading).toBe(false));
  let complete!: () => void;
  mocks.upsert.mockImplementationOnce(() => new Promise(resolve => { complete = () => resolve({ error: null }); }));
  const pergole = SALES_AREAS.find(a => a.id === "pergole")!;
  act(() => result.current.setAreaVisibile(pergole, false));
  await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
  mocks.companyId = "company-other"; rerender();
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => { complete(); });
  await waitFor(() => expect(client.getQueryData<ReadonlyMap<string, boolean>>(["moduli-visibilita", "company-test", "aree-v2"])?.get("area:pergole")).toBe(false));
  expect(result.current.isAreaVisibile(pergole)).toBe(true);
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ company_id: "company-test" }), expect.anything());
});

it("un errore sulla singola area non modifica quella né le altre", async () => {
  rows = [{ modulo_slug: "area:giardini", visibile: false }];
  mocks.upsert.mockResolvedValue({ error: new Error("Permesso negato") });
  const { result } = setup(); await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => result.current.setAreaVisibile(SALES_AREAS.find(a => a.id === "pergole")!, false));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  expect(result.current.isAreaVisibile(SALES_AREAS.find(a => a.id === "pergole")!)).toBe(true);
  expect(result.current.isAreaVisibile(SALES_AREAS.find(a => a.id === "giardini")!)).toBe(false);
  expect(mocks.success).not.toHaveBeenCalled();
});
