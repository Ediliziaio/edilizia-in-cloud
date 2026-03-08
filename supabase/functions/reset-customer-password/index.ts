import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaProvider, loadProviderSettings } from "../_shared/emailProvider.ts";

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
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) throw new Error("Unauthorized");

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const callerRoleNames = (callerRoles || []).map((r: any) => r.role);
    const callerIsAdmin = callerRoleNames.includes("super_admin") || callerRoleNames.includes("company_admin");
    if (!callerIsAdmin) throw new Error("Permission denied: Only admins can reset passwords");

    const callerRole = callerRoleNames.includes("super_admin") ? { role: "super_admin" } : { role: "company_admin" };

    const body = await req.json();
    const targetUserId = body.customer_id || body.userId;
    const newPassword = body.new_password;
    if (!targetUserId) throw new Error("Missing customer_id or userId");

    const { data: targetProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, email, first_name, last_name")
      .eq("id", targetUserId)
      .single();

    if (profileError || !targetProfile) throw new Error("User not found");

    if (callerRole.role === "company_admin") {
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", caller.id)
        .single();
      if (callerProfile?.company_id !== targetProfile.company_id) {
        throw new Error("Permission denied: Cannot reset password for users in other companies");
      }
    }

    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId);

    const targetRoleNames = (targetRoles || []).map((r: any) => r.role);
    if (targetRoleNames.length === 0) throw new Error("Target user has no role");
    if (targetRoleNames.includes("super_admin")) throw new Error("Cannot reset super admin password");
    if (callerRole.role === "company_admin" && targetRoleNames.includes("company_admin") && targetUserId !== caller.id) {
      throw new Error("Permission denied: Cannot reset another admin's password");
    }

    const finalPassword = newPassword || generateSecurePassword();

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      { password: finalPassword }
    );
    if (updateError) throw new Error(`Failed to update password: ${updateError.message}`);

    // Send password reset email via transactional provider
    if (targetProfile.email) {
      try {
        let settings = await loadProviderSettings("transactional");
        if (!settings.apiKey) settings = await loadProviderSettings("marketing");

        if (settings.apiKey) {
          await sendViaProvider(settings.provider, settings.apiKey, {
            from: settings.fromDefault,
            fromName: settings.fromName,
            to: [targetProfile.email],
            subject: "Password reimpostata",
            html: `<html><body>
              <p>Ciao ${targetProfile.first_name || ""},</p>
              <p>La tua password è stata reimpostata dall'amministratore.</p>
              <p>La tua nuova password temporanea è: <strong>${finalPassword}</strong></p>
              <p>Ti consigliamo di cambiarla al primo accesso.</p>
            </body></html>`,
          });
        }
      } catch (emailErr) {
        console.error("Failed to send password reset email:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Password reset successfully",
        newPassword: finalPassword,
        temporaryPassword: finalPassword,
        customer: {
          id: targetProfile.id,
          email: targetProfile.email,
          firstName: targetProfile.first_name,
          lastName: targetProfile.last_name,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
