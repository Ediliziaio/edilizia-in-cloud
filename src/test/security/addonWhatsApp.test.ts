/**
 * Add-on WhatsApp Business (15/09/2026): a pagamento, incluso dai piani da
 * 247 €/mese, sbloccabile dal super admin.
 *
 * Il percorso vero (pagamento Stripe → webhook → override) non si esercita da
 * qui: servirebbe un evento firmato da Stripe. Si prova che i pezzi siano al
 * loro posto: il cancello davanti a Meta in ogni funzione che collega o invia,
 * l'esenzione della piattaforma, il checkout che non fa pagare due volte, e
 * che un abbonamento accessorio non faccia più scadere l'azienda.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(resolve(RADICE, p), "utf8");

const helper = leggi("supabase/functions/_shared/whatsappAddon.ts");
const config = leggi("supabase/functions/whatsapp-embedded-config/index.ts");
const connect = leggi("supabase/functions/whatsapp-connect/index.ts");
const send = leggi("supabase/functions/whatsapp-send/index.ts");
const mittente = leggi("supabase/functions/_shared/resolveWhatsAppSender.ts");
const checkout = leggi("supabase/functions/create-checkout-session/index.ts");
const webhook = leggi("supabase/functions/stripe-webhook/index.ts");

/** Il corpo di una funzione, fino alla successiva dichiarata al primo livello o alla sezione dopo. */
function corpoDi(sorgente: string, nome: string): string {
  const inizio = sorgente.indexOf(`function ${nome}(`);
  if (inizio < 0) throw new Error(`${nome} non trovata`);
  const fine = sorgente.slice(inizio + 1).search(/\n(?:export )?(?:async )?function |\n\/\/ ─── /);
  return fine < 0 ? sorgente.slice(inizio) : sorgente.slice(inizio, inizio + 1 + fine);
}

