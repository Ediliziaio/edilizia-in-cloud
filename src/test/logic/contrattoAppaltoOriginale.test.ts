import { File as NodeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { supabase } from "@/integrations/supabase/client";
import { archiviaContrattoAppalto } from "@/lib/orders/generali/contrattoOriginale";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
type Riga = Record<string, unknown>;
function archivio() {
  const righe: Record<string, Riga[]> = { order_attachments: [], commesse_generali_documenti: [] };
  const file = new Map<string, File>();
  const m = { erroreSegno: false, erroreUpload: false };
  const upload = vi.fn(async (path: string, f: File) => {
    if (m.erroreUpload) return { error: { message: "Connessione assente" } };
    if (file.has(path)) return { error: { message: "The resource already exists" } };
    file.set(path, f); return { error: null };
  });
  const db = {
    storage: { from: () => ({ upload }) },
    from: (tabella: string) => {
      const filtri: Array<[string, unknown]> = [];
      let nuova: Riga | null = null;
      const esegui = (): { data: Riga | null; error: { code: string } | null } => {
        if (nuova) {
          if (tabella === "commesse_generali_documenti" && m.erroreSegno) return { data: null, error: { code: "NETWORK" } };
          const r = { ...nuova, id: `id-${righe[tabella].length}` }; righe[tabella].push(r); return { data: r, error: null };
        }
        return { data: righe[tabella].find(r => filtri.every(([k, v]) => r[k] === v)) ?? null, error: null };
      };
      const q = { select: () => q, eq: (k: string, v: unknown) => { filtri.push([k, v]); return q; }, limit: () => q, maybeSingle: async () => esegui(), single: async () => esegui(), insert: (r: Riga) => { nuova = r; return q; }, then: (resolve: (v: ReturnType<typeof esegui>) => unknown) => Promise.resolve(esegui()).then(resolve) };
      return q;
    },
  } as unknown as typeof supabase;
  return { db, righe, file, m, upload };
}
const originale = (size = 26_056_111, nome = "CONTRATTO REGISTRATO.pdf") => new NodeFile([new Uint8Array(size)], nome, { type: "application/pdf" }) as unknown as File;

it("conserva integralmente un originale oltre 18 MB e lo segna senza AI o scritture economiche", async () => {
  const a = archivio(); const f = originale();
  await archiviaContrattoAppalto(a.db, { orderId: "madre", userId: "utente", file: f });
  expect([...a.file.values()]).toEqual([f]);
  expect(a.righe.order_attachments).toEqual([expect.objectContaining({ order_id: "madre", file_name: f.name, file_size: 26_056_111, access_scope: "vendita", visible_to_customer: false })]);
  expect(a.righe.commesse_generali_documenti).toEqual([expect.objectContaining({ order_id: "madre", voce: "contratto_firmato", attachment_id: "id-0", tipo: "documento" })]);
  expect(Object.keys(a.righe)).toEqual(["order_attachments", "commesse_generali_documenti"]);
});
it("riprovando dopo un errore nel collegamento riusa file e allegato, anche se il nome cambia", async () => {
  const a = archivio(); const f = originale(10);
  a.m.erroreSegno = true;
  await expect(archiviaContrattoAppalto(a.db, { orderId: "madre", userId: "utente", file: f })).rejects.toThrow("Il file è nell'archivio");
  a.m.erroreSegno = false;
  await archiviaContrattoAppalto(a.db, { orderId: "madre", userId: "utente", file: originale(10, "rinominato.pdf") });
  expect(a.upload).toHaveBeenCalledTimes(1);
  expect(a.file.size).toBe(1); expect(a.righe.order_attachments).toHaveLength(1); expect(a.righe.commesse_generali_documenti).toHaveLength(1);
});
it("non crea righe se il caricamento fallisce e rifiuta i file oltre 50 MB prima dell'upload", async () => {
  const a = archivio(); a.m.erroreUpload = true;
  await expect(archiviaContrattoAppalto(a.db, { orderId: "madre", userId: "utente", file: originale(1) })).rejects.toMatchObject({ message: "Connessione assente" });
  const grande = originale(1); Object.defineProperty(grande, "size", { value: 50_000_001 });
  await expect(archiviaContrattoAppalto(a.db, { orderId: "madre", userId: "utente", file: grande })).rejects.toThrow("supera 50 MB");
  expect(a.upload).toHaveBeenCalledTimes(1); expect(a.righe.order_attachments).toHaveLength(0);
});
