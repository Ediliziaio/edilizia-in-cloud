// ============================================================================
// lifecycle-email-tick — Email lifecycle automation engine
// ============================================================================
// Si chiama via pg_cron giornaliero. Per ogni regola lifecycle:
//   1. Trova le aziende che soddisfano la condition + non hanno già ricevuto
//      l'email (lifecycle_email_sends idempotency)
//   2. Carica il template da platform_email_templates (editabile da super-admin)
//   3. Applica placeholders {{var}} → valori reali
//   4. Invia via send-transactional-v2 (rispetta suppression, branding, etc.)
//   5. Logga in lifecycle_email_sends
//
// Trigger gestiti:
//   - lifecycle_d3_no_activation   → signup > 3gg AND has_first_customer=false
//   - lifecycle_d7_features        → signup > 7gg AND signup < 14gg
//   - lifecycle_trial_ending       → trial_ends_at tra 2 e 4 giorni
//   - lifecycle_monthly_summary    → primo del mese (1 invio per (company, month))
//
// lifecycle_payment_failed è triggerata da stripe-webhook (non da qui).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface SendResult {
  template: string;
  candidates: number;
  sent: number;
  failed: number;
  errors: string[];
}

/** Applica placeholder {{var}} → value (semplice replace, no escape). */
function applyPlaceholders(text: string, vars: Record<string, string | number>): string {
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g");
    out = out.replace(re, String(v ?? ""));
  }
  return out;
}

interface TemplateRow {
  subject: string;
  html_body: string;
  text_body: string | null;
}

async function loadTemplate(
  supa: ReturnType<typeof createClient>,
  templateKey: string,
): Promise<TemplateRow | null> {
  const { data, error } = await supa
    .from("platform_email_templates")
    .select("subject, html_body, text_body")
    .eq("template_key", templateKey)
    .is("role_variant", null)
    .eq("enabled", true)
    .maybeSingle();
  if (error) {
    console.error(`[lifecycle] template load error ${templateKey}:`, error.message);
    return null;
  }
  return data as TemplateRow | null;
}

