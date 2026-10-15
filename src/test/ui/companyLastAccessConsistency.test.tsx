import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCompanyLastActivity } from "@/hooks/useCompanyOverviewExtras";
import { queryKeys } from "@/lib/queryKeys";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup(cached?: Record<string, string | null>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cached) client.setQueryData(queryKeys.admin.companiesLastAccess, cached);
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { wrapper };
}
describe("Ultimo accesso comune a elenco e dettaglio", () => {
  it("riusa il dato dell'elenco senza sostituirlo con i soli profili diretti", () => {
    const { result } = renderHook(() => useCompanyLastActivity("company"), setup({ company: "2026-09-09T10:54:57Z" }));
    expect(result.current.data?.last_login_at).toBe("2026-09-09T10:54:57Z");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("legge la stessa RPC dell'elenco e seleziona solo l'azienda richiesta", async () => {
    rpc.mockResolvedValue({ data: [{ company_id: "other", last_access: "2026-10-15T10:00:00Z" }, { company_id: "company", last_access: "2026-09-09T10:54:57Z" }], error: null });
    const { result } = renderHook(() => useCompanyLastActivity("company"), setup());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.last_login_at).toBe("2026-09-09T10:54:57Z");
    expect(rpc).toHaveBeenCalledWith("get_company_last_access");
  });
  it("segnala gli errori senza farli passare per assenza di accessi", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("non disponibile") });
    const { result } = renderHook(() => useCompanyLastActivity("company"), setup());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
