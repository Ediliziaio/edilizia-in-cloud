import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";

const MAX_RETRIES = 10;
const BATCH_SIZE = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const workerId = crypto.randomUUID().slice(0, 8);
    const lockTimeout = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Unlock stale locks
    await adminClient
      .from("integration_webhook_events")
      .update({ locked_by: null, locked_at: null })
      .eq("status", "pending")
      .lt("locked_at", lockTimeout)
      .not("locked_by", "is", null);

    // Lock a batch of pending events
    const { data: events } = await adminClient
      .from("integration_webhook_events")
      .select("*")
      .eq("status", "pending")
      .lt("fail_count", MAX_RETRIES)
      .is("locked_by", null)
      .order("received_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (!events || events.length === 0) {
      return jsonResponse({ processed: 0 });
    }

    // Lock events
    const eventIds = events.map((e) => e.id);
    await adminClient
      .from("integration_webhook_events")
      .update({ locked_by: workerId, locked_at: new Date().toISOString() })
      .in("id", eventIds);

    let processed = 0;
    let failed = 0;
    const successfulIntegrationIds = new Set<string>();

    for (const event of events) {
      try {
        const result = await processLeadEvent(adminClient, event);
        
        await adminClient
          .from("integration_webhook_events")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
            locked_by: null,
            locked_at: null,
          })
          .eq("id", event.id);

        // Fire automation trigger (non-blocking)
        if (result?.contactId) {
          const triggerEvent = result.isNew ? "facebook_lead_received" : "facebook_lead_updated";
          adminClient
            .from("automation_trigger_events")
            .insert({
              company_id: event.company_id,
              trigger_event: triggerEvent,
              entity_id: result.contactId,
              entity_type: "contact",
              payload: {
                form_id: event.payload?.form_id || null,
                page_id: event.payload?.page_id || null,
                leadgen_id: event.payload?.leadgen_id || null,
                campaign_name: result.campaignName || null,
                is_new_contact: result.isNew,
              },
            })
            .then(() => console.log(`Automation trigger fired: ${triggerEvent} for contact ${result.contactId}`))
            .catch((err: any) => console.warn("Failed to fire automation trigger:", err));
        }

        processed++;
        if (event.integration_id) {
          successfulIntegrationIds.add(event.integration_id);
        }
      } catch (error) {
        console.error(`Failed to process event ${event.id}:`, error);

        const newFailCount = (event.fail_count || 0) + 1;
        const newStatus = newFailCount >= MAX_RETRIES ? "failed" : "pending";

        await adminClient
          .from("integration_webhook_events")
          .update({
            fail_count: newFailCount,
            last_fail_reason: error.message?.slice(0, 500),
            status: newStatus,
            locked_by: null,
            locked_at: null,
          })
          .eq("id", event.id);

        failed++;
      }
    }

    // Update last_sync_at ONLY for integrations with successful processing
    for (const integId of successfulIntegrationIds) {
      await adminClient
        .from("integrations")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", integId);
    }

    return jsonResponse({ processed, failed, total: events.length });
  } catch (error) {
    console.error("meta-process-leads error:", error);
    return errorResponse(error.message, 500);
  }
});

