import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

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

function cleanText(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const text = cleanText(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);
  }

  return normalized;
}

function mergeStringLists(current: unknown, next: string[]): string[] {
  return cleanStringList([...(Array.isArray(current) ? current : []), ...next]);
}

function isEmptySubmissionValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function safeRedirectUrl(value: unknown): string | null {
  const url = cleanText(value);
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

const ATTR_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "gclid", "wbraid", "gbraid", "fbclid", "ttclid", "msclkid", "li_fat_id",
] as const;

function isMissingSchemaError(error: unknown): boolean {
  const message = String((error as any)?.message ?? (error as any)?.details ?? error ?? "").toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("column")
  );
}

function buildGoogleAdsContactAttributionUpdate(input: {
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  gclid?: unknown;
  wbraid?: unknown;
  gbraid?: unknown;
}): Record<string, unknown> | null {
  const source = cleanText(input.utm_source);
  const medium = cleanText(input.utm_medium);
  const campaign = cleanText(input.utm_campaign);
  const gclid = cleanText(input.gclid);
  const wbraid = cleanText(input.wbraid);
  const gbraid = cleanText(input.gbraid);
  const normalizedSource = source?.toLowerCase() ?? "";
  const normalizedMedium = medium?.toLowerCase() ?? "";
  const paidMedium = ["cpc", "ppc", "paid_search"].includes(normalizedMedium);
  const isPaidGoogle =
    Boolean(gclid || wbraid || gbraid) ||
    ["google_ads", "adwords"].includes(normalizedSource) ||
    (normalizedSource === "google" && paidMedium);

  if (!isPaidGoogle) return null;

  return {
    source: "Google Ads",
    source_campaign_id: campaign,
    attr_source: source,
    attr_medium: medium,
    attr_campaign: campaign,
    ...(gclid ? { gclid } : {}),
    ...(wbraid ? { wbraid } : {}),
    ...(gbraid ? { gbraid } : {}),
    google_campaign_id: campaign,
  };
}

