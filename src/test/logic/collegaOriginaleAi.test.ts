/**
 * L'originale letto dall'AI prima che la commessa esista sta in documenti-smart (14/11/2026):
 * alla creazione entra nei documenti della commessa, in order-attachments/<commessa>/ai-contratti/,
 * registrato come «vendita» e non visibile al cliente. Il retry non duplica.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { collegaOriginaleAi } from "@/lib/orders/documentImportAi";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const ORDINE = "0b6c8e1a-1111-4222-8333-444455556666";

function dbFinto(registrati: string[] = []) {
  const caricati: Array<[string, string]> = [];
  const inseriti: Record<string, unknown>[] = [];
  const scaricati: Array<[string, string]> = [];
  const db = {
    from: (t: string) => ({
      select: () => {
        const q = { filtri: {} as Record<string, string>, eq(c: string, v: string) { q.filtri[c] = v; return q; },
          limit: async () => ({ data: registrati.filter((p) => p === q.filtri.file_url && t === "order_attachments").map((id) => ({ id })), error: null as null }) };
        return q;
      },
      insert: async (r: Record<string, unknown>) => { inseriti.push(r); registrati.push(String(r.file_url)); return { error: null as null }; },
    }),
    storage: { from: (b: string) => ({
      download: async (p: string) => { scaricati.push([b, p]); return { data: new Blob(["pdf"]), error: null as null }; },
      upload: async (p: string) => { caricati.push([b, p]); return { error: null as null }; },
    }) },
  };
  return { db: db as never, caricati, inseriti, scaricati };
}

const sorgente = { bucket: "documenti-smart", path: `${AZIENDA}/ai-contratti/abc-contratto.pdf`, name: "contratto.pdf", mime: "application/pdf" };

describe("collegaOriginaleAi", () => {
  it("copia da documenti-smart nella cartella della commessa e la registra come vendita", async () => {
    const f = dbFinto();
    const r = await collegaOriginaleAi(f.db, ORDINE, AZIENDA, "utente", sorgente);
    expect(r).toMatchObject({ bucket: "order-attachments", path: `${ORDINE}/ai-contratti/abc-contratto.pdf`, name: "contratto.pdf" });
    expect(f.scaricati).toEqual([["documenti-smart", sorgente.path]]);
    expect(f.caricati).toEqual([["order-attachments", `${ORDINE}/ai-contratti/abc-contratto.pdf`]]);
    expect(f.inseriti[0]).toMatchObject({ order_id: ORDINE, access_scope: "vendita", visible_to_customer: false, file_size: 3 });
  });

  it("il retry trova la riga e non copia né registra di nuovo", async () => {
    const f = dbFinto([`${ORDINE}/ai-contratti/abc-contratto.pdf`]);
    await collegaOriginaleAi(f.db, ORDINE, AZIENDA, "utente", sorgente);
    expect(f.caricati).toEqual([]); expect(f.inseriti).toEqual([]);
  });

  it("un originale di altra azienda o fuori da ai-contratti è rifiutato", async () => {
    const f = dbFinto();
    await expect(collegaOriginaleAi(f.db, ORDINE, AZIENDA, "u", { ...sorgente, path: `e7bc8fd0-fcab-4c02-bcfe-98a1488c3e7e/ai-contratti/x.pdf` })).rejects.toThrow("non valido");
    await expect(collegaOriginaleAi(f.db, ORDINE, AZIENDA, "u", { ...sorgente, path: `${AZIENDA}/smart-1.pdf` })).rejects.toThrow("non valido");
    await expect(collegaOriginaleAi(f.db, ORDINE, AZIENDA, "u", { ...sorgente, bucket: "hr-documenti" })).rejects.toThrow("non valido");
  });

  it("un originale già in order-attachments (prima del 14/11) si registra senza copiarlo", async () => {
    const f = dbFinto();
    const vecchio = { ...sorgente, bucket: "order-attachments" };
    const r = await collegaOriginaleAi(f.db, ORDINE, AZIENDA, "u", vecchio);
    expect(r.path).toBe(vecchio.path); expect(f.caricati).toEqual([]); expect(f.inseriti).toHaveLength(1);
  });
});