async function processLeadEvent(adminClient: any, event: any): Promise<{ contactId: string; isNew: boolean; campaignName?: string } | null> {
  const { company_id, integration_id, payload } = event;
  const leadgenId = payload.leadgen_id;
  const formId = payload.form_id;

  if (!leadgenId || !integration_id) {
    throw new Error("Missing leadgen_id or integration_id");
  }

  const { data: creds } = await adminClient
    .from("integration_credentials")
    .select("access_token_encrypted")
    .eq("integration_id", integration_id)
    .single();

  if (!creds) throw new Error("No credentials found for integration");

  const accessToken = atob(creds.access_token_encrypted);

  const leadRes = await fetch(
    `https://graph.facebook.com/v21.0/${leadgenId}?fields=id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id&access_token=${accessToken}`
  );
  const lead = await leadRes.json();

  if (lead.error) {
    throw new Error(`Meta API error: ${lead.error.message}`);
  }

  const actualFormId = lead.form_id || formId;
  const { data: mapping } = await adminClient
    .from("integration_field_mappings")
    .select("*")
    .eq("company_id", company_id)
    .eq("integration_id", integration_id)
    .eq("form_id", actualFormId)
    .single();

  const fieldData: Record<string, string> = {};
  for (const field of lead.field_data || []) {
    fieldData[field.name] = Array.isArray(field.values) ? field.values[0] : field.values;
  }

  const rules = mapping?.rules || {};
  const fieldMap: Record<string, string> = rules.field_map || {};
  const defaultValues: Record<string, string> = rules.default_values || {};

  const mappedData: Record<string, string> = {};
  for (const [metaKey, crmKey] of Object.entries(fieldMap)) {
    if (fieldData[metaKey] !== undefined) {
      mappedData[crmKey] = fieldData[metaKey];
    }
  }

  if (Object.keys(fieldMap).length === 0) {
    if (fieldData.full_name) mappedData.full_name = fieldData.full_name;
    if (fieldData.email) mappedData.email = fieldData.email;
    if (fieldData.phone_number) mappedData.phone = fieldData.phone_number;
    if (fieldData.city) mappedData.city = fieldData.city;
    if (fieldData.first_name) mappedData.first_name = fieldData.first_name;
    if (fieldData.last_name) mappedData.last_name = fieldData.last_name;
  }

  let firstName = mappedData.first_name || defaultValues.first_name || "";
  let lastName = mappedData.last_name || defaultValues.last_name || "";

  if (!firstName && !lastName && mappedData.full_name) {
    const parts = mappedData.full_name.trim().split(/\s+/);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ") || "";
  }

  const email = (mappedData.email || defaultValues.email || "").toLowerCase().trim();
  const phone = normalizePhone(mappedData.phone || defaultValues.phone || "");
  const city = mappedData.city || defaultValues.city || null;
  const address = mappedData.address || defaultValues.address || null;
  const postalCode = mappedData.postal_code || defaultValues.postal_code || null;
  const province = mappedData.province || defaultValues.province || null;

  const dedupePolicy = rules.dedupe_policy || "email";
  const updatePolicy = rules.update_policy || "upsert";

  let existingContact = null;
  if (dedupePolicy === "email" && email) {
    const { data } = await adminClient
      .from("marketing_contacts")
      .select("id")
      .eq("company_id", company_id)
      .eq("email", email)
      .limit(1);
    existingContact = data?.[0] || null;
  } else if (dedupePolicy === "phone" && phone) {
    const { data } = await adminClient
      .from("marketing_contacts")
      .select("id")
      .eq("company_id", company_id)
      .eq("phone", phone)
      .limit(1);
    existingContact = data?.[0] || null;
  } else if (dedupePolicy === "email_or_phone") {
    if (email) {
      const { data } = await adminClient
        .from("marketing_contacts")
        .select("id")
        .eq("company_id", company_id)
        .eq("email", email)
        .limit(1);
      existingContact = data?.[0] || null;
    }
    if (!existingContact && phone) {
      const { data } = await adminClient
        .from("marketing_contacts")
        .select("id")
        .eq("company_id", company_id)
        .eq("phone", phone)
        .limit(1);
      existingContact = data?.[0] || null;
    }
  }

  const source = `Meta Lead Ads`;
  const tags = rules.tags_to_apply || [];
  const pipelineSettings = rules.pipeline_settings || {};
  const notes = buildNotesFromFieldData(fieldData, lead);

  let contactId: string;

  if (existingContact && updatePolicy !== "create_only") {
    const updateData: Record<string, any> = {};
    if (updatePolicy === "overwrite_non_empty" || updatePolicy === "upsert") {
      if (firstName) updateData.first_name = firstName;
      if (lastName) updateData.last_name = lastName;
      if (phone) updateData.phone = phone;
      if (city) updateData.city = city;
      if (address) updateData.address = address;
      if (postalCode) updateData.postal_code = postalCode;
    }
    updateData.updated_at = new Date().toISOString();

    await adminClient
      .from("marketing_contacts")
      .update(updateData)
      .eq("id", existingContact.id);

    contactId = existingContact.id;
  } else if (!existingContact) {
    const { data: newContact, error: contactErr } = await adminClient
      .from("marketing_contacts")
      .insert({
        company_id,
        first_name: firstName || "Lead",
        last_name: lastName || "",
        email: email || null,
        phone: phone || null,
        city: city,
        address: address,
        postal_code: postalCode,
        province: province,
        source,
        notes,
        tags,
        status: "new",
        assigned_to: pipelineSettings.owner_user_id || null,
        source_campaign_id: lead.campaign_name || lead.campaign_id || null,
      })
      .select("id")
      .single();

    if (contactErr) throw new Error(`Failed to create contact: ${contactErr.message}`);
    contactId = newContact.id;
  } else {
    contactId = existingContact.id;
  }

  if (pipelineSettings.pipeline_id && pipelineSettings.stage_id) {
    const { data: existingOpp } = await adminClient
      .from("marketing_opportunities")
      .select("id")
      .eq("company_id", company_id)
      .eq("contact_id", contactId)
      .eq("source", `meta_lead_${leadgenId}`)
      .limit(1);

    if (!existingOpp || existingOpp.length === 0) {
      await adminClient.from("marketing_opportunities").insert({
        company_id,
        contact_id: contactId,
        pipeline_id: pipelineSettings.pipeline_id,
        stage_id: pipelineSettings.stage_id,
        name: `Lead Ads - ${firstName} ${lastName}`.trim(),
        value: 0,
        status: "open",
        source: `meta_lead_${leadgenId}`,
        assigned_to: pipelineSettings.owner_user_id || null,
      });
    }
  }

  await adminClient.from("integration_audit_log").insert({
    company_id,
    actor_user_id: null,
    action: "lead_imported",
    entity_type: "marketing_contact",
    entity_id: contactId,
    metadata: {
      leadgen_id: leadgenId,
      form_id: actualFormId,
      campaign_name: lead.campaign_name || null,
      ad_name: lead.ad_name || null,
      dedupe: existingContact ? "updated" : "created",
    },
  });

  return {
    contactId,
    isNew: !existingContact,
    campaignName: lead.campaign_name || undefined,
  };
}

function normalizePhone(phone: string): string {
  if (!phone) return "";
  let normalized = phone.replace(/[^\\d+]/g, "");
  if (normalized.startsWith("00")) {
    normalized = "+" + normalized.slice(2);
  }
  if (normalized.match(/^3\d{8,9}$/)) {
    normalized = "+39" + normalized;
  }
  return normalized;
}

function buildNotesFromFieldData(fieldData: Record<string, string>, lead: any): string {
  const lines: string[] = [];
  lines.push(`--- Lead Ads Import ---`);
  if (lead.campaign_name) lines.push(`Campagna: ${lead.campaign_name}`);
  if (lead.ad_name) lines.push(`Annuncio: ${lead.ad_name}`);
  if (lead.adset_name) lines.push(`Adset: ${lead.adset_name}`);
  lines.push(`Data: ${lead.created_time || new Date().toISOString()}`);
  lines.push("");
  for (const [key, value] of Object.entries(fieldData)) {
    lines.push(`${key}: ${value}`);
  }
  return lines.join("\n");
}
