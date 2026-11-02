import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_COME_OGGI } from "../../../supabase/functions/_shared/moduliCantiere";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
const { useModuloRapportino } = await import("@/hooks/useModuliCantiere");

const avvolgi = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
};

describe("useModuloRapportino", () => {
  beforeEach(() => rpc.mockReset());

  it("legge lo schema dell'azienda dalla commessa", async () => {
    rpc.mockResolvedValue({ data: { blocchi: { mezzi: false }, campi: [] }, error: null });
    const { wrapper } = avvolgi();
    const { result } = renderHook(() => useModuloRapportino("o1"), { wrapper });
    await waitFor(() => expect(result.current.schema.blocchi.mezzi).toBe(false));
    expect(rpc).toHaveBeenCalledWith("modulo_rapportino_per_ordine", { p_order_id: "o1" });
  });

  it("senza modello si lavora come oggi", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { wrapper } = avvolgi();
    const { result } = renderHook(() => useModuloRapportino("o1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.schema).toEqual(SCHEMA_COME_OGGI);
  });

  it.each(["PGRST202", "42883"])("con il database senza la funzione (%s) si lavora come oggi, senza errori", async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code } });
    const { wrapper } = avvolgi();
    const { result } = renderHook(() => useModuloRapportino("o1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.schema).toEqual(SCHEMA_COME_OGGI);
    expect(result.current.isError).toBe(false);
  });

  it("con un altro errore non si blocca il cantiere, e la risposta non resta in memoria", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "500" } });
    const { qc, wrapper } = avvolgi();
    const { result } = renderHook(() => useModuloRapportino("o1"), { wrapper });
    // Il modulo riprova una volta prima di arrendersi.
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 4000 });
    expect(result.current.schema).toEqual(SCHEMA_COME_OGGI);
    expect(qc.getQueryData(["modulo-rapportino", "o1"])).toBeUndefined();
  });

  it("senza commessa non chiede nulla", () => {
    const { wrapper } = avvolgi();
    const { result } = renderHook(() => useModuloRapportino(undefined), { wrapper });
    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.schema).toEqual(SCHEMA_COME_OGGI);
  });
});