describe("add-on WhatsApp · chi decide", () => {
  it("decide il feature gating, con la chiave whatsapp", () => {
    expect(helper).toMatch(/rpc\("resolve_company_feature"/);
    expect(helper).toMatch(/p_feature_key: "whatsapp"/);
    expect(helper).toMatch(/is_enabled === true/);
  });

  it("la piattaforma e le demo non passano dall'add-on", () => {
    expect(helper).toContain("00000000-0000-0000-0000-000000000001");
    expect(helper).toContain("778a2c76-1253-49f2-a5e8-283363ac3e29");
    expect(helper).toContain("d2000000-0000-4000-a000-000000000002");
  });

  it("se il database non risponde si blocca il collegamento, non l'invio già dovuto", () => {
    expect(helper).toMatch(/return seNonVerificabile === "consenti"/);
    expect(corpoDi(helper, "cancelloAddonWhatsApp")).toContain('seNonVerificabile: "blocca"');
    expect(send).toMatch(/addonWhatsAppAttivo\(adminClient, companyId, \{ seNonVerificabile: "consenti" \}\)/);
    expect(mittente).toMatch(/addonWhatsAppAttivo\(client, companyId, \{ seNonVerificabile: "consenti" \}\)/);
  });

  it("risponde 402 con il codice che nel client apre l'offerta, non il dialog della carta", () => {
    expect(helper).toMatch(/status: 402/);
    expect(helper).toContain('CODICE_ADDON_WHATSAPP = "whatsapp_addon_required"');
    expect(leggi("src/lib/creditoEsaurito.ts")).toContain('"whatsapp_addon_required"');
  });
});

describe("add-on WhatsApp · il cancello sta davanti a Meta", () => {
  it("whatsapp-embedded-config non consegna la configurazione del popup", () => {
    const posCancello = config.indexOf("cancelloAddonWhatsApp(adminClient");
    expect(posCancello).toBeGreaterThan(config.indexOf("assertMetaCompanyAdminAccess(adminClient"));
    expect(posCancello).toBeLessThan(config.indexOf("getMetaCredentials()"));
  });

  it("whatsapp-connect non scambia il codice e non salva dati inseriti a mano", () => {
    const posCancello = connect.indexOf("cancelloAddonWhatsApp(supabase");
    expect(posCancello).toBeGreaterThan(0);
    expect(posCancello).toBeLessThan(connect.indexOf("oauth/access_token"));
    expect(posCancello).toBeLessThan(connect.indexOf("const hasManualToken ="));
  });

  it("whatsapp-send non consegna a Meta", () => {
    const posCancello = send.indexOf("addonWhatsAppAttivo(adminClient");
    expect(posCancello).toBeGreaterThan(0);
    expect(posCancello).toBeLessThan(send.indexOf("graph.facebook.com"));
  });

  it("resolveWhatsAppSender non restituisce il numero (automazioni, inbox, template)", () => {
    const posCancello = mittente.indexOf("addonWhatsAppAttivo(client");
    expect(posCancello).toBeGreaterThan(0);
    expect(posCancello).toBeLessThan(mittente.indexOf('.from("ai_whatsapp_numbers")'));
  });
});

describe("add-on WhatsApp · pagamento", () => {
  const ramo = checkout.split('if (type === "whatsapp_addon")')[1]?.split("// ─── EMAIL CREDITS")[0] ?? "";

  it("il checkout esiste e lo apre solo chi può collegare i numeri", () => {
    expect(ramo.length).toBeGreaterThan(0);
    expect(ramo.indexOf("assertMetaCompanyAdminAccess(")).toBeGreaterThan(-1);
    expect(ramo.indexOf("assertMetaCompanyAdminAccess(")).toBeLessThan(ramo.indexOf("checkout/sessions"));
  });

  it("chi l'ha già (piano, sblocco, add-on pagato) non paga due volte", () => {
    expect(ramo.indexOf("already_active")).toBeGreaterThan(-1);
    expect(ramo.indexOf("already_active")).toBeLessThan(ramo.indexOf("checkout/sessions"));
    expect(ramo).toMatch(/metadata\?\.type === "whatsapp_addon"/);
  });

  it("l'abbonamento porta il suo tipo: disdette e fatture si riconoscono", () => {
    expect(ramo).toContain('"subscription_data[metadata][type]": "whatsapp_addon"');
    expect(ramo).toContain('"metadata[type]": "whatsapp_addon"');
    expect(ramo).toMatch(/mode: "subscription"/);
  });

  it("il prezzo è quello del database, non scritto nel codice", () => {
    expect(ramo).toMatch(/from\("platform_feature_flags"\)/);
    expect(ramo).toMatch(/price_per_month/);
  });
});

describe("add-on WhatsApp · webhook", () => {
  it("il pagamento accende l'override addon_stripe dell'abbonamento", () => {
    expect(webhook).toMatch(/metadataType === ADDON_WHATSAPP/);
    expect(corpoDi(webhook, "attivaAddonWhatsApp")).toMatch(/access_level: "enabled"/);
    expect(webhook).toMatch(/`addon_stripe:\$\{subscriptionId\}`/);
  });

  it("uno sblocco del super admin non viene sovrascritto", () => {
    expect(corpoDi(webhook, "attivaAddonWhatsApp")).toMatch(/startsWith\("addon_stripe:"\)/);
  });

  it("disdire l'add-on non fa scadere l'azienda", () => {
    const corpo = corpoDi(webhook, "handleSubscriptionDeleted");
    const posAddon = corpo.indexOf("eAddonWhatsApp(");
    const posScadenza = corpo.indexOf('status: "expired"');
    expect(posAddon).toBeGreaterThan(0);
    expect(posAddon).toBeLessThan(posScadenza);
    expect(corpo.slice(posAddon, posScadenza)).toContain("return;");
  });

  it("aggiornare l'add-on non tocca stato e periodo del piano", () => {
    const corpo = corpoDi(webhook, "handleSubscriptionUpdated");
    const posAddon = corpo.indexOf("eAddonWhatsApp(");
    expect(posAddon).toBeGreaterThan(0);
    expect(posAddon).toBeLessThan(corpo.indexOf("stripe_subscription_status: stripeStatus"));
  });

  it("un rinnovo non pagato dell'add-on non manda l'azienda nei solleciti", () => {
    const corpo = corpoDi(webhook, "handleInvoicePaymentFailed");
    const posAddon = corpo.indexOf("eAddonWhatsApp(");
    expect(posAddon).toBeGreaterThan(0);
    expect(posAddon).toBeLessThan(corpo.indexOf("payment_failure_count: failureCount"));
  });

  it("una fattura pagata dell'add-on non riscrive il periodo del piano", () => {
    const corpo = corpoDi(webhook, "handleInvoicePaid");
    const posAddon = corpo.indexOf("eAddonWhatsApp(");
    expect(posAddon).toBeGreaterThan(0);
    expect(posAddon).toBeLessThan(corpo.indexOf('.from("company_subscriptions")'));
  });

  it("si spegne solo l'override di quell'abbonamento", () => {
    expect(corpoDi(webhook, "disattivaAddonWhatsApp")).toMatch(/\.eq\("override_reason", motivoAddonWhatsApp\(subscriptionId\)\)/);
  });
});

describe("add-on WhatsApp · migrazione", () => {
  const migrazione = (() => {
    const dir = resolve(RADICE, "supabase/migrations");
    const nome = readdirSync(dir).find((f) => f.endsWith("_addon_whatsapp_business.sql"));
    if (!nome) throw new Error("migrazione addon_whatsapp_business non trovata");
    return readFileSync(resolve(dir, nome), "utf8");
  })();

  it("WhatsApp non è più gratis per tutti: default spento, 30 €/mese", () => {
    expect(migrazione).toMatch(/default_value\s*=\s*false/);
    expect(migrazione).toMatch(/price_per_month\s*=\s*30/);
  });

  it("incluso da 247 €/mese; negli altri piani resta in vetrina", () => {
    expect(migrazione).toMatch(/price_monthly >= 247 THEN 'enabled' ELSE 'preview'/);
  });

  it("Il Bagno Group e la piattaforma restano accesi", () => {
    expect(migrazione).toContain("acfc59e3-ad4e-40a7-b0f5-e006f7341508");
    expect(migrazione).toContain("00000000-0000-0000-0000-000000000001");
  });

  it("chi scrive solo is_enabled non viene più ignorato", () => {
    expect(migrazione).toMatch(/NEW\.is_enabled IS DISTINCT FROM OLD\.is_enabled/);
    expect(migrazione).toMatch(/EXECUTE FUNCTION public\.sync_override_is_enabled_access_level\(\)/);
  });
});
