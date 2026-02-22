import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateSalespersonUserRequest {
  salesperson_id: string;
  email: string;
  password?: string;
  phone?: string;
  permissions?: Record<string, boolean>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non autorizzato");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) throw new Error("Non autorizzato");

    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!callerRole || !["company_admin", "super_admin"].includes(callerRole.role)) {
      throw new Error("Permessi insufficienti");
    }

    const { salesperson_id, email, password, phone, permissions }: CreateSalespersonUserRequest = await req.json();

    if (!salesperson_id || !email) {
      throw new Error("ID venditore ed email sono obbligatori");
    }

    const { data: salesperson, error: spError } = await supabaseAdmin
      .from("salespeople")
      .select("*, company:companies(name)")
      .eq("id", salesperson_id)
      .single();

    if (spError || !salesperson) throw new Error("Venditore non trovato");
    if (salesperson.user_id) throw new Error("Il venditore ha già un account utente");

    const finalPassword = password && password.trim().length > 0
      ? password.trim()
      : crypto.randomUUID().substring(0, 12);
    const isManualPassword = !!(password && password.trim().length > 0);

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: {
        first_name: salesperson.first_name,
        last_name: salesperson.last_name,
      },
    });

    if (createError || !newUser.user) {
      throw new Error(createError?.message || "Errore nella creazione utente");
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: newUser.user.id,
        email,
        first_name: salesperson.first_name,
        last_name: salesperson.last_name,
        company_id: salesperson.company_id,
        phone: phone || salesperson.phone,
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nella creazione profilo");
    }

    // Assign salesperson role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUser.user.id, role: "salesperson" });

    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nell'assegnazione ruolo");
    }

    // Also assign company_staff role so user appears in Users section
    const { error: staffRoleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUser.user.id, role: "company_staff" });

    if (staffRoleError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nell'assegnazione ruolo staff");
    }

    // Create staff_permissions record
    const permissionsRecord: Record<string, any> = {
      user_id: newUser.user.id,
      can_view_dashboard: false,
      can_view_orders: false,
      can_edit_orders: false,
      can_view_warehouse: false,
      can_edit_warehouse: false,
      can_view_calendar: false,
      can_view_customers: false,
      can_edit_customers: false,
      can_view_employees: false,
      can_view_tickets: false,
      can_edit_tickets: false,
      can_view_forecast: false,
      can_view_settings: false,
      can_view_marketing: false,
      can_edit_marketing: false,
      only_assigned: false,
    };

    if (permissions) {
      for (const [key, value] of Object.entries(permissions)) {
        if (key in permissionsRecord) {
          permissionsRecord[key] = value;
        }
      }
    }

    const { error: permError } = await supabaseAdmin
      .from("staff_permissions")
      .insert(permissionsRecord);

    if (permError) {
      console.error("Error creating staff_permissions:", permError);
    }

    // Link salesperson to user
    const { error: linkError } = await supabaseAdmin
      .from("salespeople")
      .update({ user_id: newUser.user.id })
      .eq("id", salesperson_id);

    if (linkError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nel collegamento venditore");
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user.id,
        temp_password: isManualPassword ? null : finalPassword,
        is_manual_password: isManualPassword,
        message: `Account creato per ${salesperson.first_name} ${salesperson.last_name}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Errore sconosciuto",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
