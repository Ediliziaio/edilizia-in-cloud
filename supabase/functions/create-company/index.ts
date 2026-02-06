import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      companyName,
      companyEmail,
      adminEmail,
      adminPassword,
      adminFirstName,
      adminLastName,
      sector,
      logoUrl,
    } = await req.json();

    // Validate required fields
    if (!companyName || !companyEmail || !adminEmail || !adminPassword || !sector) {
      throw new Error("Missing required fields");
    }

    // Create company
    const { data: companyData, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: companyName,
        email: companyEmail,
        sector: sector as CompanySector,
        logo_url: logoUrl || null,
      })
      .select()
      .single();

    if (companyError) {
      throw new Error(`Company error: ${companyError.message}`);
    }

    const companyId = companyData.id;

    // Create admin user in auth.users
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });

    if (authError) {
      // Rollback company creation
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      throw new Error(`Auth error: ${authError.message}`);
    }

    const userId = authData.user.id;

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        email: adminEmail,
        first_name: adminFirstName || "Admin",
        last_name: adminLastName || companyName,
        company_id: companyId,
      });

    if (profileError) {
      // Rollback
      await supabaseAdmin.auth.admin.deleteUser(userId);
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      throw new Error(`Profile error: ${profileError.message}`);
    }

    // Assign company_admin role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: "company_admin",
      });

    if (roleError) {
      // Rollback
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      await supabaseAdmin.from("companies").delete().eq("id", companyId);
      throw new Error(`Role error: ${roleError.message}`);
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
      // Non-critical, don't rollback
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Company created successfully",
        company: companyData,
        adminUserId: userId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
