import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

interface OrderStatusTemplate {
  name: string;
  icon: string;
  color: string;
  position: number;
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
  ];

  const fotovoltaicoTemplate: OrderStatusTemplate[] = [
    { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
    { name: "Acconto Pagato", icon: "CheckCircle", color: "#16A34A", position: 1 },
    { name: "Sopralluogo Tecnico", icon: "Clipboard", color: "#CA8A04", position: 2 },
    { name: "Progettazione", icon: "Ruler", color: "#7C3AED", position: 3 },
    { name: "Pratica GSE", icon: "FileText", color: "#0891B2", position: 4 },
    { name: "Materiale Ordinato", icon: "Package", color: "#EA580C", position: 5 },
    { name: "Installazione Programmata", icon: "Calendar", color: "#DB2777", position: 6 },
    { name: "Installazione Completata", icon: "Wrench", color: "#2563EB", position: 7 },
    { name: "Collaudo", icon: "Shield", color: "#CA8A04", position: 8 },
    { name: "Allaccio Rete", icon: "Zap", color: "#16A34A", position: 9 },
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
  ];

  const defaultTemplate: OrderStatusTemplate[] = [
    { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
    { name: "In Lavorazione", icon: "Settings", color: "#CA8A04", position: 1 },
    { name: "Completato", icon: "CheckCircle", color: "#16A34A", position: 2 },
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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Authentication & Authorization: only super_admin can create companies ---
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsHeaders);

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
    }));

    const { error: statusError } = await supabaseAdmin
      .from("order_statuses")
      .insert(statusesToInsert);

    if (statusError) {
      console.error("Status error:", statusError);
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
