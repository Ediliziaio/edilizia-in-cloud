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

function detectDeviceType(ua: string): string {
  if (!ua) return "unknown";
  if (/Mobile|Android.*Mobile|iPhone|iPod/i.test(ua)) return "mobile";
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return "tablet";
  return "desktop";
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
    const {
      form_id, data: formData, session_id, visitor_id,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      gclid, fbclid, ttclid, msclkid, li_fat_id
    } = body;

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
      .select("id, company_id, fields, settings, theme, is_published, is_active")
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

    if (form.is_active === false) {
      return new Response(
        JSON.stringify({ error: "Form is inactive" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    const fields = (form.fields as any[]) || [];
    for (const field of fields) {
      const fieldKey = field.id || field.name;
      if (field.required && !formData[fieldKey]) {
        return new Response(
          JSON.stringify({ error: `Campo obbligatorio: ${field.label || field.name}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const userAgent = req.headers.get("user-agent") || "";
    const deviceType = detectDeviceType(userAgent);
    const clientIP =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const ip_hash = await hashIP(clientIP);

    const settings = (form.settings as any) || {};
    const theme = (form.theme as any) || {};

    // Build contact data from field mappings
    let mappedEmail: string | null = null;
    let mappedFirstName: string | null = null;
    let mappedLastName: string | null = null;
    let mappedPhone: string | null = null;

    for (const field of fields) {
      const fieldKey = field.id || field.name;
      const value = formData[fieldKey];
      if (!value) continue;

      const mapping = (field.mapping || field.name || "").toLowerCase();
      if (mapping === "email" || field.type === "email") mappedEmail = value;
      else if (mapping === "first_name" || mapping === "nome") mappedFirstName = value;
      else if (mapping === "last_name" || mapping === "cognome") mappedLastName = value;
      else if (mapping === "phone" || mapping === "telefono" || field.type === "phone") mappedPhone = value;
    }

    // Fallback: try common field names directly
    if (!mappedEmail) mappedEmail = formData.email || formData.Email || formData.EMAIL || null;
    if (!mappedFirstName) mappedFirstName = formData.first_name || formData.nome || formData.name || formData.Nome || null;
    if (!mappedLastName) mappedLastName = formData.last_name || formData.cognome || formData.surname || formData.Cognome || null;
    if (!mappedPhone) mappedPhone = formData.phone || formData.telefono || formData.Phone || formData.Telefono || null;

    // Upsert contact by email if present
    let contactId: string | null = null;
    if (mappedEmail && typeof mappedEmail === "string" && mappedEmail.includes("@")) {
      const email = mappedEmail.toLowerCase().trim();
      const firstName = mappedFirstName || email.split("@")[0];

      const { data: existing } = await supabase
        .from("marketing_contacts")
        .select("id")
        .eq("company_id", form.company_id)
        .eq("email", email)
        .maybeSingle();

      if (existing) {
        contactId = existing.id;
        await supabase
          .from("marketing_contacts")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", contactId);
      } else {
        const insertPayload: Record<string, any> = {
          company_id: form.company_id,
          email,
          first_name: firstName,
          last_name: mappedLastName,
          phone: mappedPhone,
          source: "form",
          attr_source: utm_source || null,
          attr_medium: utm_medium || null,
          attr_campaign: utm_campaign || null,
          attr_content: utm_content || null,
        };

        if (settings.assignedUserId) insertPayload.assigned_to = settings.assignedUserId;
        if (settings.defaultTags && Array.isArray(settings.defaultTags)) insertPayload.tags = settings.defaultTags;

        const { data: newContact } = await supabase
          .from("marketing_contacts")
          .insert(insertPayload)
          .select("id")
          .single();
        if (newContact) contactId = newContact.id;
      }
    }

    // Save submission with click IDs and device info
    const { data: submission, error: subError } = await supabase.from("form_submissions").insert({
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
      gclid: gclid || null,
      fbclid: fbclid || null,
      user_agent: userAgent || null,
      device_type: deviceType,
    }).select("id").single();

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

    // Create opportunity if pipeline configured
    if (contactId && settings.pipelineId) {
      try {
        const { data: stages } = await supabase
          .from("pipeline_stages")
          .select("id")
          .eq("pipeline_id", settings.pipelineId)
          .order("position", { ascending: true })
          .limit(1);

        if (stages && stages.length > 0) {
          await supabase.from("opportunities").insert({
            company_id: form.company_id,
            contact_id: contactId,
            pipeline_id: settings.pipelineId,
            stage_id: stages[0].id,
            title: `Lead da form: ${mappedFirstName || mappedEmail || "Nuovo"}`,
            status: "open",
            created_by: form.company_id,
          });
        }
      } catch (_) {
        // Non-blocking
      }
    }

    // Trigger form automations via DB function
    if (submission?.id) {
      try {
        await supabase.rpc("trigger_form_automations", {
          p_submission_id: submission.id,
        });
      } catch (_) {
        // Non-blocking
      }
    }

    const redirectUrl = settings.redirectUrl || null;
    const successTitle = theme.success_title || settings.success_title || null;
    const successMessage = theme.success_message || settings.success_message || "Grazie! La tua richiesta è stata inviata.";

    return new Response(
      JSON.stringify({
        ok: true,
        contact_id: contactId,
        redirect_url: redirectUrl,
        success_title: successTitle,
        success_message: successMessage,
      }),
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
