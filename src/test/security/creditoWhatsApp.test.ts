/**
 * Ondata 0.5 — prova permanente: a credito zero il messaggio non parte, e la
 * ragione si legge.
 *
 * Nota onesta sulla copertura: il percorso HTTP completo non è esercitabile in
 * questo ambiente. Gli unici numeri WhatsApp collegati appartengono a Platform
 * Admin CRM, e nessuna azienda raggiungibile da un utente di prova ha una
 * connessione attiva (0 righe in messaging_whatsapp_config con is_connected).
 * Una chiamata con l'utente demo si ferma prima, su "WhatsApp non configurato".
 *
 * Quindi la prova è in due pezzi, entrambi reali:
 *   · il cancello, verificato sul database di produzione (vedi il messaggio di
 *     commit): a saldo zero consume_credits risponde insufficient_credits, dopo
 *     una ricarica passa, il rimborso riporta il saldo e il registro tiene
 *     traccia di tutto;
 *   · l'innesto, verificato qui: whatsapp-send interroga il cancello PRIMA di
 *     consegnare a Meta, restituisce 402 con un messaggio leggibile, e rimborsa
 *     se il provider rifiuta.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(resolve(RADICE, p), "utf8");

const edge = leggi("supabase/functions/whatsapp-send/index.ts");
const helper = leggi("supabase/functions/_shared/whatsappCredits.ts");

describe("0.5 · il controllo del credito è dove passano tutti i percorsi", () => {
  it("whatsapp-send chiede il credito prima di consegnare a Meta", () => {
    const posGate = edge.indexOf("addebitaMessaggioWhatsApp(");
    const posMeta = edge.indexOf("graph.facebook.com");
    expect(posGate, "il cancello non c'è").toBeGreaterThan(0);
    expect(posMeta).toBeGreaterThan(0);
    expect(posGate, "il credito va controllato PRIMA dell'invio").toBeLessThan(posMeta);
  });

  it("a credito insufficiente risponde 402 con un messaggio leggibile", () => {
    expect(edge).toMatch(/if \(!credito\.consentito\)/);
    expect(edge).toMatch(/status: credito\.codice === "whatsapp_disabled" \? 403 : 402/);
    expect(edge).toMatch(/message: credito\.messaggio/);
    // il messaggio dice cosa fare, non solo che è andata male
    expect(helper).toMatch(/Ricarica da Impostazioni → Crediti/);
  });

  it("se Meta rifiuta, il credito torna indietro", () => {
    const ramoErrore = edge.split("if (!metaRes.ok) {")[1].split("}")[0];
    expect(ramoErrore).toContain("rimborsaMessaggioWhatsApp");
    expect(edge).toMatch(/credito\.addebitato/);
  });

  it("le aziende in omaggio non vengono addebitate né bloccate", () => {
    expect(helper).toMatch(/if \(billing\.isFree\)/);
    expect(helper).toMatch(/return \{ consentito: true, addebitato: 0 \}/);
  });

  it("un wallet sospeso blocca anche con saldo residuo", () => {
    // consume_credits guarda solo il saldo: sends_blocked va letto a parte
    expect(helper).toMatch(/wallet\?\.sends_blocked/);
    expect(helper).toMatch(/Invii WhatsApp sospesi/);
  });

  it("se il credito non è verificabile non si invia al buio", () => {
    const ramo = helper.split("if (error) {")[1].split("}")[0];
    expect(ramo).toContain("consentito: false");
    expect(ramo).toContain("credit_check_failed");
  });

  it("il rimborso non solleva: nasconderebbe l'errore vero del provider", () => {
    const rimborso = helper.split("export async function rimborsaMessaggioWhatsApp")[1];
    expect(rimborso).toMatch(/try \{/);
    expect(rimborso).toMatch(/catch \(err\)/);
    expect(rimborso).not.toMatch(/throw /);
  });

  it("l'addebito usa la RPC atomica, non una lettura seguita da una scrittura", () => {
    expect(helper).toMatch(/admin\.rpc\("consume_credits"/);
    // il vecchio schema read-modify-write inseriva saldi negativi in silenzio
    expect(helper).not.toMatch(/\.update\(\{\s*balance_eur/);
  });
});

describe("0.5 · il wallet esiste anche quando è vuoto", () => {
  const migrazione = (() => {
    const dir = resolve(RADICE, "supabase/migrations");
    const nome = readdirSync(dir).find((f) => f.includes("wallet_whatsapp_esplicito"));
    if (!nome) throw new Error("migrazione wallet_whatsapp_esplicito non trovata");
    return readFileSync(resolve(dir, nome), "utf8");
  })();

  it("un'azienda nuova nasce con il wallet WhatsApp, come per AI ed email", () => {
    expect(migrazione).toMatch(/CREATE TRIGGER trg_init_whatsapp_credits\s+AFTER INSERT ON public\.companies/);
  });

  it("il recupero delle aziende esistenti non regala credito", () => {
    // INSERT della sola company_id: il saldo resta al default, cioè zero
    expect(migrazione).toMatch(/INSERT INTO public\.whatsapp_credits \(company_id\)/);
    expect(migrazione).not.toMatch(/balance_eur\s*[,)]\s*VALUES/i);
    expect(migrazione).not.toMatch(/VALUES\s*\([^)]*,\s*[1-9]/);
  });
});
