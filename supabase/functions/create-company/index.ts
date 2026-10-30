import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { emitPlatformEvent, PLATFORM_EVENTS } from "../_shared/platformAutomation.ts";
import { renderEmailTemplate } from "../_shared/renderTemplate.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { conMetriche } from "../_shared/withMetrics.ts";
import { creaFasiCommessa, type CompanySector } from "../_shared/fasiCommessa.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(conMetriche("create-company", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    // --- Authentication & Authorization: only super_admin can create companies ---
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);

    const {
      companyName,
      companyEmail,
      adminEmail,
      adminPassword,
      adminFirstName,
      adminLastName,
      sector,
      logoUrl,
      businessName,
      vatNumber,
      fiscalCode,
      phone,
      pec,
      sdiCode,
      website,
      legalAddress,
      legalCity,
      legalProvince,
      legalPostalCode,
      operationalAddress,
      operationalCity,
      operationalProvince,
      operationalPostalCode,
      planId,
      inviaBenvenuto,
    } = await req.json();

    // --- Input Validation ---
    if (!companyName || !companyEmail || !adminEmail || !adminPassword || !sector) {
      return errorResponse("Mancano dati obbligatori: nome ed email dell'azienda, settore, email e password dell'amministratore");
    }

    const trimmedCompanyName = String(companyName).trim().slice(0, 200);
    const trimmedCompanyEmail = String(companyEmail).trim().toLowerCase().slice(0, 255);
    const trimmedAdminEmail = String(adminEmail).trim().toLowerCase().slice(0, 255);

    if (!EMAIL_REGEX.test(trimmedCompanyEmail) || !EMAIL_REGEX.test(trimmedAdminEmail)) {
      return errorResponse("Indirizzo email non valido");
    }

    if (String(adminPassword).length < 8) {
      return errorResponse("La password deve avere almeno 8 caratteri");
    }

    // Resolve trial_days from selected plan (default 14 if no plan or field missing).
    // Piani a prezzo zero (Scopri, Marketing): l'azienda parte "free" senza scadenza
    // prova. Il Piano Marketing in più è regalato per definizione (lo dà il gestore
    // ai suoi clienti marketing) → payment_method "comped", così il gate di
    // attivazione fatturazione non blocca il cliente al primo accesso.
    let trialDays = 14;
    let isFreePlan = false;
    let isCompedPlan = false;
    if (planId) {
      const { data: planData } = await supabaseAdmin
        .from("subscription_plans")
        .select("slug, trial_days, price_monthly")
        .eq("id", planId)
        .maybeSingle();
      if (planData?.trial_days != null) {
        trialDays = planData.trial_days;
      }
      isFreePlan = planData?.slug === "scopri" || Number(planData?.price_monthly ?? -1) === 0;
      isCompedPlan = planData?.slug === "marketing";
    }
    const trialEndsAt = new Date(Date.now() + trialDays * 86400 * 1000).toISOString();

    // Create company
    const { data: companyData, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: trimmedCompanyName,
        email: trimmedCompanyEmail,
        sector: sector as CompanySector,
        logo_url: logoUrl || null,
        business_name: businessName || null,
        vat_number: vatNumber || null,
        fiscal_code: fiscalCode || null,
        phone: phone || null,
        pec: pec || null,
        sdi_code: sdiCode || null,
        website: website || null,
        legal_address: legalAddress || null,
        legal_city: legalCity || null,
        legal_province: legalProvince || null,
        legal_postal_code: legalPostalCode || null,
        operational_address: operationalAddress || null,
        operational_city: operationalCity || null,
        operational_province: operationalProvince || null,
        operational_postal_code: operationalPostalCode || null,
        status: isFreePlan ? "free" : "trial",
        trial_ends_at: isFreePlan ? null : trialEndsAt,
        subscription_plan_id: planId || null,
        ...(isCompedPlan ? { payment_method: "comped" } : {}),
      })
      .select()
      .single();

    if (companyError) {
      // il controllo della P. IVA e dell'email unica sta nel database: il suo
      // messaggio va detto in chiaro, non dopo «Company error:»
      const doppia = companyError.code === "23505";
      return errorResponse(doppia
        ? "Esiste già un'azienda con questi dati (email o P. IVA): controlla nell'elenco Aziende"
        : `Azienda non creata: ${companyError.message}`);
    }

    const companyId = companyData.id;

    // Fasi commessa del settore, prima dell'utente: se non si creano, l'azienda
    // non nasce e il form mostra il motivo. Fino al 24/09 l'errore finiva solo
    // nel log e l'azienda restava con la sola «Assistenza» (_shared/fasiCommessa.ts).
    // Se un passo fallisce si toglie quello che è già nato. Se anche la pulizia
    // fallisce (righe create dai trigger) va detto: prima restava un'azienda
    // senza amministratore e il messaggio parlava d'altro.
    const annullaAzienda = async (): Promise<string> => {
      const { error } = await supabaseAdmin.from("companies").delete().eq("id", companyId);
      if (error) {
        console.error("[create-company] pulizia dell'azienda non riuscita:", error.message);
        return ` L'azienda «${trimmedCompanyName}» però è rimasta: eliminala dall'elenco Aziende prima di riprovare.`;
      }
      return "";
    };

    const fasi = await creaFasiCommessa(supabaseAdmin, companyId, sector);
    if (fasi.errore) {
      return errorResponse(`Fasi commessa non create: ${fasi.errore}.${await annullaAzienda()}`);
    }

    // Create admin user in auth.users
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: trimmedAdminEmail,
        password: adminPassword,
        email_confirm: true,
      });

    if (authError) {
      const resto = await annullaAzienda();
      const giaRegistrata = /already been registered|already exists|email_exists/i.test(authError.message);
      return errorResponse(giaRegistrata
        ? `Esiste già un utente con l'email ${trimmedAdminEmail}: usa un'altra email per l'amministratore.${resto}`
        : `Utente amministratore non creato: ${authError.message}.${resto}`);
    }

    const newUserId = authData.user.id;

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: newUserId,
        email: trimmedAdminEmail,
        first_name: adminFirstName || "Admin",
        last_name: adminLastName || trimmedCompanyName,
        company_id: companyId,
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return errorResponse(`Profilo dell'amministratore non creato: ${profileError.message}.${await annullaAzienda()}`);
    }

    // Assign company_admin role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUserId,
        role: "company_admin",
      });

    if (roleError) {
      await supabaseAdmin.from("profiles").delete().eq("id", newUserId);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return errorResponse(`Ruolo dell'amministratore non assegnato: ${roleError.message}.${await annullaAzienda()}`);
    }

    // L'amministratore creato qui è il titolare: prima restava vuoto (tra le
    // ultime 12 aziende create, solo una lo aveva). Non blocca la creazione.
    const { error: titolareError } = await supabaseAdmin
      .from("companies")
      .update({ titolare_user_id: newUserId })
      .eq("id", companyId);
    if (titolareError) console.error("[create-company] titolare non impostato:", titolareError.message);

    // Trigger di PIATTAFORMA: notifica il motore automazioni admin (best-effort).
    await emitPlatformEvent(supabaseAdmin, PLATFORM_EVENTS.COMPANY_CREATED, {
      entityId: companyId,
      entityType: "company",
      payload: {
        "azienda.id": companyId,
        "azienda.name": companyData.name,
        "azienda.email": companyData.email,
        "azienda.created_at": companyData.created_at,
        // Variabili personali per le sequenze email (saluti personalizzati):
        // {{nome}} = nome dell'admin, {{cognome}}, {{azienda}} = nome azienda.
        "nome": adminFirstName || "",
        "cognome": adminLastName || "",
        "azienda": companyData.name,
      },
    });

    // Email di BENVENUTO all'admin (1.1 — subito). Best-effort: un errore di invio
    // NON annulla la creazione dell'azienda (già committata sopra). Si può non
    // mandare (spunta nel modulo): in mancanza del campo parte, come prima.
    if (inviaBenvenuto !== false) try {
      const siteUrl =
        (await getPlatformSetting("site_url", "SITE_URL")) ||
        Deno.env.get("SITE_URL") ||
        "";
      const base = siteUrl.replace(/\/$/, "");
      // CTA benvenuto: link ALLA PAGINA di accesso, non un token.
      //
      // Prima qui si generava un link recovery one-shot e lo si incollava
      // nell'email. Ma quel token comincia a scadere quando l'email PARTE, non
      // quando l'utente clicca: chi apriva il benvenuto il giorno dopo trovava
      // "Email link is invalid or has expired" e restava fuori. Successo davvero
      // (Best Infissi, 21/07: email alle 09:14, primo clic tre giorni dopo).
      //
      // La password l'ha scelta chi crea l'azienda: l'email la scrive e il
      // bottone porta dritto all'accesso. Senza password scritta il cliente non
      // saprebbe con cosa entrare (30/10: il benvenuto lo mandava a reimpostarla).
      const loginUrl = base ? `${base}/login` : "";
      const rendered = await renderEmailTemplate({
        templateName: "welcome",
        companyId,
        platformBranding: true,
        adminClient: supabaseAdmin,
        props: {
          recipientName: adminFirstName || "Admin",
          loginUrl,
          roleLabel: "Amministratore",
          companyName: trimmedCompanyName,
          loginEmail: trimmedAdminEmail,
          password: String(adminPassword),
        },
      });
      await sendEmailUnified({
        companyId,
        stream: "transactional",
        to: [trimmedAdminEmail],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        templateName: "welcome",
        skipCredits: true,
        platformSender: true,
        adminClient: supabaseAdmin,
      });
    } catch (emailErr) {
      console.error("[create-company] invio email benvenuto fallito:", emailErr);
    }

    // Niente email «copia dei termini accettati»: l'azienda la crea il super
    // admin e il cliente non ha accettato niente. Quell'email dava data e ora di
    // un'accettazione mai avvenuta; si manda quando il cliente accetta davvero.

    return jsonResponse({
      success: true,
      message: "Azienda creata",
      company: companyData,
      adminUserId: newUserId,
    });
  } catch (error) {
    if (error instanceof Response) return error;

    return errorResponse((error as Error).message);
  }
}));

// redeploy 2026-06-25: propaga _shared email/branding (.it→.com + builder 58 email) — trigger CI HEAD~1 diff
