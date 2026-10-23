import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildForecastLedger, emptyForecastSources } from "@/lib/finance/forecastLedger";
import { riferimentoFatturaStornata } from "../../../supabase/functions/_shared/notaCreditoRiferimento";

/**
 * Nota di credito che storna una fattura mai incassata: la coppia si chiude con
 * lo stato «credited», senza incasso inventato.
 *
 * Provato su produzione in una transazione annullata, su un'azienda con 7
 * fatture aperte e 7 note di credito dello stesso cliente e importo:
 *   anteprima per importo ......... 7 coppie abbinabili, 0 ambigue
 *   applicazione .................. 7 fatture e 7 note «credited», paid_amount 0
 *   scadenze ...................... chiuse solo quelle aperte (annullata)
 *   secondo giro .................. (0,0,0): idempotente
 */

describe("riferimento alla fattura stornata (Fatture in Cloud)", () => {
  it("legge numero e data da ei_data della nota di credito", () => {
    expect(riferimentoFatturaStornata({
      type: "credit_note",
      ei_data: { invoice_number: " 94 ", invoice_date: "2025-12-05" },
    })).toEqual({ rifFatturaNumero: "94", rifFatturaData: "2025-12-05" });
  });
  it("senza data tiene il numero", () => {
    expect(riferimentoFatturaStornata({ type: "credit_note", ei_data: { invoice_number: 12 } }))
      .toEqual({ rifFatturaNumero: "12", rifFatturaData: null });
  });
  it("niente per le fatture e per le note senza riferimento", () => {
    expect(riferimentoFatturaStornata({ type: "invoice", ei_data: { invoice_number: "1" } })).toEqual({});
    expect(riferimentoFatturaStornata({ type: "credit_note", ei_data: {} })).toEqual({});
    expect(riferimentoFatturaStornata({ type: "credit_note" })).toEqual({});
  });
});

describe("previsionale", () => {
  it("una fattura stornata e la sua nota non sono né entrate né uscite", () => {
    const s = emptyForecastSources();
    s.invoices = [
      { id: "f", total: 1227.16, paid_amount: 0, due_date: "2026-11-05", status: "credited", document_type: "invoice" },
      { id: "nc", total: 1227.16, paid_amount: 0, due_date: "2026-11-05", status: "credited", document_type: "credit_note" },
      { id: "aperta", total: 500, paid_amount: 0, due_date: "2026-11-05", status: "issued", document_type: "invoice" },
    ];
    s.deadlines = [
      { id: "sf", description: "Fattura", amount: 1227.16, paid_amount: 0, due_date: "2026-11-05", direction: "entrata", status: "annullata", invoice_id: "f" },
      { id: "snc", description: "Nota credito", amount: 1227.16, paid_amount: 0, due_date: "2026-11-05", direction: "uscita", status: "annullata", invoice_id: "nc" },
    ];
    const { movements, collected } = buildForecastLedger(s, "2026-10-23");
    expect(movements.map((m) => m.id)).toEqual(["fattura:aperta"]);
    expect(collected).toEqual([]);
  });
});

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("note_credito_stornano_fattura"));
if (!nome) throw new Error("migrazione note_credito_stornano_fattura non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");
const corpo = (fn: string) => {
  const i = sql.indexOf(`FUNCTION public.${fn}(`);
  return sql.slice(i, sql.indexOf("$$;", i));
};

describe("migrazione", () => {
  it("la chiusura non scrive mai un incasso", () => {
    expect(corpo("applica_note_di_credito")).not.toMatch(/paid_amount\s*=/);
  });
  it("chiude solo fatture non incassate e coperte per intero", () => {
    const f = corpo("applica_note_di_credito");
    expect(f).toMatch(/coalesce\(f\.paid_amount, 0\) <= 0\.01/);
    expect(f).toMatch(/HAVING sum\(coalesce\(nc\.total, 0\)\) >= coalesce\(f\.total, 0\) - 0\.01/);
  });
  it("le scadenze segnate a mano restano com'erano", () => {
    expect(corpo("applica_note_di_credito")).toMatch(/paid_date IS NULL AND sc\.payment_method IS NULL/);
  });
  it("l'abbinamento per importo vuole un solo candidato per parte", () => {
    expect(corpo("abbina_note_di_credito_per_importo")).toMatch(/per_nota = 1 AND c\.per_fattura = 1/);
  });
  it("le funzioni nuove sono chiuse ad anon e a authenticated", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.applica_note_di_credito\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.abbina_note_di_credito_per_importo\(uuid, boolean\) FROM PUBLIC, anon, authenticated/);
  });
  it("lock_timeout sulle funzioni che scrivono", () => {
    expect(corpo("applica_note_di_credito")).toMatch(/SET lock_timeout TO '3s'/);
    expect(corpo("abbina_note_di_credito_per_importo")).toMatch(/SET lock_timeout TO '3s'/);
  });
});