/** Invia 1 email a 1 destinatario via send-transactional-v2. */
async function sendEmail(
  templateKey: string,
  to: string,
  vars: Record<string, string | number>,
  template: TemplateRow,
): Promise<{ ok: boolean; error?: string }> {
  const subject = applyPlaceholders(template.subject, vars);
  const html = applyPlaceholders(template.html_body, vars);
  const text = template.text_body ? applyPlaceholders(template.text_body, vars) : null;

  // Invochiamo send-transactional-v2 internamente per beneficiare di
  // branding, suppression, log_delivery.
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        companyId: null,
        templateName: templateKey,
        props: vars,
        to,
        // Override sender via platform default; nessun branding company-side.
        skipCredits: true,
        metadata: { source: "lifecycle-email-tick" },
        // Pre-rendered subject/html in caso il TEMPLATE_REGISTRY non abbia il key
        precomputedSubject: subject,
        precomputedHtml: html,
        precomputedText: text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `${res.status} ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function logSend(
  supa: ReturnType<typeof createClient>,
  companyId: string | null,
  userId: string | null,
  templateKey: string,
  emailTo: string,
  status: "sent" | "failed" | "skipped",
  metadata?: AnyRecord,
) {
  await supa.from("lifecycle_email_sends").insert({
    company_id: companyId,
    user_id: userId,
    template_key: templateKey,
    email_to: emailTo,
    delivery_status: status,
    metadata: metadata ?? null,
  } as never);
}

// ─── Trigger 1: D+3 no activation ───────────────────────────────────────────
async function runD3NoActivation(
  supa: ReturnType<typeof createClient>,
): Promise<SendResult> {
  const res: SendResult = { template: "lifecycle_d3_no_activation", candidates: 0, sent: 0, failed: 0, errors: [] };
  const template = await loadTemplate(supa, "lifecycle_d3_no_activation");
  if (!template) return res;

  // Aziende create 3-5 giorni fa, in trial, senza prima commessa
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const { data: companies } = await supa
    .from("companies")
    .select("id, name, status, created_at")
    .gte("created_at", fiveDaysAgo)
    .lte("created_at", threeDaysAgo)
    .eq("status", "trial");

  if (!companies?.length) return res;
  res.candidates = companies.length;

  for (const c of companies as AnyRecord[]) {
    // Check no ordini
    const { count: ordersCount } = await supa
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", c.id);
    if ((ordersCount ?? 0) > 0) continue;

    // Check no email già inviata
    const { count: alreadySent } = await supa
      .from("lifecycle_email_sends")
      .select("id", { count: "exact", head: true })
      .eq("company_id", c.id)
      .eq("template_key", "lifecycle_d3_no_activation");
    if ((alreadySent ?? 0) > 0) continue;

    // Trova admin email
    const { data: profile } = await supa
      .from("profiles")
      .select("id, first_name")
      .eq("company_id", c.id)
      .limit(1)
      .maybeSingle();
    if (!profile) continue;

    const { data: userData } = await supa.auth.admin.getUserById((profile as AnyRecord).id);
    const email = userData.user?.email;
    if (!email) continue;

    const vars = {
      recipientName: (profile as AnyRecord).first_name ?? "ciao",
      companyName: c.name ?? "la tua azienda",
      loginUrl: "https://app.ediliziaincloud.com/azienda",
      completedSteps: "1/6",
    };

    const sendRes = await sendEmail("lifecycle_d3_no_activation", email, vars, template);
    if (sendRes.ok) {
      res.sent++;
      await logSend(supa, c.id, (profile as AnyRecord).id, "lifecycle_d3_no_activation", email, "sent", vars);
    } else {
      res.failed++;
      res.errors.push(`${c.id}: ${sendRes.error}`);
      await logSend(supa, c.id, (profile as AnyRecord).id, "lifecycle_d3_no_activation", email, "failed", { error: sendRes.error });
    }
  }
  return res;
}

// ─── Trigger 2: D+7 features ────────────────────────────────────────────────
async function runD7Features(supa: ReturnType<typeof createClient>): Promise<SendResult> {
  const res: SendResult = { template: "lifecycle_d7_features", candidates: 0, sent: 0, failed: 0, errors: [] };
  const template = await loadTemplate(supa, "lifecycle_d7_features");
  if (!template) return res;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: companies } = await supa
    .from("companies")
    .select("id, name, created_at")
    .gte("created_at", fourteenDaysAgo)
    .lte("created_at", sevenDaysAgo);

  if (!companies?.length) return res;
  res.candidates = companies.length;

  for (const c of companies as AnyRecord[]) {
    const { count: already } = await supa
      .from("lifecycle_email_sends")
      .select("id", { count: "exact", head: true })
      .eq("company_id", c.id)
      .eq("template_key", "lifecycle_d7_features");
    if ((already ?? 0) > 0) continue;

    const { data: profile } = await supa.from("profiles").select("id, first_name").eq("company_id", c.id).limit(1).maybeSingle();
    if (!profile) continue;
    const { data: ud } = await supa.auth.admin.getUserById((profile as AnyRecord).id);
    const email = ud.user?.email;
    if (!email) continue;

    const vars = {
      recipientName: (profile as AnyRecord).first_name ?? "ciao",
      companyName: c.name ?? "",
      tutorialUrl: "https://app.ediliziaincloud.com/azienda",
    };
    const sr = await sendEmail("lifecycle_d7_features", email, vars, template);
    if (sr.ok) { res.sent++; await logSend(supa, c.id, (profile as AnyRecord).id, "lifecycle_d7_features", email, "sent", vars); }
    else { res.failed++; res.errors.push(`${c.id}: ${sr.error}`); }
  }
  return res;
}

// ─── Trigger 3: Trial ending (D-3) ──────────────────────────────────────────
async function runTrialEnding(supa: ReturnType<typeof createClient>): Promise<SendResult> {
  const res: SendResult = { template: "lifecycle_trial_ending", candidates: 0, sent: 0, failed: 0, errors: [] };
  const template = await loadTemplate(supa, "lifecycle_trial_ending");
  if (!template) return res;

  const in2Days = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const in4Days = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();

  const { data: companies } = await supa
    .from("companies")
    .select("id, name, trial_ends_at, status")
    .eq("status", "trial")
    .gte("trial_ends_at", in2Days)
    .lte("trial_ends_at", in4Days);

  if (!companies?.length) return res;
  res.candidates = companies.length;

  for (const c of companies as AnyRecord[]) {
    const { count: already } = await supa
      .from("lifecycle_email_sends")
      .select("id", { count: "exact", head: true })
      .eq("company_id", c.id)
      .eq("template_key", "lifecycle_trial_ending");
    if ((already ?? 0) > 0) continue;

    const [{ count: ordersCount }, { count: custCount }] = await Promise.all([
      supa.from("orders").select("id", { count: "exact", head: true }).eq("company_id", c.id),
      supa.from("customers").select("id", { count: "exact", head: true }).eq("company_id", c.id),
    ]);

    const trialEnd = new Date(c.trial_ends_at as string);
    const daysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

    const { data: profile } = await supa.from("profiles").select("id, first_name").eq("company_id", c.id).limit(1).maybeSingle();
    if (!profile) continue;
    const { data: ud } = await supa.auth.admin.getUserById((profile as AnyRecord).id);
    const email = ud.user?.email;
    if (!email) continue;

    const vars = {
      recipientName: (profile as AnyRecord).first_name ?? "ciao",
      companyName: c.name ?? "",
      daysRemaining: String(daysRemaining),
      ordersCount: String(ordersCount ?? 0),
      customersCount: String(custCount ?? 0),
      upgradeUrl: "https://app.ediliziaincloud.com/azienda/impostazioni/abbonamento",
    };
    const sr = await sendEmail("lifecycle_trial_ending", email, vars, template);
    if (sr.ok) { res.sent++; await logSend(supa, c.id, (profile as AnyRecord).id, "lifecycle_trial_ending", email, "sent", vars); }
    else { res.failed++; res.errors.push(`${c.id}: ${sr.error}`); }
  }
  return res;
}

// ─── Trigger 4: Monthly summary (solo il giorno 1 del mese) ────────────────
async function runMonthlySummary(supa: ReturnType<typeof createClient>): Promise<SendResult> {
  const res: SendResult = { template: "lifecycle_monthly_summary", candidates: 0, sent: 0, failed: 0, errors: [] };
  const today = new Date();
  if (today.getUTCDate() !== 1) return res;

  const template = await loadTemplate(supa, "lifecycle_monthly_summary");
  if (!template) return res;

  // Mese precedente
  const lastMonth = new Date(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);
  const monthEnd = new Date(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const monthName = lastMonth.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const monthKey = `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, "0")}`;

  const { data: companies } = await supa.from("companies").select("id, name").eq("status", "active");
  if (!companies?.length) return res;
  res.candidates = companies.length;

  for (const c of companies as AnyRecord[]) {
    // Idempotenza: per monthly cerchiamo metadata.month_key
    const { data: existing } = await supa
      .from("lifecycle_email_sends")
      .select("id, metadata")
      .eq("company_id", c.id)
      .eq("template_key", "lifecycle_monthly_summary")
      .order("sent_at", { ascending: false })
      .limit(5);
    if (existing?.some((e: AnyRecord) => e.metadata?.month_key === monthKey)) continue;

    const { count: ordersCount } = await supa
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", c.id)
      .gte("created_at", lastMonth.toISOString())
      .lt("created_at", monthEnd.toISOString());

    const { data: profile } = await supa.from("profiles").select("id, first_name").eq("company_id", c.id).limit(1).maybeSingle();
    if (!profile) continue;
    const { data: ud } = await supa.auth.admin.getUserById((profile as AnyRecord).id);
    const email = ud.user?.email;
    if (!email) continue;

    const vars = {
      recipientName: (profile as AnyRecord).first_name ?? "ciao",
      monthName,
      ordersCount: String(ordersCount ?? 0),
      revenueFormatted: "—",
      hoursSaved: String(Math.max(8, (ordersCount ?? 0) * 4)),
      dashboardUrl: "https://app.ediliziaincloud.com/azienda",
    };
    const sr = await sendEmail("lifecycle_monthly_summary", email, vars, template);
    if (sr.ok) {
      res.sent++;
      await logSend(supa, c.id, (profile as AnyRecord).id, "lifecycle_monthly_summary", email, "sent", { ...vars, month_key: monthKey });
    } else {
      res.failed++; res.errors.push(`${c.id}: ${sr.error}`);
    }
  }
  return res;
}

// ─── Entry point ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const results: SendResult[] = [];
  try {
    results.push(await runD3NoActivation(supa));
    results.push(await runD7Features(supa));
    results.push(await runTrialEnding(supa));
    results.push(await runMonthlySummary(supa));
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, partial: results }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    status: "done",
    run_at: new Date().toISOString(),
    results,
  }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
