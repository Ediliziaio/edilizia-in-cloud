/**
 * Abbonamento Agenti AI (15/09/2026): come l'add-on WhatsApp, è un abbonamento
 * Stripe a parte dal piano, e i suoi eventi non devono toccare l'azienda.
 *
 * Il difetto era latente (ai_subscriptions vuota in produzione): stripe-webhook
 * trova l'azienda dal customer Stripe e trattava ogni abbonamento di quel
 * customer come il piano. Disdire gli Agenti AI avrebbe fatto scadere
 * l'azienda, un loro rinnovo riscritto il periodo del piano, un addebito
 * rifiutato l'avrebbe mandata nei solleciti.
 *
 * Il percorso vero (evento firmato da Stripe) non si esercita da qui. Si prova
 * che il checkout marchi l'abbonamento, che ogni handler riconosca gli Agenti
 * AI prima di scrivere sul piano, e che quel ramo scriva solo su ai_subscriptions.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(resolve(RADICE, p), "utf8");

const checkout = leggi("supabase/functions/create-checkout-session/index.ts");
const webhook = leggi("supabase/functions/stripe-webhook/index.ts");

/** Il corpo di una funzione, fino alla successiva dichiarata al primo livello o alla sezione dopo. */
function corpoDi(sorgente: string, nome: string): string {
  const inizio = sorgente.indexOf(`function ${nome}(`);
  if (inizio < 0) throw new Error(`${nome} non trovata`);
  const fine = sorgente.slice(inizio + 1).search(/\n(?:export )?(?:async )?function |\n\/\/ ─── /);
  return fine < 0 ? sorgente.slice(inizio) : sorgente.slice(inizio, inizio + 1 + fine);
}

/** Il blocco `{ … }` dell'if che contiene `marcatore`, graffe comprese. */
function bloccoDopo(corpo: string, marcatore: string): string {
  const pos = corpo.indexOf(marcatore);
  if (pos < 0) throw new Error(`${marcatore} non trovato`);
  const chiusaCondizione = corpo.indexOf(") {\n", pos);
  if (chiusaCondizione < 0) throw new Error(`nessun blocco dopo ${marcatore}`);
  const apertura = chiusaCondizione + 2;
  let profondita = 0;
  for (let i = apertura; i < corpo.length; i++) {
    if (corpo[i] === "{") profondita++;
    else if (corpo[i] === "}" && --profondita === 0) return corpo.slice(apertura, i + 1);
  }
  throw new Error(`il blocco dopo ${marcatore} non si chiude`);
}

/** Scritture che appartengono al piano dell'azienda e ai suoi solleciti. */
const SCRITTURE_DEL_PIANO = [
  '.from("companies")',
  '.from("company_subscriptions")',
  "stripe_subscription_status",
  "dunning_status",
  "payment_failure_count",
  "process-dunning",
  "enqueue_customer_workflow",
  "emitPlatformEvent",
  // Conta come azienda persa nelle metriche SaaS (useSaasMetrics).
  '"subscription_canceled"',
];

/** Quali scritture del piano compaiono nel pezzo di codice (vuoto = nessuna). */
const pianoToccato = (codice: string) => SCRITTURE_DEL_PIANO.filter((s) => codice.includes(s));

describe("Agenti AI · checkout", () => {
  const ramo = checkout.split('if (type === "ai_subscription")')[1]?.split("\n    // ─── ")[0] ?? "";

  it("il ramo esiste ed è un abbonamento", () => {
    expect(ramo.length).toBeGreaterThan(0);
    expect(ramo).toMatch(/mode: "subscription"/);
  });

  it("l'abbonamento porta tipo e azienda: disdette, rinnovi e fatture si riconoscono", () => {
    expect(ramo).toContain('"subscription_data[metadata][type]": "ai_subscription"');
    expect(ramo).toContain('"subscription_data[metadata][company_id]": company_id');
    expect(ramo).toContain('"metadata[type]": "ai_subscription"');
  });

  it("il tipo scritto dal checkout è quello che il webhook cerca", () => {
    expect(webhook).toContain('const ABBONAMENTO_AGENTI_AI = "ai_subscription";');
  });
});

describe("Agenti AI · il webhook riconosce l'abbonamento", () => {
  const riconosci = corpoDi(webhook, "eAbbonamentoAgentiAI");

  it("prima i metadati, poi la riga di ai_subscriptions, poi Stripe", () => {
    const posMetadati = riconosci.indexOf("metadata?.type === ABBONAMENTO_AGENTI_AI");
    const posRiga = riconosci.indexOf('.from("ai_subscriptions")');
    const posStripe = riconosci.indexOf("api.stripe.com/v1/subscriptions/");
    expect(posMetadati).toBeGreaterThan(0);
    expect(posRiga).toBeGreaterThan(posMetadati);
    expect(posStripe).toBeGreaterThan(posRiga);
    expect(riconosci).toContain('.eq("stripe_subscription_id", subscriptionId)');
  });

  it("se ai_subscriptions non risponde l'evento va in errore, non nei rami del piano", () => {
    expect(riconosci).toMatch(/if \(error\) throw new Error/);
  });
});

