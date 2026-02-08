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
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Non autorizzato");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !caller) {
      throw new Error("Non autorizzato");
    }

    // Check if caller is company_admin or super_admin
    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!callerRole || !["company_admin", "super_admin"].includes(callerRole.role)) {
      throw new Error("Permessi insufficienti");
    }

    const { salesperson_id, email }: CreateSalespersonUserRequest = await req.json();

    if (!salesperson_id || !email) {
      throw new Error("ID venditore ed email sono obbligatori");
    }

    // Get salesperson data
    const { data: salesperson, error: spError } = await supabaseAdmin
      .from("salespeople")
      .select("*, company:companies(name)")
      .eq("id", salesperson_id)
      .single();

    if (spError || !salesperson) {
      throw new Error("Venditore non trovato");
    }

    // Check if salesperson already has a user
    if (salesperson.user_id) {
      throw new Error("Il venditore ha già un account utente");
    }

    // Generate temporary password
    const tempPassword = crypto.randomUUID().substring(0, 12);

    // Create auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
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
        phone: salesperson.phone,
      });

    if (profileError) {
      // Rollback: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nella creazione profilo");
    }

    // Assign salesperson role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUser.user.id,
        role: "salesperson",
      });

    if (roleError) {
      // Rollback
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nell'assegnazione ruolo");
    }

    // Link salesperson to user
    const { error: linkError } = await supabaseAdmin
      .from("salespeople")
      .update({ user_id: newUser.user.id })
      .eq("id", salesperson_id);

    if (linkError) {
      // Rollback
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Errore nel collegamento venditore");
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user.id,
        temp_password: tempPassword,
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
