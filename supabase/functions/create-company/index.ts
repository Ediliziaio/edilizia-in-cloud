import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { emitPlatformEvent, PLATFORM_EVENTS } from "../_shared/platformAutomation.ts";
import { renderEmailTemplate } from "../_shared/renderTemplate.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

interface OrderStatusTemplate {
  name: string;
  icon: string;
  color: string;
  position: number;
  is_support_phase?: boolean;
}

type CompanySector =
  | "serramenti"
  | "infissi"
  | "bagni"
  | "tetti"
  | "fotovoltaico"
  | "pittura"
  | "ristrutturazioni"
  | "altro";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getOrderStatusTemplate(sector: CompanySector): OrderStatusTemplate[] {
  const serramentiInfissiTemplate: OrderStatusTemplate[] = [
    { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
    { name: "Acconto Pagato", icon: "CheckCircle", color: "#16A34A", position: 1 },
    { name: "Rilievo Tecnico", icon: "Ruler", color: "#CA8A04", position: 2 },
    { name: "In Produzione", icon: "Factory", color: "#7C3AED", position: 3 },
    { name: "Produzione Finita", icon: "Package", color: "#0891B2", position: 4 },
    { name: "Merce in Magazzino", icon: "Package", color: "#EA580C", position: 5 },
    { name: "Posa Programmata", icon: "Calendar", color: "#DB2777", position: 6 },
    { name: "Posa Completata", icon: "Home", color: "#16A34A", position: 7 },
    { name: "Assistenza", icon: "LifeBuoy", color: "#F59E0B", position: 8, is_support_phase: true },
  ];

  const fotovoltaicoTemplate: OrderStatusTemplate[] = [
    { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
    { name: "Acconto Pagato", icon: "CheckCircle", color: "#16A34A", position: 1 },
    { name: "Sopralluogo Tecnico", icon: "Clipboard", color: "#CA8A04", position: 2 },
    { name: "Progettazione", icon: "Ruler", color: "#7C3AED", position: 3 },
    { name: "Materiale Ordinato", icon: "Package", color: "#EA580C", position: 4 },
    { name: "Installazione Programmata", icon: "Calendar", color: "#DB2777", position: 5 },
    { name: "Installazione Completata", icon: "Wrench", color: "#2563EB", position: 6 },
    { name: "Collaudo", icon: "Shield", color: "#CA8A04", position: 7 },
    { name: "Pratica GSE", icon: "FileText", color: "#0891B2", position: 8 },
    { name: "Allaccio Rete", icon: "Zap", color: "#16A34A", position: 9 },
    { name: "Assistenza", icon: "LifeBuoy", color: "#F59E0B", position: 10, is_support_phase: true },
  ];

  const bagniRistrutturazioniTemplate: OrderStatusTemplate[] = [
    { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
    { name: "Acconto Pagato", icon: "CheckCircle", color: "#16A34A", position: 1 },
    { name: "Rilievo Tecnico", icon: "Ruler", color: "#CA8A04", position: 2 },
    { name: "Progettazione", icon: "Clipboard", color: "#7C3AED", position: 3 },
    { name: "Ordine Materiali", icon: "Package", color: "#0891B2", position: 4 },
    { name: "Demolizioni", icon: "Hammer", color: "#DC2626", position: 5 },
    { name: "Impianti", icon: "Wrench", color: "#EA580C", position: 6 },
    { name: "Posa", icon: "Factory", color: "#DB2777", position: 7 },
    { name: "Finiture", icon: "PaintBucket", color: "#7C3AED", position: 8 },
    { name: "Consegna", icon: "Home", color: "#16A34A", position: 9 },
    { name: "Assistenza", icon: "LifeBuoy", color: "#F59E0B", position: 10, is_support_phase: true },
  ];

  const defaultTemplate: OrderStatusTemplate[] = [
    { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
    { name: "In Lavorazione", icon: "Settings", color: "#CA8A04", position: 1 },
    { name: "Completato", icon: "CheckCircle", color: "#16A34A", position: 2 },
    { name: "Assistenza", icon: "LifeBuoy", color: "#F59E0B", position: 3, is_support_phase: true },
  ];

  switch (sector) {
    case "serramenti":
    case "infissi":
      return serramentiInfissiTemplate;
    case "fotovoltaico":
      return fotovoltaicoTemplate;
    case "bagni":
    case "ristrutturazioni":
      return bagniRistrutturazioniTemplate;
    case "tetti":
    case "pittura":
    case "altro":
    default:
      return defaultTemplate;
  }
}

Deno.serve(async (req) => {
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
    } = await req.json();

    // --- Input Validation ---
    if (!companyName || !companyEmail || !adminEmail || !adminPassword || !sector) {
      return errorResponse("Missing required fields");
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
      return errorResponse(`Company error: ${companyError.message}`);
    }

    const companyId = companyData.id;

    // Create admin user in auth.users
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: trimmedAdminEmail,
        password: adminPassword,
        email_confirm: true,
      });

    if (authError) {
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      return errorResponse(`Auth error: ${authError.message}`);
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
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      return errorResponse(`Profile error: ${profileError.message}`);
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
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      return errorResponse(`Role error: ${roleError.message}`);
    }

    // Create order statuses from template
    const statusTemplate = getOrderStatusTemplate(sector);
    const statusesToInsert = statusTemplate.map((status, index) => ({
      company_id: companyId,
      name: status.name,
      icon: status.icon,
      color: status.color,
      position: status.position,
      is_default: index === 0,
      is_support_phase: status.is_support_phase === true,
    }));

    const { error: statusError } = await supabaseAdmin
      .from("order_statuses")
      .insert(statusesToInsert);

    if (statusError) {
      console.error("Status error:", statusError);
    }

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
    // NON annulla la creazione dell'azienda (già committata sopra).
    try {
      const siteUrl =
        (await getPlatformSetting("site_url", "SITE_URL")) ||
        Deno.env.get("SITE_URL") ||
        "";
      const loginUrl = siteUrl ? `${siteUrl.replace(/\/$/, "")}/login` : "";
      const rendered = await renderEmailTemplate({
        templateName: "welcome",
        companyId,
        adminClient: supabaseAdmin,
        props: {
          recipientName: adminFirstName || "Admin",
          loginUrl,
          roleLabel: "Amministratore",
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
        adminClient: supabaseAdmin,
      });
    } catch (emailErr) {
      console.error("[create-company] invio email benvenuto fallito:", emailErr);
    }

    // Email 6 — copia dei documenti/termini accettati (prova legale B2B). Best-effort.
    try {
      const baseUrl = (await getPlatformSetting("site_url", "SITE_URL")) || Deno.env.get("SITE_URL") || "";
      const legalBase = baseUrl ? `${baseUrl.replace(/\/$/, "")}/legal` : "";
      const now = new Date();
      const dz = (opts: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", ...opts }).format(now);
      const rendered = await renderEmailTemplate({
        templateName: "terms_accepted",
        companyId,
        adminClient: supabaseAdmin,
        props: {
          recipientName: adminFirstName || "Admin",
          acceptedDate: dz({ day: "2-digit", month: "2-digit", year: "numeric" }),
          acceptedTime: dz({ hour: "2-digit", minute: "2-digit" }),
          tcUrl: legalBase ? `${legalBase}/termini.pdf` : "", tcVersion: "1.0",
          privacyUrl: legalBase ? `${legalBase}/privacy.pdf` : "", privacyVersion: "1.0",
          dpaUrl: legalBase ? `${legalBase}/dpa.pdf` : "", dpaVersion: "1.0",
          cookieUrl: legalBase ? `${legalBase}/cookie.pdf` : "", cookieVersion: "1.0",
          moduloOperaiUrl: legalBase ? `${legalBase}/modulo-privacy-lavoratori.pdf` : "",
        },
      });
      await sendEmailUnified({
        companyId, stream: "transactional", to: [trimmedAdminEmail],
        subject: rendered.subject, html: rendered.html, text: rendered.text,
        templateName: "terms_accepted", skipCredits: true, adminClient: supabaseAdmin,
      });
    } catch (emailErr) {
      console.error("[create-company] invio email termini fallito:", emailErr);
    }

    return jsonResponse({
      success: true,
      message: "Company created successfully",
      company: companyData,
      adminUserId: newUserId,
    });
  } catch (error) {
    if (error instanceof Response) return error;

    return errorResponse((error as Error).message);
  }
});

// redeploy 2026-06-25: propaga _shared email/branding (.it→.com + builder 58 email) — trigger CI HEAD~1 diff
