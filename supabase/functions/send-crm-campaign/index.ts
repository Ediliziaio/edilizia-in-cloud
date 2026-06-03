/**
 * send-crm-campaign — IMP-3
 * Invia una campagna email ai contatti marketing filtrati.
 * Chiamata manualmente dal SuperAdmin CRM.
 * Supporta esecuzione parziale: aggiorna sent_count / error_count in real-time.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getSuppressedEmailMap, normalizeEmailAddress } from "../_shared/emailSuppression.ts";
import {
  applyContactCustomFields,
  loadContactCustomFieldResolverCrossCompany,
} from "../_shared/contactCustomFields.ts";

const getErrorMessage = (err: unknown) => err instanceof Error ? err.message : String(err);

interface ContactFilter {
  contact_type?: string;
  tags?: string[];
  source?: string;
  score_min?: number;
  score_max?: number;
}

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey        = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Auth: solo super_admin
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Non autorizzato" }), {
      status: 401, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: roleRow } = await userClient
    .from("user_roles")
    .select("role")
    .eq("role", "super_admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Accesso negato" }), {
      status: 403, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const body = await req.json() as { campaign_id: string };
  const { campaign_id } = body;
  if (!campaign_id) {
    return new Response(JSON.stringify({ error: "campaign_id obbligatorio" }), {
      status: 400, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  // Carica campagna
  const { data: campaign, error: campErr } = await (supabase
    .from("crm_campaigns" as never)
    .select("*")
    .eq("id" as never, campaign_id)
    .single() as unknown as Promise<{
      data: {
        id: string;
        name: string;
        subject: string;
        html_body: string;
        contact_filter: ContactFilter;
        status: string;
      } | null;
      error: { message: string } | null;
    }>);

  if (campErr || !campaign) {
    return new Response(JSON.stringify({ error: campErr?.message ?? "Campagna non trovata" }), {
      status: 404, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  if (!["draft", "scheduled"].includes(campaign.status)) {
    return new Response(JSON.stringify({ error: `Campagna in stato '${campaign.status}', non può essere inviata` }), {
      status: 409, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  // Marca come 'sending'
  await (supabase
    .from("crm_campaigns" as never)
    .update({ status: "sending" } as never)
    .eq("id" as never, campaign_id) as unknown as Promise<void>);

  // Costruisce query contatti
  const filter = campaign.contact_filter;
  let contactQuery = supabase
    .from("marketing_contacts")
    .select("id, first_name, last_name, email, company_id")
    .eq("unsubscribed", false)
    .not("email", "is", null);

  if (filter.contact_type) {
    contactQuery = contactQuery.eq("contact_type", filter.contact_type);
  }
  if (filter.source) {
    contactQuery = contactQuery.eq("source", filter.source);
  }
  if (typeof filter.score_min === "number") {
    contactQuery = contactQuery.gte("score", filter.score_min);
  }
  if (typeof filter.score_max === "number") {
    contactQuery = contactQuery.lte("score", filter.score_max);
  }
  if (filter.tags?.length) {
    contactQuery = contactQuery.overlaps("tags", filter.tags);
  }

  const { data: contacts, error: contactsErr } = await contactQuery;
  if (contactsErr) {
    await (supabase
      .from("crm_campaigns" as never)
      .update({ status: "failed", error_message: contactsErr.message } as never)
      .eq("id" as never, campaign_id) as unknown as Promise<void>);
    return new Response(JSON.stringify({ error: contactsErr.message }), {
      status: 500, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  const rawRecipients = (contacts ?? []) as Array<{ id: string; first_name: string; last_name: string | null; email: string; company_id: string | null }>;
  // Soppressioni GLOBALI (company_id IS NULL): hard bounce, reclami spam, opt-out
  // a livello piattaforma. Coerente con send-email-campaign; protegge la
  // reputazione del dominio mittente condiviso anche per le campagne cross-company.
  const suppressed = await getSuppressedEmailMap(
    supabase,
    rawRecipients.map((c) => c.email),
    null,
    "marketing",
  );
  const recipients = rawRecipients.filter((c) => !suppressed.has(normalizeEmailAddress(c.email)));
  const total = recipients.length;

  // Aggiorna total_contacts
  await (supabase
    .from("crm_campaigns" as never)
    .update({ total_contacts: total } as never)
    .eq("id" as never, campaign_id) as unknown as Promise<void>);

  if (total === 0) {
    await (supabase
      .from("crm_campaigns" as never)
      .update({ status: "sent", sent_at: new Date().toISOString(), sent_count: 0 } as never)
      .eq("id" as never, campaign_id) as unknown as Promise<void>);
    return new Response(
      JSON.stringify({ ok: true, sent: 0, errors: 0, total: 0 }),
      { headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }

  // Risolve i campi personalizzati contatto ({{ contact.<key> }}) cross-azienda.
  const customFieldResolver = await loadContactCustomFieldResolverCrossCompany(
    supabase,
    recipients.map((c) => ({ id: c.id, company_id: c.company_id })),
    [campaign.html_body],
  );

  let sentCount = 0;
  let errorCount = 0;

  // Invia in batch da 20
  // Escape dei valori sostituiti (i campi contatto sono dati non fidati): evita
  // HTML/phishing injection nel corpo email. Il template resta HTML voluto.
  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const BATCH_SIZE = 20;
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (c) => {
        if (!c.email) return;
        try {
          let personalizedHtml = campaign.html_body
            .replace(/\{\{nome\}\}/gi, escapeHtml(c.first_name ?? ""))
            .replace(/\{\{cognome\}\}/gi, escapeHtml(c.last_name ?? ""))
            .replace(/\{\{email\}\}/gi, escapeHtml(c.email));
          personalizedHtml = applyContactCustomFields(personalizedHtml, c.id, customFieldResolver);

          const result = await sendEmailUnified({
            companyId:    null,
            stream:       "marketing",
            to:           [c.email],
            subject:      campaign.subject,
            html:         personalizedHtml,
            templateName: "crm_campaign",
            skipCredits:  true,
            adminClient:  supabase,
            metadata:     { campaign_id, contact_id: c.id },
          });
          if (result.ok) {
            sentCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          errorCount++;
          console.error("[send-crm-campaign] Errore invio contatto", {
            campaign_id,
            contact_id: c.id,
            message:    getErrorMessage(err),
          });
        }
      })
    );
    // Aggiorna progress ogni batch
    await (supabase
      .from("crm_campaigns" as never)
      .update({ sent_count: sentCount, error_count: errorCount } as never)
      .eq("id" as never, campaign_id) as unknown as Promise<void>);
  }

  // Finale
  const finalStatus = errorCount === total ? "failed" : "sent";
  await (supabase
    .from("crm_campaigns" as never)
    .update({
      status: finalStatus,
      sent_at: new Date().toISOString(),
      sent_count: sentCount,
      error_count: errorCount,
      error_message: errorCount > 0 ? `${errorCount} email non inviate` : null,
    } as never)
    .eq("id" as never, campaign_id) as unknown as Promise<void>);

  return new Response(
    JSON.stringify({ ok: true, sent: sentCount, errors: errorCount, total }),
    { headers: { ...corsH, "Content-Type": "application/json" } }
  );
});
