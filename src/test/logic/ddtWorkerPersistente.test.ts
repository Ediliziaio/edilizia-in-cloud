import { webcrypto } from "node:crypto";
import { Buffer } from "node:buffer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ ai: vi.fn() }));
vi.mock("../../../supabase/functions/_shared/aiRouter.ts", () => ({
  aiRouterComplete: m.ai,
}));
import { processaDocumento } from "../../../supabase/functions/ddt-documenti-processa/worker";
const file = new TextEncoder().encode("%PDF-1.7 test scansione");
const sha = async (bytes: Uint8Array) =>
  Buffer.from(await webcrypto.subtle.digest("SHA-256", bytes)).toString("hex");
let job: Record<string, unknown>,
  updates: Record<string, unknown>[],
  download: ReturnType<typeof vi.fn>,
  db: any,
  filtri: Record<string, unknown>;
beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  updates = [];
  filtri = {};
  job = {
    id: "job",
    company_id: "azienda",
    created_by: "utente",
    source: "campo",
    files: [
      {
        path: "azienda/utente/job/1-originale.pdf",
        name: "DDT.pdf",
        mime: "application/pdf",
        size: file.length,
      },
    ],
    file_hash: await sha(new TextEncoder().encode(await sha(file))),
    lease_id: "lease",
    attempts: 1,
  };
  download = vi.fn().mockResolvedValue({
    data: { arrayBuffer: async () => file.buffer },
    error: null,
  });
  db = {
    rpc: vi.fn().mockResolvedValue({ data: [job], error: null }),
    storage: { from: () => ({ download }) },
    from: vi.fn(() => ({
      update: (p: Record<string, unknown>) => {
        updates.push(p);
        const chain: any = {
          eq: (k: string, v: unknown) => {
            filtri[k] = v;
            return chain;
          },
          select: async () => ({ data: [{ id: "job" }], error: null }),
          then: (resolve: any) => resolve({ error: null }),
        };
        return chain;
      },
    })),
  };
  m.ai.mockReset().mockResolvedValue({
    content: JSON.stringify({
      intestazione: { numero_ddt: "42", data_ddt: "2026-11-10" },
      mittente: { ragione_sociale: "Fornitore" },
      righe_merce: [
        {
          descrizione: "Articolo nuovo",
          quantita: 2.5,
          unita_misura: "mq",
          prezzo_unitario_eur: null,
        },
      ],
      confidence: 0.8,
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("salva una lettura recuperabile senza creare DDT, materiali o costi e senza perdere il prezzo assente", async () => {
  expect(await processaDocumento(db, "job")).toEqual({
    id: "job",
    stato: "review",
  });
  expect(updates[0]).toMatchObject({
    status: "review",
    result: { righe_merce: [{ quantita: 2.5, prezzo_unitario_eur: null }] },
  });
  expect(db.from).toHaveBeenCalledWith("ddt_document_jobs");
  expect(db.from).toHaveBeenCalledTimes(1);
  expect(filtri).toMatchObject({
    id: "job",
    lease_id: "lease",
    status: "processing",
  });
  expect(m.ai.mock.calls[0][0].messages[1].content[2]).toMatchObject({
    type: "file",
  });
});
it("non legge file di altre aziende o originali manomessi e non spende AI", async () => {
  (job.files as any[])[0].path = "altra/utente/job/file.pdf";
  expect((await processaDocumento(db)).stato).toBe("error");
  expect(download).not.toHaveBeenCalled();
  expect(m.ai).not.toHaveBeenCalled();
  (job.files as any[])[0].path = "azienda/utente/job/file.pdf";
  job.file_hash = "b".repeat(64);
  expect((await processaDocumento(db)).stato).toBe("error");
  expect(m.ai).not.toHaveBeenCalled();
});
it("rifiuta file camuffati e conversioni fuori cartella", async () => {
  download.mockResolvedValue({
    data: {
      arrayBuffer: async () => new TextEncoder().encode("MZ eseguibile").buffer,
    },
    error: null,
  });
  expect((await processaDocumento(db)).stato).toBe("error");
  expect(m.ai).not.toHaveBeenCalled();
});
it("rimette in coda gli errori temporanei con backoff, ma termina dopo cinque tentativi", async () => {
  m.ai.mockRejectedValue(new Error("503 temporary"));
  expect((await processaDocumento(db)).stato).toBe("queued");
  expect(updates[0]).toMatchObject({ status: "queued", lease_id: null });
  job.attempts = 5;
  expect((await processaDocumento(db)).stato).toBe("error");
});
it("senza lease disponibile non scarica file e non invoca il modello", async () => {
  db.rpc.mockResolvedValue({ data: [], error: null });
  expect(await processaDocumento(db)).toEqual({ stato: "nessun_lavoro" });
  expect(download).not.toHaveBeenCalled();
  expect(m.ai).not.toHaveBeenCalled();
});
