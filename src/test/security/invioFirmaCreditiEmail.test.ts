/// <reference types="node" />
/**
 * Il preventivo in firma non si tocca se l'email non può partire (27/10/2026).
 *
 * Dimora Torino, senza abbonamento e senza crediti email, mandava un preventivo in firma: la funzione cambiava lo
 * stato in «inviata», creava la richiesta di firma, e solo alla fine l'invio dell'email veniva respinto (402) con un
 * errore in JSON. Il cliente non riceveva niente e il preventivo sembrava spedito. Ora i crediti si controllano prima
 * di scrivere qualunque cosa, con un messaggio che dice cosa fare.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { classificaBloccoPagamento, estraiDettaglioCredito } from "@/lib/creditoEsaurito";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

type Quota = Record<string, unknown> | null;
type Esito = { ok: true } | { ok: false; saldoEur: number; serveEur: number };

/** Carica `verificaCreditiEmail` dal sorgente vero, con un database finto (il file importa un modulo da URL). */
function verifica(quota: Quota, saldo: number, errore: unknown = null) {
  const js = ts.transpileModule(leggi("supabase/functions/_shared/emailCredits.ts"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const finto = {
    rpc: async () => ({ data: quota, error: errore }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { balance_eur: saldo }, error: null as unknown }) }) }) }),
  };
  const modulo = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(js, { module: modulo, exports: modulo.exports, require: () => ({ createClient: () => finto }), Deno: { env: { get: () => "x" } } });
  return (n: number) => (modulo.exports.verificaCreditiEmail as (c: string, n: number, a: unknown) => Promise<Esito>)("azienda", n, finto);
}

const SOPRA_QUOTA = { is_free: false, over_quota: true, effective_price_eur: 0.0012, effective_limit: 0, sent_this_month: 5 };

describe("verificaCreditiEmail", () => {
  it("credito finito: si ferma, e dice quanto manca (Dimora Torino: saldo 0, serve 0,0012)", async () => {
    const r = await verifica(SOPRA_QUOTA, 0)(1);
    expect(r).toEqual({ ok: false, saldoEur: 0, serveEur: 0.0012 });
  });
  it("due firmatari costano il doppio: con credito per una sola email si ferma", async () => {
    expect((await verifica(SOPRA_QUOTA, 0.0015)(1)).ok).toBe(true);
    expect((await verifica(SOPRA_QUOTA, 0.0015)(2)).ok).toBe(false);
  });
  it("dentro la quota gratuita, o con piano gratuito, passa anche a saldo zero", async () => {
    expect((await verifica({ ...SOPRA_QUOTA, over_quota: false }, 0)(1)).ok).toBe(true);
    expect((await verifica({ ...SOPRA_QUOTA, is_free: true }, 0)(1)).ok).toBe(true);
    expect((await verifica({ ...SOPRA_QUOTA, effective_price_eur: 0 }, 0)(1)).ok).toBe(true);
  });
  it("se la quota non si legge non si blocca nessuno: decide l'invio vero", async () => {
    expect((await verifica(null, 0)(1)).ok).toBe(true);
    expect((await verifica(SOPRA_QUOTA, 0, { message: "boom" })(1)).ok).toBe(true);
  });
});

describe("send-quote-signature: crediti controllati prima di ogni scrittura", () => {
  const invio = leggi("supabase/functions/send-quote-signature/index.ts");
  const pos = (t: string) => { const i = invio.indexOf(t); expect(i, t).toBeGreaterThan(-1); return i; };

  it("dopo i controlli sul preventivo e prima di PDF, firme, stato ed email", () => {
    const controllo = pos("await verificaCreditiEmail(");
    expect(pos("preventivoModificabile(comeChiChiama")).toBeLessThan(controllo);
    expect(pos("Il cointestatario deve avere un indirizzo email diverso")).toBeLessThan(controllo);
    for (const dopo of ['if (mode === "solo_pdf")', '.from("signature_requests")', ".update(", "/functions/v1/generate-quote-pdf", "sendEmailUnified("]) {
      expect(controllo, dopo).toBeLessThan(pos(dopo));
    }
  });
  it("il rifiuto è un 402 con una frase che dice cosa fare, e avvisa chi amministra l'azienda", () => {
    expect(invio).toContain('"avvisa_crediti_email_esauriti"');
    expect(invio).toMatch(/I crediti email dell'azienda sono finiti[\s\S]{0,260}Il preventivo non è stato cambiato/);
    // Con il codice, il popup «credito esaurito» (saldo + «Ricarica ora») si apre da solo, come per gli altri strumenti.
    expect(invio).toMatch(/code: "insufficient_credits",\s*wallet: "email"/);
    expect(invio).toMatch(/\},\s*402,\s*corsH,\s*\);/);
  });
  it("con il cointestatario servono due email, e l'invito mancato si dice invece di fingere un successo", () => {
    expect(invio).toContain("verificaCreditiEmail(quote.company_id, conCointestatario ? 2 : 1, supabaseAdmin)");
    expect(invio).toContain("invito_cointestatario_inviato: invitoCointestatarioInviato");
    expect(invio).toContain("l'invito al cointestatario non è partito");
  });
});

describe("il browser apre il popup «credito esaurito» con la risposta del server", () => {
  const corpo = {
    error: "I crediti email dell'azienda sono finiti: l'email al cliente non può partire. Il preventivo non è stato cambiato. Ricarica i crediti per riprovare.",
    code: "insufficient_credits", wallet: "email", balance_eur: 0,
  };
  it("è un blocco per crediti (saldo e «Ricarica ora»), non il generico «serve una carta»", () => {
    expect(classificaBloccoPagamento(402, corpo)).toBe("credits");
  });
  it("sa di quale portafoglio parla e quanto resta", () => {
    expect(estraiDettaglioCredito(corpo)).toMatchObject({ portafoglio: "email", saldoEur: 0 });
  });
});
