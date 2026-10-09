import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useComputoExtract } from "@/hooks/useComputoExtract";

const mocks = vi.hoisted(() => ({ savedStatus: "review", toast: vi.fn(), eq: vi.fn(), invoke: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" }, user: { id: "user" } }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast, success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) ?? Promise.resolve({ error: { message: "Gateway timeout" } }) },
  from: () => {
    let inserting = false;
    const chain = {
      insert: () => { inserting = true; return chain; },
      select: () => chain,
      eq: (...args: unknown[]) => { mocks.eq(...args); return chain; },
      order: async () => ({ data: [], error: null }),
      single: async () => ({ data: inserting ? { id: "upload" } : {
        extraction_status: mocks.savedStatus, extraction_error: mocks.savedStatus === "failed" ? "Documento illeggibile" : null,
      }, error: null }),
    };
    return chain;
  },
} }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("computo gateway recovery", () => {
  it.each(["review", "completed"])("preserves committed %s after gateway failure", async (savedStatus) => {
    mocks.savedStatus = savedStatus;
    mocks.toast.mockClear();
    const { result } = renderHook(() => useComputoExtract(), { wrapper });
    act(() => result.current.upload(new File(["pdf"], "computo.pdf")));
    await waitFor(() => expect(result.current.status).toBe(savedStatus));
    expect(result.current.error).toBeNull();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.eq).toHaveBeenCalledWith("company_id", "company");
  });
  it("retains the actual server extraction error", async () => {
    mocks.savedStatus = "failed";
    const { result } = renderHook(() => useComputoExtract(), { wrapper });
    act(() => result.current.upload(new File(["pdf"], "computo.pdf")));
    await waitFor(() => expect(result.current.error).toBe("Documento illeggibile"));
    expect(result.current.status).toBe("failed");
  });
  it("ignores an old request after reset", async () => {
    let finish!: (value: { error: { message: string } }) => void;
    mocks.invoke.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    mocks.toast.mockClear();
    const { result } = renderHook(() => useComputoExtract(), { wrapper });
    act(() => result.current.upload(new File(["pdf"], "computo.pdf")));
    await waitFor(() => expect(result.current.computoId).toBe("upload"));
    act(() => result.current.reset());
    await act(async () => { finish({ error: { message: "Late failure" } }); });
    expect(result.current.computoId).toBeNull();
    expect(result.current.status).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it("does not overwrite a reopened computo with the old request", async () => {
    let finish!: (value: { error: { message: string } }) => void;
    mocks.invoke.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useComputoExtract(), { wrapper });
    act(() => result.current.upload(new File(["pdf"], "computo.pdf")));
    await waitFor(() => expect(result.current.computoId).toBe("upload"));
    act(() => result.current.loadExistingComputo("other"));
    await act(async () => { finish({ error: { message: "Late failure" } }); });
    expect(result.current.computoId).toBe("other");
    expect(result.current.status).toBe("review");
    expect(result.current.error).toBeNull();
  });
});
