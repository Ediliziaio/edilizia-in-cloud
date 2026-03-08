import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaProvider, loadProviderSettings } from "../_shared/emailProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateSecurePassword(length = 12): string {
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const special = "!@#$%^&*";
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

    const { first_name, last_name, email, phone, address, company_id, fiscal_code, site_address, notes } = await req.json();

    if (!first_name || !last_name || !email || !company_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const password = generateSecurePassword(12);

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name },
    });

    if (authError) {
      const isEmailExists = authError.message?.includes("already been registered") ||
                            (authError as any).code === "email_exists";
      const errorMessage = isEmailExists
        ? "Esiste già un utente con questo indirizzo email. Usa un'email diversa."
        : authError.message;
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authUser.user.id;

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      first_name,
      last_name,
      email: email.toLowerCase(),
      phone: phone || null,
      address: address || null,
      company_id,
      fiscal_code: fiscal_code || null,
      site_address: site_address || null,
      notes: notes || null,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: "Failed to create profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "customer",
    });

    if (roleError) {
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: "Failed to assign role" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send welcome email via transactional provider
    try {
      let settings = await loadProviderSettings("transactional");
      if (!settings.apiKey) settings = await loadProviderSettings("marketing");

      if (settings.apiKey) {
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("name")
          .eq("id", company_id)
          .single();

        await sendViaProvider(settings.provider, settings.apiKey, {
          from: settings.fromDefault,
          fromName: settings.fromName,
          to: [email.toLowerCase()],
          subject: `Benvenuto su ${company?.name || "la piattaforma"}`,
          html: `<html><body>
            <p>Ciao ${first_name},</p>
            <p>Il tuo account è stato creato su <strong>${company?.name || "la piattaforma"}</strong>.</p>
            <p>Ecco le tue credenziali di accesso:</p>
            <ul>
              <li><strong>Email:</strong> ${email.toLowerCase()}</li>
              <li><strong>Password:</strong> ${password}</li>
            </ul>
            <p>Ti consigliamo di cambiare la password al primo accesso.</p>
          </body></html>`,
        });
      }
    } catch (emailErr) {
      console.error("Failed to send welcome email:", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        customer: { id: userId, first_name, last_name, email: email.toLowerCase(), phone, address },
        password,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