describe("Agenti AI · disdetta, rinnovi e addebiti non toccano il piano", () => {
  it("disdirli chiude il loro abbonamento e non fa scadere l'azienda", () => {
    const corpo = corpoDi(webhook, "handleSubscriptionDeleted");
    const ramo = bloccoDopo(corpo, "eAbbonamentoAgentiAI(");
    expect(corpo.indexOf("eAbbonamentoAgentiAI(")).toBeLessThan(corpo.indexOf('status: "expired"'));
    expect(ramo).toContain('aggiornaAbbonamentoAgentiAI(supabase, subscription.id, { status: "canceled" })');
    expect(ramo).toMatch(/return;\s*\}$/);
    expect(pianoToccato(ramo)).toEqual([]);
  });

  it("un loro aggiornamento non tocca stato e periodo del piano, né le sue email", () => {
    const corpo = corpoDi(webhook, "handleSubscriptionUpdated");
    const ramo = bloccoDopo(corpo, "eAbbonamentoAgentiAI(");
    expect(corpo.indexOf("eAbbonamentoAgentiAI(")).toBeLessThan(corpo.indexOf("stripe_subscription_status: stripeStatus"));
    expect(ramo).toContain("statoAgentiAI(");
    expect(ramo).toContain("aggiornaAbbonamentoAgentiAI(");
    expect(ramo).toMatch(/return;\s*\}$/);
    expect(ramo).not.toContain("sendSystemEmail");
    expect(pianoToccato(ramo)).toEqual([]);
  });

  it("un loro addebito rifiutato non manda l'azienda nei solleciti", () => {
    const corpo = corpoDi(webhook, "handleInvoicePaymentFailed");
    const ramo = bloccoDopo(corpo, "eAbbonamentoAgentiAI(");
    const posAgentiAI = corpo.indexOf("eAbbonamentoAgentiAI(");
    expect(posAgentiAI).toBeLessThan(corpo.indexOf("payment_failure_count: failureCount"));
    expect(posAgentiAI).toBeLessThan(corpo.indexOf("process-dunning"));
    expect(ramo).toContain('{ status: "past_due" }');
    expect(ramo).toMatch(/return;\s*\}$/);
    expect(pianoToccato(ramo)).toEqual([]);
  });

  it("una loro fattura pagata non riscrive il periodo del piano e non azzera i solleciti", () => {
    const corpo = corpoDi(webhook, "handleInvoicePaid");
    const ramo = bloccoDopo(corpo, "if (eAgentiAI)");
    expect(corpo.indexOf("eAbbonamentoAgentiAI(")).toBeLessThan(corpo.indexOf('.from("company_subscriptions")'));
    expect(ramo).toContain('status: "active"');
    expect(pianoToccato(ramo)).toEqual([]);
    // Il piano si aggiorna solo se la fattura non è né dell'add-on né degli Agenti AI.
    const posRamoPiano = corpo.indexOf("} else if (!eAddon) {");
    expect(posRamoPiano).toBeGreaterThan(corpo.indexOf("if (eAgentiAI)"));
    expect(posRamoPiano).toBeLessThan(corpo.indexOf('.from("company_subscriptions")'));
  });

  it("un loro abbonamento nuovo non attribuisce il referral del piano", () => {
    const ramo = webhook.split('case "customer.subscription.created":')[1]?.split("break;")[0] ?? "";
    expect(ramo).toMatch(/obj\.metadata\?\.type !== ABBONAMENTO_AGENTI_AI/);
    expect(ramo.indexOf("ABBONAMENTO_AGENTI_AI")).toBeLessThan(ramo.indexOf("handleReferralAttribution("));
  });
});

describe("Agenti AI · si scrive solo su ai_subscriptions", () => {
  const aggiorna = corpoDi(webhook, "aggiornaAbbonamentoAgentiAI");

  it("solo la riga di quell'abbonamento, e se la scrittura fallisce Stripe riconsegna", () => {
    expect(aggiorna).toContain('.from("ai_subscriptions")');
    expect(aggiorna).toContain('.eq("stripe_subscription_id", subscriptionId)');
    expect(aggiorna).toMatch(/if \(error\) throw new Error/);
    expect(pianoToccato(aggiorna)).toEqual([]);
  });

  it("un evento consegnato dopo la disdetta non riapre l'abbonamento", () => {
    expect(aggiorna).toMatch(/if \(campi\.status !== "canceled"\) aggiornamento = aggiornamento\.neq\("status", "canceled"\)/);
  });

  it("gli stati di Stripe diventano active, past_due e canceled", () => {
    const stati = corpoDi(webhook, "statoAgentiAI");
    expect(stati).toMatch(/case "active":\s*return "active";/);
    expect(stati).toMatch(/case "past_due":\s*case "unpaid":\s*return "past_due";/);
    expect(stati).toMatch(/case "canceled":\s*case "incomplete_expired":\s*return "canceled";/);
    // incomplete: il primo pagamento è in corso, lo stato resta com'è.
    expect(stati).toMatch(/default:[\s\S]*return null;/);
  });
});
