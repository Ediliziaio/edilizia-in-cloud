import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { aziendeConPixelAttivo, eventoTroppoVecchio, MAX_TENTATIVI_CAPI } from "../_shared/capiCodaLogica.ts";

type EntityType = "contact" | "appointment" | "opportunity";
type EventKind = "lead_created" | "appointment_scheduled" | "opportunity_won";
type MetaEventName = "Lead" | "Schedule" | "Purchase";

interface QueueEvent {
  id: string;
  company_id: string;
  entity_type: EntityType;
  entity_id: string;
  event_kind: EventKind;
  event_name: MetaEventName;
  event_id: string;
  attempt_count?: number | null;
  created_at: string;
}

interface ContactRow {
  id: string;
  company_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  source_campaign_id?: string | null;
  attr_source?: string | null;
  attr_medium?: string | null;
  attr_campaign?: string | null;
  attr_content?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_ad_id?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  created_at?: string | null;
}

interface OpportunityRow {
  id: string;
  company_id: string;
  contact_id?: string | null;
  name?: string | null;
  status?: string | null;
  value?: number | string | null;
  source?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_ad_id?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface AppointmentRow {
  id: string;
  company_id: string;
  contact_id?: string | null;
  opportunity_id?: string | null;
  title?: string | null;
  status?: string | null;
  appointment_date?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_ad_id?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

function verifyCronOrServiceRole(req: Request, serviceRoleKey: string): void {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  if (cronSecret && reqSecret === cronSecret) return;

  const authHeader = req.headers.get("Authorization");
  if (authHeader === `Bearer ${serviceRoleKey}`) return;

  throw new Error("Unauthorized");
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    verifyCronOrServiceRole(req, serviceRoleKey);
  } catch {
    return errorResponse("Unauthorized", 401, cors);
  }

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase env");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey) as any;
    const body = req.method === "POST" ? await readJson(req) : {};
    const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 100);

    let explicitEventId: string | null = null;
    if (body.company_id && body.entity_type && body.entity_id) {
      const eventKind = (body.event_kind as EventKind | undefined) ?? defaultEventKind(body.entity_type);
      const { data, error } = await adminClient.rpc("enqueue_meta_crm_conversion_event", {
        p_company_id: body.company_id,
        p_entity_type: body.entity_type,
        p_entity_id: body.entity_id,
        p_event_kind: eventKind,
      });
      if (error) throw error;
      explicitEventId = String(data ?? "");
    }

    // Solo le aziende con un pixel attivo e il token CAPI: senza, ogni evento
    // falliva e tornava in coda per sempre.
    const { data: pixelAttivi, error: pixelErr } = await adminClient
      .from("meta_conversion_pixel")
      .select("company_id")
      .eq("is_active", true)
      .not("capi_token_encrypted", "is", null);
    if (pixelErr) throw pixelErr;
    const aziendeConPixel = aziendeConPixelAttivo(pixelAttivi);
    if (!explicitEventId && aziendeConPixel.length === 0) {
      return jsonResponse(
        { processed: 0, sent: 0, skipped: 0, failed: 0, results: [], nota: "nessun pixel con token CAPI configurato" },
        200,
        cors,
      );
    }

    let query = adminClient
      .from("meta_crm_conversion_events")
      .select("id, company_id, entity_type, entity_id, event_kind, event_name, event_id, attempt_count, created_at")
      .in("status", ["pending", "failed"])
      // Dopo MAX_TENTATIVI_CAPI fallimenti l'evento non si riprende più.
      .or(`attempt_count.is.null,attempt_count.lt.${MAX_TENTATIVI_CAPI}`)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (explicitEventId) query = query.eq("id", explicitEventId);
    else query = query.in("company_id", aziendeConPixel);

    const { data: events, error } = await query;
    if (error) throw error;

    const results = [];
    for (const event of (events ?? []) as QueueEvent[]) {
      results.push(await processQueueEvent(adminClient, supabaseUrl, serviceRoleKey, event));
    }

    return jsonResponse(
      {
        processed: results.length,
        sent: results.filter((r) => r.status === "sent").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
        results,
      },
      200,
      cors,
    );
  } catch (error) {
    console.error("meta-crm-conversion-sync error:", error);
    return errorResponse(String((error as Error).message ?? error), 500, cors);
  }
});

