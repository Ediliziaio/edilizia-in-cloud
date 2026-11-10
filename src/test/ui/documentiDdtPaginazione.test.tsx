import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>,
  select: vi.fn(),
  failNext: false,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: "azienda" },
    profile: { company_id: "azienda" },
    user: { id: "utente" },
  }),
}));
vi.mock("@/lib/ddt/documentiPersistenti", () => ({
  documentiDb: {
    from: () => {
      let righe = [...m.rows],
        cursor = false;
      const q = {
        select: (columns: string) => {
          m.select(columns);
          return q;
        },
        eq: (k: string, v: string) => {
          righe = righe.filter((r) => r[k] === v);
          return q;
        },
        not: () => {
          righe = righe.filter(
            (r) => !["registered", "split"].includes(r.status),
          );
          return q;
        },
        order: () => q,
        or: (filter: string) => {
          cursor = true;
          const date = filter.match(/^created_at.lt.([^,]+)/)![1];
          const id = filter.match(/id.lt.([^)]+)/)![1];
          righe = righe.filter(
            (r) => r.created_at < date || (r.created_at === date && r.id < id),
          );
          return q;
        },
        range: async (start: number, end: number) => ({
          data:
            cursor && m.failNext
              ? null
              : righe
                  .sort(
                    (a, b) =>
                      b.created_at.localeCompare(a.created_at) ||
                      b.id.localeCompare(a.id),
                  )
                  .slice(start, end + 1),
          error: cursor && m.failNext ? new Error("rete assente") : null,
        }),
      };
      return q;
    },
  },
}));
import { useDocumentiDDT } from "@/hooks/useDocumentiDDT";
const clients: QueryClient[] = [];
const riga = (n: number, status = "review") => ({
  id: String(n).padStart(8, "0"),
  company_id: "azienda",
  created_by: "utente",
  status,
  created_at:
    status === "review" ? "2026-11-09T12:00:00Z" : "2026-11-10T12:00:00Z",
  result: { risposta_ai: "grande" },
  files: [],
});
beforeEach(() => {
  m.failNext = false;
  m.select.mockClear();
  m.rows = [
    ...Array.from({ length: 101 }, (_, i) => riga(i + 1)),
    ...Array.from({ length: 250 }, (_, i) => riga(i + 1000, "registered")),
    { ...riga(9999), company_id: "altra" },
  ];
});
afterEach(() => {
  for (const c of clients) c.clear();
  clients.length = 0;
});
const apri = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  return renderHook(() => useDocumentiDDT(false, undefined, false), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};
it("i 250 DDT già registrati non nascondono i documenti da controllare e la seconda pagina non perde righe con nuovi arrivi", async () => {
  const { result } = apri();
  await waitFor(() => expect(result.current.data).toHaveLength(100));
  expect(
    result.current.data!.every(
      (r) => r.status === "review" && r.company_id === "azienda",
    ),
  ).toBe(true);
  expect(m.select.mock.calls[0][0]).not.toContain("result");
  expect(result.current.hasNextPage).toBe(true);
  m.rows.push({ ...riga(999), created_at: "2026-11-11T12:00:00Z" });
  await act(() => result.current.fetchNextPage());
  await waitFor(() => expect(result.current.data).toHaveLength(101));
  expect(new Set(result.current.data!.map((r) => r.id)).size).toBe(101);
  expect(result.current.data!.some((r) => r.id === "00000001")).toBe(true);
  expect(result.current.hasNextPage).toBe(false);
});
it("un errore sulla pagina successiva conserva i documenti già disponibili e consente di riprovare", async () => {
  const { result } = apri();
  await waitFor(() => expect(result.current.data).toHaveLength(100));
  m.failNext = true;
  await act(() => result.current.fetchNextPage());
  expect(result.current.data).toHaveLength(100);
  await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true));
  m.failNext = false;
  await act(() => result.current.fetchNextPage());
  await waitFor(() => expect(result.current.data).toHaveLength(101));
  expect(result.current.isFetchNextPageError).toBe(false);
});
