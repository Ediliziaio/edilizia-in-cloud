import { webcrypto } from "node:crypto";
import { beforeEach, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const s = vi.hoisted(() => ({
  failMetadata: false,
  failCleanup: false,
  readonly: false,
  upload: vi.fn(),
  remove: vi.fn(),
  signed: vi.fn(),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "A",
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: true, solaLettura: s.readonly }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    storage: {
      from: () => ({
        upload: s.upload,
        remove: s.remove,
        createSignedUrl: s.signed,
      }),
    },
    from: (table: string) => {
      let insert = false;
      const response = () => ({
        data: insert
          ? null
          : table === "supplier_contracts"
            ? [{ id: "C" }]
            : table === "supplier_relations"
              ? null
              : [],
        error:
          insert && s.failMetadata ? { message: "metadata rejected" } : null,
      });
      const b = {
        select: () => b,
        eq: () => b,
        order: () => b,
        range: () => b,
        maybeSingle: () => b,
        insert: () => {
          insert = true;
          return b;
        },
        then: (resolve: (value: ReturnType<typeof response>) => unknown) =>
          Promise.resolve(response()).then(resolve),
      };
      return b;
    },
  },
}));
import { useSupplierWorkspace } from "@/hooks/useSupplierWorkspace";
beforeEach(() => {
  s.readonly = false;
  s.failMetadata = false;
  s.failCleanup = false;
  s.upload.mockReset().mockResolvedValue({ error: null });
  s.remove
    .mockReset()
    .mockImplementation(async () => ({
      error: s.failCleanup ? { message: "cleanup failed" } : null,
    }));
  s.signed
    .mockReset()
    .mockResolvedValue({
      data: { signedUrl: "https://example.invalid/signed" },
      error: null,
    });
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const h = renderHook(() => useSupplierWorkspace("S"), { wrapper });
  await waitFor(() => expect(h.result.current.query.isSuccess).toBe(true));
  return h;
}
const file = (content = "%PDF-test") =>
  ({
    name: "contratto.pdf",
    type: "application/pdf",
    size: content.length,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  }) as File;
it("upload con percorso privato, hash e metadati confermati", async () => {
  const h = await setup();
  await act(() =>
    h.result.current.upload.mutateAsync({ contractId: "C", file: file() }),
  );
  expect(s.upload).toHaveBeenCalledWith(
    expect.stringMatching(/^A\/S\/C\/.+-contratto\.pdf$/),
    expect.anything(),
    { contentType: "application/pdf", upsert: false },
  );
  expect(s.remove).not.toHaveBeenCalled();
});
it("se i metadati falliscono rimuove il solo upload non registrato", async () => {
  s.failMetadata = true;
  const h = await setup();
  await act(async () => {
    await expect(
      h.result.current.upload.mutateAsync({ contractId: "C", file: file() }),
    ).rejects.toBeTruthy();
  });
  expect(s.remove).toHaveBeenCalledWith([s.upload.mock.calls[0][0]]);
});
it("un problema nella pulizia non viene presentato come caricamento riuscito", async () => {
  s.failMetadata = true;
  s.failCleanup = true;
  const h = await setup();
  await act(async () => {
    await expect(
      h.result.current.upload.mutateAsync({ contractId: "C", file: file() }),
    ).rejects.toThrow("richiede una verifica");
  });
});
it("rifiuta un HTML rinominato PDF prima dell’upload", async () => {
  const h = await setup();
  await act(async () => {
    await expect(
      h.result.current.upload.mutateAsync({
        contractId: "C",
        file: file("<html>"),
      }),
    ).rejects.toThrow("non corrisponde");
  });
  expect(s.upload).not.toHaveBeenCalled();
});
it("senza permesso di modifica non carica", async () => {
  s.readonly = true;
  const h = await setup();
  await act(async () => {
    await expect(
      h.result.current.upload.mutateAsync({ contractId: "C", file: file() }),
    ).rejects.toThrow("Non puoi modificare");
  });
  expect(s.upload).not.toHaveBeenCalled();
});
it("download di un altro tenant non richiede neppure una URL firmata", async () => {
  const h = await setup();
  await expect(
    h.result.current.download({
      id: "D",
      company_id: "B",
      supplier_id: "S",
      contract_id: "C",
      storage_path: "B/S/C/file.pdf",
      file_name: "file.pdf",
      mime_type: "application/pdf",
      size_bytes: 123,
      sha256: "a".repeat(64),
      created_at: "2026-10-27",
    }),
  ).rejects.toThrow("non accessibile");
  expect(s.signed).not.toHaveBeenCalled();
});