async function processQueueEvent(
  adminClient: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  event: QueueEvent,
) {
  await adminClient
    .from("meta_crm_conversion_events")
    .update({
      status: "processing",
      attempt_count: Number(event.attempt_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", event.id);

  try {
    const context = await loadConversionContext(adminClient, event);
    if (!context.contact || !isMetaAttributed(context.contact, context.entity)) {
      await markQueueEvent(adminClient, event.id, "skipped", {
        payload: { reason: "not_meta_attributed" },
      });
      return { id: event.id, status: "skipped", reason: "not_meta_attributed" };
    }

    // Meta rifiuta gli eventi più vecchi di 7 giorni: inutile mandarli e
    // contarli come falliti, si scartano con il motivo.
    const eventTime = eventTimeFromContext(event, context);
    if (eventoTroppoVecchio(eventTime)) {
      await markQueueEvent(adminClient, event.id, "skipped", {
        payload: { reason: "troppo_vecchio", event_time: eventTime },
      });
      return { id: event.id, status: "skipped", reason: "troppo_vecchio" };
    }

    const payload = buildCapiPayload(event, context);
    const capiResponse = await fetch(`${supabaseUrl}/functions/v1/meta-capi-send-event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const responsePayload = await readResponsePayload(capiResponse);

    if (!capiResponse.ok) {
      throw new Error(`meta-capi-send-event ${capiResponse.status}: ${JSON.stringify(responsePayload).slice(0, 500)}`);
    }

    await markQueueEvent(adminClient, event.id, "sent", {
      payload,
      response_payload: responsePayload,
      sent_at: new Date().toISOString(),
    });
    await markEntitySent(adminClient, event, context);
    return { id: event.id, status: "sent", event_name: event.event_name };
  } catch (error) {
    const message = String((error as Error).message ?? error);
    await markQueueEvent(adminClient, event.id, "failed", { last_error: message });
    return { id: event.id, status: "failed", error: message };
  }
}

async function loadConversionContext(adminClient: any, event: QueueEvent) {
  if (event.entity_type === "contact") {
    const contact = await getContact(adminClient, event.company_id, event.entity_id);
    return { contact, entity: contact, opportunity: null as OpportunityRow | null };
  }

  if (event.entity_type === "opportunity") {
    const opportunity = await getOpportunity(adminClient, event.company_id, event.entity_id);
    const contact = opportunity?.contact_id
      ? await getContact(adminClient, event.company_id, opportunity.contact_id)
      : null;
    return { contact, entity: opportunity, opportunity };
  }

  const appointment = await getAppointment(adminClient, event.company_id, event.entity_id);
  const contact = appointment?.contact_id
    ? await getContact(adminClient, event.company_id, appointment.contact_id)
    : null;
  const opportunity = appointment?.opportunity_id
    ? await getOpportunity(adminClient, event.company_id, appointment.opportunity_id)
    : null;
  return { contact, entity: appointment, opportunity };
}

async function getContact(adminClient: any, companyId: string, contactId: string) {
  const { data, error } = await adminClient
    .from("marketing_contacts")
    .select(
      "id, company_id, first_name, last_name, email, phone, source, source_campaign_id, attr_source, attr_medium, attr_campaign, attr_content, meta_campaign_id, meta_adset_id, meta_ad_id, fbc, fbp, created_at",
    )
    .eq("company_id", companyId)
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw error;
  return data as ContactRow | null;
}

async function getOpportunity(adminClient: any, companyId: string, opportunityId: string) {
  const { data, error } = await adminClient
    .from("marketing_opportunities")
    .select(
      "id, company_id, contact_id, name, status, value, source, meta_campaign_id, meta_adset_id, meta_ad_id, fbc, fbp, created_at, updated_at",
    )
    .eq("company_id", companyId)
    .eq("id", opportunityId)
    .maybeSingle();
  if (error) throw error;
  return data as OpportunityRow | null;
}

async function getAppointment(adminClient: any, companyId: string, appointmentId: string) {
  const { data, error } = await adminClient
    .from("appointments")
    .select(
      "id, company_id, contact_id, opportunity_id, title, status, appointment_date, meta_campaign_id, meta_adset_id, meta_ad_id, fbc, fbp, created_at, updated_at",
    )
    .eq("company_id", companyId)
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) throw error;
  return data as AppointmentRow | null;
}

function buildCapiPayload(
  event: QueueEvent,
  context: {
    contact: ContactRow | null;
    entity: ContactRow | OpportunityRow | AppointmentRow | null;
    opportunity: OpportunityRow | null;
  },
) {
  const contact = context.contact!;
  const entity = (context.entity ?? {}) as Partial<ContactRow & OpportunityRow & AppointmentRow>;
  const campaignId = firstString(entity.meta_campaign_id, contact.meta_campaign_id, contact.source_campaign_id);
  const adSetId = firstString(entity.meta_adset_id, contact.meta_adset_id);
  const adId = firstString(entity.meta_ad_id, contact.meta_ad_id);
  const fbc = firstString(entity.fbc, contact.fbc);
  const fbp = firstString(entity.fbp, contact.fbp);
  const valueSource = context.opportunity ?? (entity as OpportunityRow);
  const valueCents = event.event_name === "Purchase" ? Math.round(Number(valueSource.value ?? 0) * 100) : 0;

  const userData = compactStringRecord({
    email: contact.email,
    phone: contact.phone,
    first_name: contact.first_name,
    last_name: contact.last_name,
    external_id: contact.id,
    fbc,
    fbp,
  });
  const customData: Record<string, string | number | string[]> = {
    source: "crm",
    crm_event_kind: event.event_kind,
    currency: "EUR",
  };

  if (valueCents > 0) customData.value = Math.round(valueCents) / 100;
  if (campaignId) customData.campaign_id = campaignId;
  if (adSetId) customData.adset_id = adSetId;
  if (adId) customData.ad_id = adId;
  const contentIds = [campaignId, adSetId, adId].filter((value): value is string => Boolean(value));
  if (contentIds.length > 0) customData.content_ids = contentIds;
  if (contact.attr_campaign) customData.content_name = contact.attr_campaign;

  return {
    company_id: event.company_id,
    event_name: event.event_name,
    event_id: event.event_id,
    event_time: eventTimeFromContext(event, context),
    action_source: "system_generated",
    user_data: userData,
    custom_data: customData,
  };
}

function eventTimeFromContext(
  event: QueueEvent,
  context: { entity: ContactRow | OpportunityRow | AppointmentRow | null },
) {
  const entity = (context.entity ?? {}) as Partial<ContactRow & OpportunityRow & AppointmentRow>;
  const iso =
    event.event_kind === "opportunity_won"
      ? (entity as OpportunityRow).updated_at ?? event.created_at
      : entity.created_at ?? event.created_at;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? Math.floor(time / 1000) : Math.floor(Date.now() / 1000);
}

async function markQueueEvent(
  adminClient: any,
  id: string,
  status: "sent" | "skipped" | "failed",
  patch: Record<string, unknown>,
) {
  await adminClient
    .from("meta_crm_conversion_events")
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...patch,
    })
    .eq("id", id);
}

async function markEntitySent(
  adminClient: any,
  event: QueueEvent,
  context: { contact: ContactRow | null; entity: ContactRow | OpportunityRow | AppointmentRow | null },
) {
  const now = new Date().toISOString();
  if (event.entity_type === "contact" && context.contact) {
    await adminClient.from("marketing_contacts").update({ last_capi_event_at: now }).eq("id", event.entity_id);
    return;
  }
  if (event.entity_type === "appointment") {
    await adminClient
      .from("appointments")
      .update({ last_capi_event_at: now, capi_schedule_sent_at: now })
      .eq("id", event.entity_id);
    return;
  }
  await adminClient
    .from("marketing_opportunities")
    .update({ last_capi_event_at: now, capi_purchase_sent_at: now })
    .eq("id", event.entity_id);
}

function isMetaAttributed(contact: ContactRow | null, entity: ContactRow | OpportunityRow | AppointmentRow | null) {
  const values = [
    contact?.source,
    contact?.source_campaign_id,
    contact?.attr_source,
    contact?.attr_medium,
    contact?.meta_campaign_id,
    contact?.meta_adset_id,
    contact?.meta_ad_id,
    entity?.meta_campaign_id,
    entity?.meta_adset_id,
    entity?.meta_ad_id,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return (
    values.includes("meta") ||
    values.includes("facebook") ||
    values.includes("instagram") ||
    values.includes("paid_social") ||
    Boolean(contact?.source_campaign_id || contact?.meta_campaign_id || entity?.meta_campaign_id)
  );
}

function defaultEventKind(entityType: EntityType): EventKind {
  if (entityType === "appointment") return "appointment_scheduled";
  if (entityType === "opportunity") return "opportunity_won";
  return "lead_created";
}

function firstString(...values: Array<string | null | undefined>) {
  return values.find((value) => String(value ?? "").trim().length > 0) ?? null;
}

function compactStringRecord(values: Record<string, string | null | undefined>) {
  return Object.entries(values).reduce<Record<string, string>>((acc, [key, value]) => {
    const clean = String(value ?? "").trim();
    if (clean) acc[key] = clean;
    return acc;
  }, {});
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
