import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/portalLearningApi", () => ({ listAllPortalCourseEnrollments: api.list }));
import { useStatisticheIscrizioniCorsi } from "@/hooks/useStatisticheIscrizioniCorsi";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useStatisticheIscrizioniCorsi("azienda-demo", ["corso"]), { wrapper });
}
describe("stati delle statistiche formazione", () => {
  it("non espone zero prima che la lettura sia conclusa e distingue una lista realmente vuota", async () => {
    let resolve!: (rows: []) => void;
    api.list.mockImplementationOnce(() => new Promise<[]>((r) => { resolve = r; }));
    const { result } = setup();
    expect(result.current.metrics).toBeNull();
    await act(async () => resolve([]));
    await waitFor(() => expect(result.current.metrics?.get("corso")).toEqual({ enrolled: 0, completion: 0 }));
    expect(api.list).toHaveBeenCalledWith("azienda-demo");
  });
  it("nasconde il totale se la lettura fallisce e lo recupera con un nuovo tentativo", async () => {
    api.list.mockRejectedValueOnce(new Error("rete assente"));
    api.list.mockResolvedValueOnce([{ courseId: "corso", progressPercent: 50 }]);
    const { result } = setup();
    await waitFor(() => expect(result.current.query.isError).toBe(true));
    expect(result.current.metrics).toBeNull();
    await act(async () => { await result.current.query.refetch(); });
    await waitFor(() => expect(result.current.metrics?.get("corso")).toEqual({ enrolled: 1, completion: 50 }));
    expect(api.list).toHaveBeenCalledTimes(2);
  });
  it("non mantiene un totale apparentemente valido se l’aggiornamento successivo fallisce", async () => {
    api.list.mockResolvedValueOnce([{ courseId: "corso", progressPercent: 100 }]);
    api.list.mockRejectedValueOnce(new Error("pagina successiva non disponibile"));
    const { result } = setup();
    await waitFor(() => expect(result.current.metrics?.get("corso")).toEqual({ enrolled: 1, completion: 100 }));
    await act(async () => { await result.current.query.refetch(); });
    await waitFor(() => expect(result.current.query.isError).toBe(true));
    expect(result.current.metrics).toBeNull();
  });
});
