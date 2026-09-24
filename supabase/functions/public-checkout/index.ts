/**
 * public-checkout — checkout PUBBLICO per offerte in trattativa.
 *
 * Flusso (nessun login richiesto):
 *   1. Il prospect compila i suoi dati su una pagina pubblica (/offerta/:slug).
 *   2. Questa funzione crea account + azienda (in stato "trial" bloccato dal gate
 *      di attivazione finché non paga) e apre una sessione Stripe Checkout
 *      (abbonamento mensile) → ritorna l'URL a cui reindirizzare.
 *   3. Al pagamento, stripe-webhook (branch type="plan_signup") attiva l'azienda.
 *
 * SICUREZZA:
 *   - Il PREZZO è letto dal DB in base allo slug del piano, MAI dal client.
 *   - Solo gli slug in ALLOWED_OFFER_SLUGS sono acquistabili da qui.
 *   - I dati carta NON transitano mai da noi: la carta si inserisce sulla
 *     pagina ospitata di Stripe (PCI-compliant).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { createOrGetStripeCustomer } from "../_shared/stripeHelpers.ts";
import { renderEmailTemplate } from "../_shared/renderTemplate.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { conMetriche } from "../_shared/withMetrics.ts";
import { creaFasiCommessa } from "../_shared/fasiCommessa.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Slug dei piani acquistabili dalla pagina pubblica. Estendere qui per nuove offerte.
const ALLOWED_OFFER_SLUGS = new Set(["offerta-clienti-marketing"]);

const ALLOWED_SECTORS = new Set([
  "serramenti", "infissi", "bagni", "tetti", "fotovoltaico", "pittura", "ristrutturazioni", "altro",
]);

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(conMetriche("public-checkout", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const planSlug = String(body.plan_slug || "").trim();
    const companyName = String(body.company_name || "").trim().slice(0, 200);
    const firstName = String(body.first_name || "").trim().slice(0, 100);
    const lastName = String(body.last_name || "").trim().slice(0, 100);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 255);
    const phone = String(body.phone || "").trim().slice(0, 40);
    const password = String(body.password || "");
    const sector = ALLOWED_SECTORS.has(body.sector) ? body.sector : "altro";
    const billingPeriod = body.billing_period === "yearly" ? "yearly" : "monthly";
    // Dati fiscali (per attivazione immediata + fattura Stripe corretta)
    const businessName = String(body.business_name || "").trim().slice(0, 200);
    const vatNumber = String(body.vat_number || "").replace(/\D/g, "").slice(0, 13);
    const fiscalCode = String(body.fiscal_code || "").trim().toUpperCase().slice(0, 16);
    const legalAddress = String(body.legal_address || "").trim().slice(0, 200);
    const legalCity = String(body.legal_city || "").trim().slice(0, 100);
    const legalProvince = String(body.legal_province || "").trim().toUpperCase().slice(0, 2);
    const legalPostalCode = String(body.legal_postal_code || "").replace(/\D/g, "").slice(0, 5);

    // ── Validazione input ──
    if (!ALLOWED_OFFER_SLUGS.has(planSlug)) {
      return json(req, { error: "Offerta non valida" }, 400);
    }
    if (!companyName) return json(req, { error: "Inserisci il nome dell'azienda" }, 400);
    if (!firstName) return json(req, { error: "Inserisci il nome del referente" }, 400);
    if (!EMAIL_REGEX.test(email)) return json(req, { error: "Email non valida" }, 400);
    if (password.length < 8) return json(req, { error: "La password deve avere almeno 8 caratteri" }, 400);
    if (!businessName) return json(req, { error: "Inserisci la ragione sociale" }, 400);
    if (vatNumber.length < 11) return json(req, { error: "P.IVA non valida (11 cifre)" }, 400);
    if (!legalAddress || !legalCity || legalPostalCode.length !== 5) {
      return json(req, { error: "Completa l'indirizzo della sede legale (via, città, CAP)" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // ── Stripe configurato? ──
    const stripeSecretKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return json(req, { error: "Pagamenti non ancora configurati. Contatta l'assistenza." }, 400);
    }

    // ── Prezzo dal DB (mai dal client) ──
    const { data: plan, error: planErr } = await admin
      .from("subscription_plans")
      .select("id, slug, name, price_monthly, price_yearly")
      .eq("slug", planSlug)
      .maybeSingle();
    if (planErr || !plan) {
      return json(req, { error: "Piano non trovato" }, 404);
    }
    const priceEur = billingPeriod === "yearly"
      ? Number(plan.price_yearly)
      : Number(plan.price_monthly);
    if (!Number.isFinite(priceEur) || priceEur <= 0) {
      return json(req, { error: "Prezzo del piano non valido" }, 400);
    }

    // ── Email già registrata? ──
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingProfile) {
      return json(req, { error: "Esiste già un account con questa email. Accedi per procedere.", code: "email_exists" }, 409);
    }

    // ── Crea azienda (bloccata dal gate finché non paga) ──
    const { data: company, error: companyErr } = await admin
      .from("companies")
      .insert({
        name: companyName,
        email,
        phone: phone || null,
        sector,
        status: "trial",
        // trial già scaduto → il gate di attivazione richiede il pagamento.
        trial_ends_at: new Date().toISOString(),
        subscription_plan_id: plan.id,
        payment_method: "none",
        // Dati fiscali → il gate di attivazione passa subito dopo il pagamento.
        business_name: businessName,
        vat_number: vatNumber,
        fiscal_code: fiscalCode || null,
        legal_address: legalAddress,
        legal_city: legalCity,
        legal_province: legalProvince || null,
        legal_postal_code: legalPostalCode,
      })
      .select("id, name, email, stripe_customer_id")
      .single();
    if (companyErr || !company) {
      return json(req, { error: `Errore creazione azienda: ${companyErr?.message ?? "sconosciuto"}` }, 500);
    }
    const companyId = company.id as string;

    // ── Fasi commessa del settore, come dal form admin ──
    // Fino al 24/09 l'errore finiva nel log e l'azienda restava con la sola
    // «Assistenza» (_shared/fasiCommessa.ts).
    const fasi = await creaFasiCommessa(admin, companyId, sector);
    if (fasi.errore) {
      await admin.from("companies").delete().eq("id", companyId);
      return json(req, { error: `Errore creazione azienda: ${fasi.errore}` }, 500);
    }

    // ── Crea utente admin ──
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authErr || !authData?.user) {
      await admin.from("companies").delete().eq("id", companyId);
      const msg = authErr?.message?.includes("registered")
        ? "Esiste già un account con questa email."
        : `Errore creazione utente: ${authErr?.message ?? "sconosciuto"}`;
      return json(req, { error: msg, code: "auth_error" }, 409);
    }
    const newUserId = authData.user.id;

    // ── Profilo + ruolo (rollback in caso di errore) ──
    const { error: profileErr } = await admin.from("profiles").insert({
      id: newUserId,
      email,
      first_name: firstName || "Admin",
      last_name: lastName || companyName,
      company_id: companyId,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(newUserId);
      await admin.from("companies").delete().eq("id", companyId);
      return json(req, { error: `Errore profilo: ${profileErr.message}` }, 500);
    }

    const { error: roleErr } = await admin.from("user_roles").insert({
      user_id: newUserId,
      role: "company_admin",
    });
    if (roleErr) {
      await admin.from("profiles").delete().eq("id", newUserId);
      await admin.auth.admin.deleteUser(newUserId);
      await admin.from("companies").delete().eq("id", companyId);
      return json(req, { error: `Errore ruolo: ${roleErr.message}` }, 500);
    }

    // Dati di fatturazione (letti dalla pagina Abbonamento → "Informazioni fiscali").
    await admin.from("company_billing_details").upsert({
      company_id: companyId,
      legal_name: businessName,
      vat_number: vatNumber,
      tax_code: fiscalCode || null,
      address_line1: legalAddress,
      city: legalCity,
      province: legalProvince || null,
      postal_code: legalPostalCode,
      country: "IT",
      invoice_email: email,
    }, { onConflict: "company_id" }).then(({ error }) => { if (error) console.error("[public-checkout] company_billing_details:", error.message); });

    // ── Stripe: customer + Checkout Session (abbonamento) ──
    const appUrl = (await getPlatformSetting("site_url", "SITE_URL")) || Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
    const base = appUrl.replace(/\/$/, "");

    // ── Email di benvenuto ──
    // Chi si iscrive da solo e paga non riceveva NULLA: né conferma dell'account,
    // né link all'app. Solo la ricevuta Stripe. La password se l'è scelta lui nel
    // form, quindi la CTA porta al login; `?reset=1` resta la via d'uscita se non
    // se la ricorda. Best-effort: un guasto email non deve fermare il checkout.
    try {
      const rendered = await renderEmailTemplate({
        templateName: "welcome",
        companyId,
        platformBranding: true,
        adminClient: admin,
        props: {
          recipientName: firstName || "Admin",
          loginUrl: `${base}/login`,
          roleLabel: "Amministratore",
        },
      });
      await sendEmailUnified({
        companyId,
        stream: "transactional",
        to: [email],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        templateName: "welcome",
        skipCredits: true,
        platformSender: true,
        adminClient: admin,
      });
    } catch (e) {
      console.error("[public-checkout] invio email benvenuto fallito:", (e as Error)?.message);
    }

    let checkoutUrl: string;
    try {
      const stripeCustomerId = await createOrGetStripeCustomer(admin, stripeSecretKey, {
        id: companyId, name: companyName, email, stripe_customer_id: company.stripe_customer_id,
      });

      // Arricchisce il customer Stripe con ragione sociale + indirizzo + P.IVA,
      // così le fatture/ricevute Stripe risultano fiscalmente corrette. Best-effort.
      const stripeHdr = { Authorization: `Bearer ${stripeSecretKey}`, "Content-Type": "application/x-www-form-urlencoded" };
      try {
        await fetch(`https://api.stripe.com/v1/customers/${stripeCustomerId}`, {
          method: "POST", headers: stripeHdr,
          body: new URLSearchParams({
            name: businessName,
            "address[line1]": legalAddress,
            "address[city]": legalCity,
            "address[postal_code]": legalPostalCode,
            "address[state]": legalProvince,
            "address[country]": "IT",
          }),
        });
        await fetch(`https://api.stripe.com/v1/customers/${stripeCustomerId}/tax_ids`, {
          method: "POST", headers: stripeHdr,
          body: new URLSearchParams({ type: "eu_vat", value: `IT${vatNumber}` }),
        });
      } catch (e) {
        console.warn("[public-checkout] Stripe fiscal enrich fallito:", (e as Error).message);
      }

      const params = new URLSearchParams({
        customer: stripeCustomerId,
        mode: "subscription",
        "line_items[0][price_data][currency]": "eur",
        "line_items[0][price_data][unit_amount]": String(Math.round(priceEur * 100)),
        "line_items[0][price_data][recurring][interval]": billingPeriod === "yearly" ? "year" : "month",
        "line_items[0][price_data][product_data][name]": `${plan.name} — Edilizia in Cloud`,
        "line_items[0][quantity]": "1",
        success_url: `${base}/offerta/grazie?company=${companyId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/offerta/${planSlug}?annullato=1`,
        "metadata[company_id]": companyId,
        "metadata[type]": "plan_signup",
        "metadata[plan_slug]": planSlug,
        "metadata[plan_id]": String(plan.id),
        "subscription_data[metadata][company_id]": companyId,
        "subscription_data[metadata][plan_slug]": planSlug,
      });

      const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });
      const session = await sessionRes.json();
      if (session.error || !session.url) {
        throw new Error(session.error?.message || "Stripe non ha restituito un URL di pagamento");
      }
      checkoutUrl = session.url;
    } catch (stripeErr) {
      // Rollback totale: senza pagamento non lasciamo account orfani sbloccabili.
      await admin.from("user_roles").delete().eq("user_id", newUserId);
      await admin.from("profiles").delete().eq("id", newUserId);
      await admin.auth.admin.deleteUser(newUserId);
      await admin.from("order_statuses").delete().eq("company_id", companyId);
      await admin.from("companies").delete().eq("id", companyId);
      console.error("[public-checkout] Stripe error:", (stripeErr as Error).message);
      return json(req, { error: "Impossibile avviare il pagamento. Riprova o contatta l'assistenza." }, 502);
    }

    return json(req, { url: checkoutUrl, company_id: companyId });
  } catch (e) {
    console.error("[public-checkout] fatal:", (e as Error).message);
    return json(req, { error: "Errore interno. Riprova tra poco." }, 500);
  }
}));
