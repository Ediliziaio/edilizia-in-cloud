import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useModuliVisibilita } from "@/lib/moduli-vendita/useModuliVisibilita";

const mocks = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn(), eq: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-test" }, user: { id: "user-test" } }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
let rows: { modulo_slug: string; visibile: boolean }[];
beforeEach(() => {
  vi.clearAllMocks(); rows = [];
  mocks.eq.mockImplementation(async () => ({ data: rows, error: null }));
  mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eq }), upsert: mocks.upsert });
  mocks.upsert.mockImplementation(async (row) => { rows = [{ modulo_slug: row.modulo_slug, visibile: row.visibile }]; return { error: null }; });
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
  await waitFor(() => expect(client.getQueryData<Set<string>>(["moduli-visibilita", "company-test"])?.has("bagni")).toBe(true));
  expect(mocks.success).toHaveBeenCalled();
});
it("un errore di salvataggio non spegne il modulo e non mostra successo", async () => {
  mocks.upsert.mockResolvedValue({ error: new Error("Salvataggio negato") });
  const { result } = setup(); await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => result.current.setModuloVisibile("serramenti", false));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  expect(result.current.isModuloVisibile("serramenti")).toBe(true); expect(mocks.success).not.toHaveBeenCalled();
});