async function updateGoogleAdsContactAttribution(
  supabase: any,
  contactId: string | null,
  update: Record<string, unknown> | null,
) {
  if (!contactId || !update) return;

  const { error } = await supabase
    .from("marketing_contacts")
    .update(update)
    .eq("id", contactId);

  if (!error) return;
  if (!isMissingSchemaError(error)) {
    console.warn("Google Ads contact attribution update failed:", error);
    return;
  }

  const { gclid: _gclid, wbraid: _wbraid, gbraid: _gbraid, google_campaign_id: _googleCampaignId, ...baseUpdate } = update;
  const fallback = await supabase
    .from("marketing_contacts")
    .update(baseUpdate)
    .eq("id", contactId);
  if (fallback.error) {
    console.warn("Google Ads contact attribution fallback failed:", fallback.error);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    // I siti che mandano i dati con un form proprio (senza il nostro iframe,
    // es. Renova) passano solo page_url: i parametri di campagna stanno
    // nell'indirizzo della pagina. Si usano quando il campo esplicito manca,
    // altrimenti quei lead restavano senza campagna né gclid.
    const dallaPagina: Record<string, string> = {};
    if (typeof body.page_url === "string" && body.page_url.length < 4000) {
      try {
        const qs = new URL(body.page_url).searchParams;
        for (const k of ATTR_PARAMS) {
          const v = qs.get(k);
          if (v) dallaPagina[k] = v.slice(0, 500);
        }
      } catch { /* indirizzo non valido: si ignora */ }
    }
    const attr = (k: string) => body[k] || dallaPagina[k] || undefined;
    const { form_id, data: formData, session_id, visitor_id } = body;
    const utm_source = attr("utm_source"), utm_medium = attr("utm_medium"), utm_campaign = attr("utm_campaign"),
      utm_content = attr("utm_content"), utm_term = attr("utm_term");
    const gclid = attr("gclid"), wbraid = attr("wbraid"), gbraid = attr("gbraid"), fbclid = attr("fbclid"),
      ttclid = attr("ttclid"), msclkid = attr("msclkid"), li_fat_id = attr("li_fat_id");

    if (!form_id || !formData) {
      return new Response(
        JSON.stringify({ error: "form_id and data required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get form definition
    const { data: form, error: formError } = await supabase
      .from("lead_forms")
      // name serve al payload dell'evento automazione (form_name)
      .select("id, name, company_id, fields, settings, theme, is_published, is_active")
      .eq("id", form_id)
      .single();

    if (formError || !form) {
      return new Response(
        JSON.stringify({ error: "Form not found" }),
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!form.is_published) {
      return new Response(
        JSON.stringify({ error: "Form not published" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (form.is_active === false) {
      return new Response(
        JSON.stringify({ error: "Form is inactive" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    const fields = (form.fields as any[]) || [];
    for (const field of fields) {
      const fieldKey = field.id || field.name;
      if (field.required && isEmptySubmissionValue(formData[fieldKey])) {
        return new Response(
          JSON.stringify({ error: `Campo obbligatorio: ${field.label || field.name}` }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
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
    const assignedUserId = cleanText(settings.assignedUserId);
    // Il call center che richiama il lead. Prima il form sapeva assegnare solo
    // il venditore: le opportunità arrivate dal sito nascevano senza chi le
    // chiama, mentre quelle da Facebook il call center ce l'avevano.
    const callCenterId = cleanText(settings.callCenterId);
    const defaultTags = cleanStringList(settings.defaultTags);

    // Build contact data from field mappings
    let mappedEmail: string | null = null;
    let mappedFirstName: string | null = null;
    let mappedLastName: string | null = null;
    let mappedPhone: string | null = null;
    // Altri campi anagrafici mappati sul contatto (città, azienda, indirizzo…).
    // Prima venivano ignorati: restavano solo nella submission, non sul contatto.
    const mappedExtra: Record<string, string> = {};

    for (const field of fields) {
      const fieldKey = field.id || field.name;
      const value = formData[fieldKey];
      if (!value) continue;

      const mapping = (field.mapping || field.name || "").toLowerCase();
      if (mapping === "email" || field.type === "email") mappedEmail = value;
      else if (mapping === "first_name" || mapping === "nome") mappedFirstName = value;
      else if (mapping === "last_name" || mapping === "cognome") mappedLastName = value;
      else if (mapping === "phone" || mapping === "telefono" || field.type === "phone") mappedPhone = value;
      else if (mapping === "company_name" || mapping === "azienda" || mapping === "ragione_sociale") mappedExtra.company_name = value;
      else if (mapping === "city" || mapping === "citta" || mapping === "città") mappedExtra.city = value;
      else if (mapping === "address" || mapping === "indirizzo") mappedExtra.address = value;
      else if (mapping === "postal_code" || mapping === "cap") mappedExtra.postal_code = value;
      else if (mapping === "province" || mapping === "provincia") mappedExtra.province = value;
      else if (mapping === "notes" || mapping === "note") mappedExtra.notes = value;
    }

    // Pulisce e tiene solo i valori non vuoti dei campi extra mappati.
    const extraContactFields: Record<string, string> = {};
    for (const [key, raw] of Object.entries(mappedExtra)) {
      const cleaned = cleanText(raw);
      if (cleaned) extraContactFields[key] = cleaned;
    }

    // Fallback: try common field names directly
    if (!mappedEmail) mappedEmail = formData.email || formData.Email || formData.EMAIL || null;
    if (!mappedFirstName) mappedFirstName = formData.first_name || formData.nome || formData.name || formData.Nome || null;
    if (!mappedLastName) mappedLastName = formData.last_name || formData.cognome || formData.surname || formData.Cognome || null;
    if (!mappedPhone) mappedPhone = formData.phone || formData.telefono || formData.Phone || formData.Telefono || null;

    // Upsert contact by email or phone. In edilizia molti form raccolgono
    // prima il telefono: non deve bloccare CRM/opportunita/attribution.
    let contactId: string | null = null;
    const googleAdsAttributionUpdate = buildGoogleAdsContactAttributionUpdate({
      utm_source,
      utm_medium,
      utm_campaign,
      gclid,
      wbraid,
      gbraid,
    });
    const email = cleanText(mappedEmail)?.toLowerCase() ?? null;
    const validEmail = email?.includes("@") ? email : null;
    const phone = cleanText(mappedPhone);
    if (validEmail || phone) {
      const firstName = cleanText(mappedFirstName) || validEmail?.split("@")[0] || phone || "Lead";

      let existing: { id: string; tags?: string[] | null } | null = null;
      if (validEmail) {
        const { data } = await supabase
          .from("marketing_contacts")
          .select("id, tags")
          .eq("company_id", form.company_id)
          .eq("email", validEmail)
          .maybeSingle();
        existing = data;
      }

      if (!existing && phone) {
        const { data } = await supabase
          .from("marketing_contacts")
          .select("id, tags")
          .eq("company_id", form.company_id)
          .eq("phone", phone)
          .maybeSingle();
        existing = data;
      }

      if (existing) {
        contactId = existing.id;
        const contactUpdate: Record<string, unknown> = {
          last_activity_at: new Date().toISOString(),
          ...(validEmail ? { email: validEmail } : {}),
          ...(phone ? { phone } : {}),
          // Città, azienda, indirizzo… (solo i valori compilati, non sovrascrive
          // con vuoti un contatto già esistente).
          ...extraContactFields,
        };
        if (assignedUserId) contactUpdate.assigned_to = assignedUserId;
        if (callCenterId) contactUpdate.call_center_id = callCenterId;
        if (defaultTags.length > 0) contactUpdate.tags = mergeStringLists(existing.tags, defaultTags);

        await supabase
          .from("marketing_contacts")
          .update(contactUpdate)
          .eq("id", contactId);
      } else {
        const insertPayload: Record<string, any> = {
          company_id: form.company_id,
          email: validEmail,
          first_name: firstName,
          last_name: mappedLastName,
          phone,
          source: "form",
          attr_source: utm_source || null,
          attr_medium: utm_medium || null,
          attr_campaign: utm_campaign || null,
          attr_content: utm_content || null,
          // Il clic da un annuncio Meta: prima restava solo sull'invio del
          // form. fbc è il formato che Meta usa per riconoscere il clic
          // (fb.1.<ms>.<fbclid>) quando il lead viene rimandato con la CAPI.
          ...(fbclid ? { fbclid, fbc: `fb.1.${Date.now()}.${fbclid}` } : {}),
          // Città, azienda, indirizzo… mappati dal form.
          ...extraContactFields,
        };

        if (assignedUserId) insertPayload.assigned_to = assignedUserId;
        if (callCenterId) insertPayload.call_center_id = callCenterId;
        if (defaultTags.length > 0) insertPayload.tags = defaultTags;

        const { data: newContact } = await supabase
          .from("marketing_contacts")
          .insert(insertPayload)
          .select("id")
          .single();
        if (newContact) contactId = newContact.id;
      }
    }

    await updateGoogleAdsContactAttribution(supabase, contactId, googleAdsAttributionUpdate);

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
      ttclid: ttclid || null,
      msclkid: msclkid || null,
      li_fat_id: li_fat_id || null,
      user_agent: userAgent || null,
      device_type: deviceType,
    }).select("id").single();

    if (subError) {
      console.error("Submission insert error:", subError);
      return new Response(
        JSON.stringify({ error: "Failed to save submission" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Evento automazione e notifica NON stanno qui.
    // Le emette il trigger DB fire_form_submission_automation su
    // form_submissions (stesso schema delle altre 16 fire_*_automation), e la
    // mail parte dai flussi "Notifica lead — <brand>", uno per form, filtrati
    // su form_id. Duplicarli qui manderebbe due email per ogni richiesta.

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
    const pipelineId = cleanText(settings.pipelineId);
    if (contactId && pipelineId) {
      try {
        // La fonte che si legge sulla scheda dell'opportunita'. Se il modulo
        // ne dichiara una (impostazioni -> fonteOpportunita) si usa quella, ed
        // e' un nome leggibile tipo «Google nuovo». Senza, resta il codice
        // tecnico di prima, che almeno distingue un modulo dall'altro.
        const formOpportunitySource =
          cleanText(settings.fonteOpportunita) ||
          cleanText(settings.opportunitySource) ||
          `form_${form_id}`;
        const configuredStageId = cleanText(settings.stageId) || cleanText(settings.stage_id) || cleanText(settings.pipelineStageId);
        let stageId: string | null = null;

        if (configuredStageId) {
          const { data: configuredStage } = await supabase
            .from("marketing_pipeline_stages")
            .select("id")
            .eq("company_id", form.company_id)
            .eq("pipeline_id", pipelineId)
            .eq("id", configuredStageId)
            .maybeSingle();
          stageId = configuredStage?.id ?? null;
        }

        if (!stageId) {
          const { data: firstStage } = await supabase
            .from("marketing_pipeline_stages")
            .select("id")
            .eq("company_id", form.company_id)
            .eq("pipeline_id", pipelineId)
            .order("position", { ascending: true })
            .limit(1)
            .maybeSingle();
          stageId = firstStage?.id ?? null;
        }

        if (stageId) {
          // Niente controllo «esiste già?» qui: se il contatto ha già
          // un'opportunità aperta nella stessa pipeline, il trigger
          // dedupe_fb_open_opportunity scarta questa riga e riporta quella
          // esistente nella prima fase, con una nota e la notifica a chi la
          // segue (migrazione 20280914000012). Prima qui si riscriveva il
          // campo note dell'opportunità vecchia — cancellando quelle scritte
          // dal call center — e la scheda restava dov'era.
          await supabase.from("marketing_opportunities").insert({
            company_id: form.company_id,
            contact_id: contactId,
            pipeline_id: pipelineId,
            stage_id: stageId,
            name: `Lead da form: ${mappedFirstName || mappedEmail || "Nuovo"}`,
            value: 0,
            status: "open",
            source: formOpportunitySource,
            assigned_to: assignedUserId || null,
            call_center_id: callCenterId || null,
            ...(defaultTags.length > 0 ? { tags: defaultTags } : {}),
          });
        }
      } catch (error) {
        console.warn("Marketing opportunity creation skipped:", error);
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

    const redirectUrl = safeRedirectUrl(settings.redirectUrl);
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
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Form submit error:", e);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
