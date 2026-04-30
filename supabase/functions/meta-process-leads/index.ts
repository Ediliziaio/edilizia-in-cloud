import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getErrorMessage } from "../_shared/metaAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_RETRIES = 10;
const BATCH_SIZE = 20;

serve(async (req) => {
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
      return new Response(JSON.stringify({ processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        await processLeadEvent(adminClient, event);
        
        await adminClient
          .from("integration_webhook_events")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
            locked_by: null,
            locked_at: null,
          })
          .eq("id", event.id);

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
            last_fail_reason: getErrorMessage(error).slice(0, 500),
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

    return new Response(JSON.stringify({ processed, failed, total: events.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("meta-process-leads error:", error);
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processLeadEvent(adminClient: any, event: any) {
  const { company_id, integration_id, payload } = event;
  const leadgenId = payload.leadgen_id || payload.id || payload.raw?.id;
  const formId = payload.form_id;

  if (!leadgenId || !integration_id) {
    throw new Error("Missing leadgen_id or integration_id");
  }

  const { data: creds } = await adminClient
    .from("integration_credentials")
    .select("access_token_encrypted, meta_page_tokens")
    .eq("integration_id", integration_id)
    .single();

  if (!creds) throw new Error("No credentials found for integration");

  const encKey = getEncryptionKey();
  const accessToken = await decrypt(creds.access_token_encrypted, encKey);
  const embeddedLead = payload.raw?.field_data ? payload.raw : payload.field_data ? payload : null;
  const lead =
    embeddedLead ||
    await fetchLeadFromMeta(
      adminClient,
      {
        companyId: company_id,
        integrationId: integration_id,
        payload,
        formId,
        leadgenId,
      },
      creds,
      encKey,
      accessToken,
    );

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
    const value = Array.isArray(field.values) ? field.values[0] : field.values;
    fieldData[field.name] = value == null ? "" : String(value);
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
  const companyName = mappedData.company_name || defaultValues.company_name || null;
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

  const pipelineSettings = rules.pipeline_settings || {};
  const source = pipelineSettings.source || "Meta Lead Ads";
  const tags = rules.tags_to_apply || [];
  const notes = buildNotesFromFieldData(fieldData, lead);

  let contactId: string;

  if (existingContact && updatePolicy !== "create_only") {
    const updateData: Record<string, any> = {};
    if (updatePolicy === "overwrite_non_empty" || updatePolicy === "upsert") {
      if (firstName) updateData.first_name = firstName;
      if (lastName) updateData.last_name = lastName;
      if (phone) updateData.phone = phone;
      if (companyName) updateData.company_name = companyName;
      if (city) updateData.city = city;
      if (address) updateData.address = address;
      if (postalCode) updateData.postal_code = postalCode;
      if (province) updateData.province = province;
    }
    updateData.updated_at = new Date().toISOString();

    const { error: updateErr } = await adminClient
      .from("marketing_contacts")
      .update(updateData)
      .eq("id", existingContact.id);
    if (updateErr) throw new Error(`Failed to update contact: ${updateErr.message}`);

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
        company_name: companyName,
        city: city,
        address: address,
        postal_code: postalCode,
        province: province,
        source,
        notes,
        tags,
        assigned_to: pipelineSettings.owner_user_id || null,
      })
      .select("id")
      .single();

    if (contactErr) throw new Error(`Failed to create contact: ${contactErr.message}`);
    contactId = newContact.id;
  } else {
    contactId = existingContact.id;
  }

  await upsertCustomFieldValues(adminClient, contactId, mappedData);

  if (pipelineSettings.pipeline_id && pipelineSettings.stage_id) {
    const { data: existingOpp } = await adminClient
      .from("marketing_opportunities")
      .select("id")
      .eq("company_id", company_id)
      .eq("contact_id", contactId)
      .eq("source", `meta_lead_${leadgenId}`)
      .limit(1);

    if (!existingOpp || existingOpp.length === 0) {
      const opportunityName = `Lead Ads - ${firstName || companyName || email || "Nuovo lead"} ${lastName}`.trim();
      const { error: opportunityErr } = await adminClient.from("marketing_opportunities").insert({
        company_id,
        contact_id: contactId,
        pipeline_id: pipelineSettings.pipeline_id,
        stage_id: pipelineSettings.stage_id,
        name: opportunityName,
        value: 0,
        status: "open",
        source: `meta_lead_${leadgenId}`,
        assigned_to: pipelineSettings.owner_user_id || null,
      });
      if (opportunityErr) throw new Error(`Failed to create opportunity: ${opportunityErr.message}`);
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
}

async function fetchLeadFromMeta(
  adminClient: any,
  context: {
    companyId: string;
    integrationId: string;
    payload: any;
    formId?: string;
    leadgenId: string;
  },
  creds: any,
  encKey: string,
  fallbackAccessToken: string,
) {
  const pageToken = await getPageAccessTokenForLead(
    adminClient,
    context,
    creds,
    encKey,
    fallbackAccessToken,
  );
  const params = new URLSearchParams({
    fields: "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id",
    access_token: pageToken,
  });

  const leadRes = await fetch(
    `https://graph.facebook.com/v21.0/${context.leadgenId}?${params.toString()}`,
  );
  const lead = await leadRes.json().catch(() => null);

  if (!leadRes.ok || lead?.error) {
    throw new Error(`Meta API error: ${lead?.error?.message || leadRes.statusText}`);
  }

  return lead;
}

async function getPageAccessTokenForLead(
  adminClient: any,
  context: {
    companyId: string;
    integrationId: string;
    payload: any;
    formId?: string;
  },
  creds: any,
  encKey: string,
  fallbackAccessToken: string,
): Promise<string> {
  const pageTokens = (creds.meta_page_tokens || {}) as Record<string, string>;
  const directPageId = context.payload.page_id || context.payload.raw?.page_id;
  if (directPageId && pageTokens[String(directPageId)]) {
    return decrypt(pageTokens[String(directPageId)], encKey);
  }

  let pageAssetId = context.payload.page_asset_id || null;
  if (!pageAssetId && context.formId) {
    const { data: formRecord } = await adminClient
      .from("meta_lead_forms")
      .select("page_asset_id")
      .eq("company_id", context.companyId)
      .eq("integration_id", context.integrationId)
      .eq("form_id", context.formId)
      .maybeSingle();
    pageAssetId = formRecord?.page_asset_id || null;
  }

  if (pageAssetId) {
    const { data: pageAsset } = await adminClient
      .from("meta_assets")
      .select("asset_id")
      .eq("id", pageAssetId)
      .eq("company_id", context.companyId)
      .eq("integration_id", context.integrationId)
      .maybeSingle();

    if (pageAsset?.asset_id && pageTokens[pageAsset.asset_id]) {
      return decrypt(pageTokens[pageAsset.asset_id], encKey);
    }
  }

  return fallbackAccessToken;
}

async function upsertCustomFieldValues(
  adminClient: any,
  contactId: string,
  mappedData: Record<string, string>,
) {
  const fieldValues = Object.entries(mappedData)
    .filter(([crmKey, value]) => crmKey.startsWith("custom_") && value !== undefined && value !== "")
    .map(([crmKey, value]) => ({
      contact_id: contactId,
      field_id: crmKey.replace("custom_", ""),
      value: String(value),
    }));

  if (fieldValues.length === 0) return;

  const { error } = await adminClient
    .from("marketing_contact_field_values")
    .upsert(fieldValues, { onConflict: "contact_id,field_id" });
  if (error) throw new Error(`Failed to save custom field values: ${error.message}`);
}

function normalizePhone(phone: string): string {
  if (!phone) return "";
  let normalized = phone.replace(/[^\d+]/g, "");
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
