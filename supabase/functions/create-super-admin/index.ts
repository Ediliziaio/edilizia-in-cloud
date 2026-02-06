import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-bootstrap-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bootstrapKey = Deno.env.get("SUPER_ADMIN_BOOTSTRAP_KEY");

    // Verify bootstrap key is configured
    if (!bootstrapKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Bootstrap key not configured. Please configure SUPER_ADMIN_BOOTSTRAP_KEY secret.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // Verify bootstrap key from request header
    const requestBootstrapKey = req.headers.get("x-bootstrap-key");
    if (!requestBootstrapKey || requestBootstrapKey !== bootstrapKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized: Invalid or missing bootstrap key",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if super admin already exists
    const { count: existingSuperAdminCount, error: countError } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "super_admin");

    if (countError) {
      throw new Error(`Error checking existing super admins: ${countError.message}`);
    }

    if (existingSuperAdminCount && existingSuperAdminCount > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Super admin already exists. This function can only be used for initial setup.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Get email and password from request body
    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email and password are required",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Password must be at least 8 characters long",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Check if user already exists in auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    if (existingUser) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "A user with this email already exists",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Create user in auth.users
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      throw new Error(`Auth error: ${authError.message}`);
    }

    const userId = authData.user.id;

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        email,
        first_name: "Super",
        last_name: "Admin",
        company_id: null,
      });

    if (profileError) {
      // Cleanup: delete auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`Profile error: ${profileError.message}`);
    }

    // Assign super_admin role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: "super_admin",
      });

    if (roleError) {
      // Cleanup: delete auth user and profile if role creation fails
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`Role error: ${roleError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Super admin created successfully",
        userId,
        email,
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
