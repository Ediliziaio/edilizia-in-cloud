/**
 * MRR e abbonamenti accessori (15/09/2026): accanto al piano, sullo stesso
 * customer Stripe, un'azienda può avere l'add-on WhatsApp Business e gli Agenti
 * AI. sync-stripe-mrr li contava come piano: un'azienda da 127 € con l'add-on
 * risultava 157 € su Stripe contro 127 € interni, contata due volte fra le
 * aziende Stripe, e con un «prezzo diverso dal piano» che non esiste.
 *
 * Il calcolo vero (Stripe più database) non si esercita da qui. Si prova che gli
 * accessori si riconoscano con gli stessi segni che scrivono checkout e webhook,
 * che il MRR confrontato con quello interno conti solo il piano, e che gli
 * accessori restino contati a parte.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(resolve(RADICE, p), "utf8");

const mrr = leggi("supabase/functions/sync-stripe-mrr/index.ts");
const checkout = leggi("supabase/functions/create-checkout-session/index.ts");
const webhook = leggi("supabase/functions/stripe-webhook/index.ts");

/** Il corpo di una funzione, fino alla successiva al primo livello, alla sezione dopo o all'handler. */
function corpoDi(sorgente: string, nome: string): string {
  const inizio = sorgente.indexOf(`function ${nome}(`);
  if (inizio < 0) throw new Error(`${nome} non trovata`);
  const fine = sorgente
    .slice(inizio + 1)
    .search(/\n(?:export )?(?:async )?function |\n\/\/ ─── |\nserveConMetriche\(/);
  return fine < 0 ? sorgente.slice(inizio) : sorgente.slice(inizio, inizio + 1 + fine);
}

describe("MRR · come si riconosce un accessorio", () => {
  it("con i tipi che il checkout scrive sull'abbonamento", () => {
    for (const tipo of ["whatsapp_addon", "ai_subscription"]) {
      expect(checkout).toContain(`"subscription_data[metadata][type]": "${tipo}"`);
      expect(mrr).toMatch(new RegExp(`\\["${tipo}", "[^"]+"\\]`));
    }
  });

  it("prima i metadati, poi i registri del webhook", () => {
    const tipo = corpoDi(mrr, "tipoAccessorio");
    const posMetadati = tipo.indexOf("sub.metadata?.type");
    expect(posMetadati).toBeGreaterThan(0);
    expect(posMetadati).toBeLessThan(tipo.indexOf("registrati.get(sub.id)"));
    // Una Map e non un oggetto: "toString" nei metadati non diventa un accessorio.
    expect(tipo).toContain("ACCESSORI.has(tipo)");
  });

  it("i registri sono quelli che scrive stripe-webhook", () => {
    const registri = corpoDi(mrr, "accessoriRegistrati");
    expect(registri).toContain('.from("ai_subscriptions").select("stripe_subscription_id")');
    expect(registri).toContain('.from("company_feature_overrides").select("override_reason").eq("feature_key", "whatsapp")');
    expect(mrr).toContain('const PREFISSO_ADDON = "addon_stripe:";');
    expect(webhook).toContain("`addon_stripe:${subscriptionId}`");
    expect(webhook).toContain('stripe_subscription_id: stripeSubscriptionId,');
  });

  it("se i registri non rispondono non si scrive uno snapshot sbagliato", () => {
    const registri = corpoDi(mrr, "accessoriRegistrati");
    expect(registri.match(/if \(\w+\.error\) throw new Error/g)?.length).toBe(2);
  });
});

describe("MRR · il piano si confronta con il piano", () => {
  const calcolo = corpoDi(mrr, "riconcilia");

  it("MRR Stripe, aziende Stripe e breakdown contano solo gli abbonamenti del piano", () => {
    expect(calcolo).toMatch(/const mrrStripe = subPiano\.reduce/);
    expect(calcolo).toMatch(/const aziendeAttivaStripe = new Set\(subPiano\.map/);
    expect(calcolo).toMatch(/subPiano\.forEach\(\(sub\) => \{\s*const planName/);
    expect(calcolo).not.toMatch(/subNostre\.(reduce|forEach|length)/);
  });

  it("gli accessori hanno il loro totale e le loro righe, come gli altri prodotti AEDIX", () => {
    expect(calcolo).toMatch(/const mrrAccessori = subAccessori\.reduce/);
    expect(calcolo).toContain("motivo: `abbonamento accessorio: ${ACCESSORI.get(tipo)}`");
    expect(calcolo).toContain('motivo: "altro prodotto AEDIX"');
  });

  it("il confronto col piano è uno per azienda, sulla somma dei suoi abbonamenti", () => {
    const posSomma = calcolo.indexOf("voce.mrr += calcMrrCents(sub)");
    const posConfronto = calcolo.indexOf("if (mrrNostro === mrr) continue;");
    expect(posSomma).toBeGreaterThan(0);
    expect(posConfronto).toBeGreaterThan(posSomma);
    expect(calcolo).toContain('"più abbonamenti del piano su Stripe"');
    // Il confronto non passa più abbonamento per abbonamento.
    expect(calcolo).not.toMatch(/for \(const sub of subscriptions\)/);
  });

  it("un accessorio pagato non nasconde un piano che su Stripe manca", () => {
    expect(calcolo).toMatch(/if \(pianoSuStripe\.has\(c\.id\)\) continue;/);
    expect(calcolo).toContain('motivo: "nessun abbonamento del piano su Stripe"');
  });
});

describe("MRR · snapshot e risposta", () => {
  it("il MRR confrontato resta nel campo di sempre, gli accessori vanno a parte", () => {
    expect(mrr).toContain("mrr_stripe_cents: r.mrrStripe");
    expect(mrr).toContain("aziende_attive_stripe: r.aziendeAttivaStripe");
    expect(mrr).toContain("mrr_accessori_cents: r.mrrAccessori");
    expect(mrr).toContain("abbonamenti_accessori: r.abbonamentiAccessori");
    expect(mrr).toContain("mrr_accessori: r.mrrAccessori");
  });

  it("senza le colonne nuove lo snapshot si salva lo stesso, senza accessori", () => {
    const pos = mrr.indexOf("/mrr_accessori_cents|abbonamenti_accessori/.test(upsertError.message)");
    expect(pos).toBeGreaterThan(0);
    expect(mrr.slice(pos, pos + 400)).toContain("await salva(snapshot)");
  });
});
