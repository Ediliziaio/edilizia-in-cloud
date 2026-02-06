import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateSecurePassword(): string {
  const length = 12;
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const special = "!@#$%&*";
  const allChars = lowercase + uppercase + numbers + special;

  let password = "";
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
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

    // Get authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Verify the caller is authenticated
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: caller },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      throw new Error("Unauthorized");
    }

    // Check if caller is super_admin or company_admin
    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!callerRole || (callerRole.role !== "super_admin" && callerRole.role !== "company_admin")) {
      throw new Error("Permission denied: Only admins can reset passwords");
    }

    const { customer_id } = await req.json();

    if (!customer_id) {
      throw new Error("Missing customer_id");
    }

    // Get customer profile
    const { data: customerProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, email, first_name, last_name")
      .eq("id", customer_id)
      .single();

    if (profileError || !customerProfile) {
      throw new Error("Customer not found");
    }

    // Verify caller has access to this customer
    if (callerRole.role === "company_admin") {
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", caller.id)
        .single();

      if (callerProfile?.company_id !== customerProfile.company_id) {
        throw new Error("Permission denied: Cannot reset password for customers in other companies");
      }
    }

    // Verify target is actually a customer
    const { data: targetRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", customer_id)
      .single();

    if (!targetRole || targetRole.role !== "customer") {
      throw new Error("Target user is not a customer");
    }

    // Generate new password
    const newPassword = generateSecurePassword();

    // Update password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      customer_id,
      { password: newPassword }
    );

    if (updateError) {
      throw new Error(`Failed to update password: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Password reset successfully",
        newPassword,
        customer: {
          id: customerProfile.id,
          email: customerProfile.email,
          firstName: customerProfile.first_name,
          lastName: customerProfile.last_name,
        },
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
