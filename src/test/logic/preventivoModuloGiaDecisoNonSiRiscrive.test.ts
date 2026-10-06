/**
 * Preventivo di un MODULO (bagni, tetti…) già deciso dal cliente: non si riscrive.
 *
 * upsertModuleQuote caricava il PDF sullo stesso percorso per progetto (con `upsert`)
 * e solo DOPO guardava se il preventivo-ombra era già firmato: il PDF firmato veniva
 * sovrascritto e poi arrivava il rifiuto. Un preventivo RIFIUTATO (nessuna data di
 * firma) non veniva proprio fermato: riceveva PDF, totali e scadenza nuovi, e solo
 * dopo send-quote-signature rispondeva 409.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  esistente: null as null | Record<string, unknown>,
  upload: [] as unknown[][],
  update: [] as unknown[],
  insert: [] as unknown[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const catena = (leggi: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
    c.maybeSingle = async () => ({ data: leggi(), error: null as { message: string } | null });
    c.single = async () => ({ data: leggi(), error: null as { message: string } | null });
    return c;
  };
  return {
    supabase: {
      from: () => ({
        select: () => catena(() => stato.esistente),
        update: (dati: unknown) => { stato.update.push(dati); return catena(() => ({ ...(stato.esistente ?? {}), ...(dati as object) })); },
        insert: (dati: unknown) => { stato.insert.push(dati); return catena(() => ({ id: "nuovo", ...(dati as object) })); },
      }),
      storage: { from: () => ({ upload: async (...args: unknown[]) => { stato.upload.push(args); return { error: null as { message: string } | null }; } }) },
      rpc: async () => ({ data: "OFF-2026-001", error: null as { message: string } | null }),
      functions: { invoke: vi.fn() },
    },
  };
});

import { upsertModuleQuote } from "@/lib/moduli/quoteBridge";
import { FRASI_OFFERTA_MODULO, esitoOffertaModulo } from "@/lib/moduli/esitoOffertaModulo";

const input = {
  companyId: "c-1", userId: "u-1", moduleKey: "bagni", progettoId: "p-1", titolo: "Bagno", clientName: "Mario Rossi",
  subtotal: 1000, vatAmount: 220, total: 1220, validityDays: 30, pdfBlob: new Blob(["pdf"]),
};
const riga = (extra: Record<string, unknown>) => ({
  id: "q-1", quote_number: "OFF-2026-042", status: "inviata", signature_token: "tok", sent_at: "2026-09-20T10:00:00Z",
  viewed_at: null as string | null, signed_at: null as string | null, expires_at: "2026-10-20T10:00:00Z", ...extra,
});

beforeEach(() => { stato.esistente = null; stato.upload = []; stato.update = []; stato.insert = []; });

describe("upsertModuleQuote: l'offerta già decisa non si tocca", () => {
  it.each([
    ["rifiutata dal cliente", { status: "rifiutata", viewed_at: "2026-09-21T10:00:00Z" }],
    ["firmata (con data)", { status: "accettata", signed_at: "2026-09-22T10:00:00Z" }],
    ["accettata (senza data di firma)", { status: "accettata" }],
    ["diventata commessa", { status: "convertita" }],
    ["annullata", { status: "annullata" }],
  ])("%s: errore con il motivo, NESSUN PDF caricato e nessun totale riscritto", async (_nome, extra) => {
    stato.esistente = riga(extra);
    await expect(upsertModuleQuote(input)).rejects.toThrow(/Questo preventivo/);
    expect(stato.upload).toHaveLength(0);
    expect(stato.update).toHaveLength(0);
    expect(stato.insert).toHaveLength(0);
  });

  it("le frasi dicono perché: firmato, rifiutato, commessa, annullato", async () => {
    stato.esistente = riga({ status: "rifiutata" });
    await expect(upsertModuleQuote(input)).rejects.toThrow(FRASI_OFFERTA_MODULO.rifiutata);
    stato.esistente = riga({ status: "inviata", signed_at: "2026-09-22T10:00:00Z" });
    await expect(upsertModuleQuote(input)).rejects.toThrow(FRASI_OFFERTA_MODULO.accettata);
  });

  it.each(["bozza", "inviata", "scaduta"])("%s: il reinvio aggiornato resta possibile (PDF e totali nuovi)", async (status) => {
    stato.esistente = riga({ status });
    const riscritta = await upsertModuleQuote(input);
    expect(stato.upload).toHaveLength(1);
    expect(stato.upload[0][0]).toBe("c-1/moduli/bagni-p-1.pdf");
    expect(stato.update).toHaveLength(1);
    expect(stato.update[0]).toMatchObject({ total: 1220, subtotal: 1000, vat_amount: 220, pdf_storage_path: "c-1/moduli/bagni-p-1.pdf" });
    expect(riscritta.id).toBe("q-1");
  });

  it("primo invio (nessuna riga di firma): PDF caricato e riga creata", async () => {
    await upsertModuleQuote(input);
    expect(stato.upload).toHaveLength(1);
    expect(stato.insert).toHaveLength(1);
    expect(stato.insert[0]).toMatchObject({ company_id: "c-1", source: "modulo:bagni:p-1", status: "bozza", total: 1220 });
  });
});

describe("esitoOffertaModulo: quando un'offerta di modulo è già decisa", () => {
  it.each([
    [null, null], [undefined, null], [{ status: "bozza", signed_at: null }, null], [{ status: "inviata", signed_at: null }, null],
    [{ status: "scaduta", signed_at: null }, null],
    [{ status: "accettata", signed_at: null }, "accettata"], [{ status: "inviata", signed_at: "2026-09-22T10:00:00Z" }, "accettata"],
    [{ status: "rifiutata", signed_at: null }, "rifiutata"], [{ status: "convertita", signed_at: null }, "convertita"],
    [{ status: "annullata", signed_at: null }, "annullata"],
    // I vecchi stati al maschile e le maiuscole valgono lo stesso.
    [{ status: "accettato", signed_at: null }, "accettata"], [{ status: " Rifiutato ", signed_at: null }, "rifiutata"],
  ])("%j → %s", (riga, atteso) => {
    expect(esitoOffertaModulo(riga as Parameters<typeof esitoOffertaModulo>[0])).toBe(atteso);
  });
  it("ogni esito ha la sua frase in italiano", () => {
    for (const esito of ["accettata", "rifiutata", "convertita", "annullata"] as const) {
      expect(FRASI_OFFERTA_MODULO[esito]).toMatch(/^Questo preventivo è /);
    }
  });
});
