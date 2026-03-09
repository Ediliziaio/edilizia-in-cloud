import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + (Deno.env.get("IP_HASH_SALT") || "form-salt-2024"));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { form_id, data: formData, session_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term } = body;

    if (!form_id || !formData) {
      return new Response(
        JSON.stringify({ error: "form_id and data required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get form definition
    const { data: form, error: formError } = await supabase
      .from("lead_forms")
      .select("id, company_id, fields, settings, is_published")
      .eq("id", form_id)
      .single();

    if (formError || !form) {
      return new Response(
        JSON.stringify({ error: "Form not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!form.is_published) {
      return new Response(
        JSON.stringify({ error: "Form not published" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    const fields = (form.fields as any[]) || [];
    for (const field of fields) {
      if (field.required && !formData[field.name]) {
        return new Response(
          JSON.stringify({ error: `Campo obbligatorio: ${field.label || field.name}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const clientIP =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const ip_hash = await hashIP(clientIP);

    // Upsert contact by email if present
    let contactId: string | null = null;
    const email = formData.email || formData.Email || formData.EMAIL;
    if (email && typeof email === "string" && email.includes("@")) {
      const firstName = formData.first_name || formData.nome || formData.name || formData.Nome || email.split("@")[0];
      const lastName = formData.last_name || formData.cognome || formData.surname || formData.Cognome || null;
      const phone = formData.phone || formData.telefono || formData.Phone || formData.Telefono || null;

      // Check existing
      const { data: existing } = await supabase
        .from("marketing_contacts")
        .select("id")
        .eq("company_id", form.company_id)
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (existing) {
        contactId = existing.id;
        // Update last activity
        await supabase
          .from("marketing_contacts")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", contactId);
      } else {
        const { data: newContact } = await supabase
          .from("marketing_contacts")
          .insert({
            company_id: form.company_id,
            email: email.toLowerCase().trim(),
            first_name: firstName,
            last_name: lastName,
            phone,
            source: "form",
            attr_source: utm_source || null,
            attr_medium: utm_medium || null,
            attr_campaign: utm_campaign || null,
            attr_content: utm_content || null,
          })
          .select("id")
          .single();
        if (newContact) contactId = newContact.id;
      }
    }

    // Save submission
    const { error: subError } = await supabase.from("form_submissions").insert({
      form_id,
      company_id: form.company_id,
      contact_id: contactId,
      data: formData,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_content: utm_content || null,
      utm_term: utm_term || null,
      session_id: session_id || null,
      ip_hash,
    });

    if (subError) {
      console.error("Submission insert error:", subError);
      return new Response(
        JSON.stringify({ error: "Failed to save submission" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Attach attribution if session_id exists
    if (session_id && contactId) {
      const { data: attrSession } = await supabase
        .from("attribution_sessions")
        .select("id")
        .eq("session_id", session_id)
        .eq("company_id", form.company_id)
        .maybeSingle();

      if (attrSession) {
        await supabase.rpc("attach_attribution_to_contact", {
          p_session_id: attrSession.id,
          p_contact_id: contactId,
          p_company_id: form.company_id,
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, contact_id: contactId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Form submit error:", e);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
