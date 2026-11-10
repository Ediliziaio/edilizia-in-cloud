import { File as NodeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  enqueue: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: m.upload }) },
    rpc: m.rpc,
    functions: { invoke: m.invoke },
  },
}));
vi.mock("@/lib/campo/sync-queue", () => ({
  syncQueue: { enqueue: m.enqueue, remove: m.remove },
}));
import { inviaDocumentoPersistente } from "@/lib/ddt/documentiPersistenti";
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  m.enqueue.mockReset().mockResolvedValue("copia-locale");
  m.remove.mockReset().mockResolvedValue(undefined);
  m.upload.mockReset().mockResolvedValue({ error: null });
  m.rpc
    .mockReset()
    .mockResolvedValue({
      data: { id: "job", status: "queued", duplicate: false },
      error: null,
    });
  m.invoke.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllGlobals());
const input = () => ({
  files: [
    new NodeFile(["%PDF-1.7"], "bolla.pdf", {
      type: "application/pdf",
    }) as unknown as File,
  ],
  companyId: "azienda",
  userId: "utente",
  orderId: null,
  source: "desktop" as const,
  operationId: "operazione",
  salvaCopiaLocale: true,
});
it("conserva la ripresa prima della rete e la rimuove solo dopo la conferma del server", async () => {
  const p = input();
  expect(await inviaDocumentoPersistente(p)).toEqual({
    id: "job",
    duplicate: false,
  });
  expect(m.enqueue).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "documento_ddt",
      operationId: "operazione",
      payload: expect.objectContaining({
        files: p.files,
        user_id: "utente",
        company_id: "azienda",
        source: "desktop",
      }),
    }),
  );
  expect(m.enqueue.mock.invocationCallOrder[0]).toBeLessThan(
    m.upload.mock.invocationCallOrder[0],
  );
  expect(m.remove.mock.invocationCallOrder[0]).toBeGreaterThan(
    m.rpc.mock.invocationCallOrder[0],
  );
});
it("un upload interrotto conserva il file per la ripresa e non accoda una lettura inesistente", async () => {
  m.upload.mockResolvedValue({ error: { message: "rete assente" } });
  await expect(inviaDocumentoPersistente(input())).rejects.toThrow(
    "Caricamento non completato",
  );
  expect(m.remove).not.toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.invoke).not.toHaveBeenCalled();
});
it("il processore di ripresa non genera altre copie locali", async () => {
  await inviaDocumentoPersistente({ ...input(), salvaCopiaLocale: false });
  expect(m.enqueue).not.toHaveBeenCalled();
});
