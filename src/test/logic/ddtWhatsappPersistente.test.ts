import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { acquisisciDdtWhatsapp } from "../../../supabase/functions/_shared/ddtWhatsappPersistente";
const m = {
  download: vi.fn(),
  upload: vi.fn(),
  insert: vi.fn(),
  lookup: vi.fn(),
};
const db = {
  storage: {
    from: (bucket: string) => ({
      download: (path: string) => m.download(bucket, path),
      upload: (...args: unknown[]) => m.upload(bucket, ...args),
    }),
  },
  from: () => ({
    select: () => {
      const chain = { eq: () => chain, maybeSingle: m.lookup };
      return chain;
    },
    insert: (value: unknown) => {
      m.insert(value);
      return {
        select: () => ({
          single: async () => ({
            data: { id: "nuovo", status: "review" },
            error: null,
          }),
        }),
      };
    },
  }),
};
const opts = {
  storagePath: "azienda/2026-11/originale.pdf",
  companyId: "azienda",
  userId: "utente",
  messageId: "messaggio",
  result: { ddt_number: "42", items: [] },
};
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  for (const f of Object.values(m)) f.mockReset();
  m.download.mockResolvedValue({
    data: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    error: null,
  });
  m.upload.mockResolvedValue({ error: null });
  m.lookup.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllGlobals());
it("conserva una copia identica nell'archivio DDT per gli utenti autorizzati su più aziende", async () => {
  await acquisisciDdtWhatsapp(db, opts);
  expect(m.download).toHaveBeenCalledWith("whatsapp-media", opts.storagePath);
  expect(m.upload).toHaveBeenCalledWith(
    "ddt-documenti",
    expect.stringMatching(/^azienda\/utente\/[^/]+\/1-originale\.pdf$/),
    expect.any(Uint8Array),
    { contentType: "application/pdf", upsert: false },
  );
  expect(new TextDecoder().decode(m.upload.mock.calls[0][2])).toBe("%PDF-1.7");
  expect(m.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      company_id: "azienda",
      source: "whatsapp",
      files: [
        expect.objectContaining({
          bucket: "ddt-documenti",
          path: m.upload.mock.calls[0][1],
        }),
      ],
    }),
  );
});
it("non dichiara acquisito il documento se il salvataggio della copia fallisce", async () => {
  m.upload.mockResolvedValue({ error: { message: "rete" } });
  await expect(acquisisciDdtWhatsapp(db, opts)).rejects.toThrow(
    "Copia del documento",
  );
  expect(m.insert).not.toHaveBeenCalled();
});
it("un duplicato riusa il documento senza creare altre copie o nuove letture", async () => {
  m.lookup.mockResolvedValue({
    data: { id: "esistente", status: "review", created_by: "collega" },
    error: null,
  });
  expect(await acquisisciDdtWhatsapp(db, opts)).toEqual({
    id: "esistente",
    status: "review",
  });
  expect(m.upload).not.toHaveBeenCalled();
  expect(m.insert).not.toHaveBeenCalled();
});
it("rifiuta percorsi di un'altra azienda prima di leggere l'allegato", async () => {
  await expect(
    acquisisciDdtWhatsapp(db, { ...opts, storagePath: "altra/file.pdf" }),
  ).rejects.toThrow("fuori dall’azienda");
  expect(m.download).not.toHaveBeenCalled();
});
