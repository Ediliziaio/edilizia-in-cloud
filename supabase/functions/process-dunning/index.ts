/**
 * process-dunning — Dunning / payment recovery sequence
 *
 * Called daily via cron. Identifies companies in the grace period or with
 * expired trials and sends the appropriate recovery email.
 *
 * Dunning sequence (days after expiry):
 *   Day 0  → "Abbonamento scaduto" soft notification
 *   Day 3  → "Accesso sospeso a breve" urgent reminder
 *   Day 7  → "Ultimo avviso" final warning
 *   Day 7  → annullamento: account sospeso automaticamente (comped/regalati ESENTI)
 *
 * Trial expiry sequence:
 *   Day -3 → "Il tuo trial scade fra 3 giorni" upsell
 *   Day  0 → "Trial scaduto" conversion
 *
 * Retry logic:
 *   On failure: retry after 2h, up to 3 attempts
 *   After 3 failures: permanently_failed=true, notify super_admin
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { resolveSender } from "../_shared/resolveSender.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const APP_URL = Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
// Stesso numero del bottone WhatsApp del sito pubblico (WhatsAppFab.tsx):
// e' quello verificato su WhatsApp Business, l'unico che risponde davvero.
// wa.me vuole il formato internazionale SENZA "+".
const SUPPORT_WHATSAPP = "393501780908";
const SUPPORT_PHONE = "+39 02 8719 8520";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours
// Grace period (giorni) dopo la scadenza abbonamento prima dell'annullamento
// (sospensione accesso). Gli account "comped"/regalati sono ESENTI.
const GRACE_DAYS = 7;

// Oltre questa eta' un sollecito di trial scaduto non si manda piu'.
const TRIAL_STALE_DAYS = 14;

// I traguardi della sequenza, in ordine. Si guarda "quanti giorni sono
// passati", non "e' esattamente il giorno N": vedi il commento nel ciclo.
const MILESTONES: Array<{ day: number; type: string }> = [
  { day: 0, type: "dunning_day0" },
  { day: 3, type: "dunning_day3" },
  { day: 7, type: "dunning_day7" },
];

// Metodi "regalo" (accesso gratuito per policy) — esenti dall'annullamento.
// Mirror di GIFTED_EXEMPT_METHODS in src/lib/paymentStatus.ts ("comped" canonico
// + sinonimi legacy). Volutamente esclusi none/""/free/trial.
const GIFTED_EXEMPT_METHODS = new Set([
  "comped", "complimentary", "comp", "manual_free", "gift", "gifted", "gratis", "omaggio",
]);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function daysDiff(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(date: string): number {
  return Math.floor((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ─── Email Templates ────────────────────────────────────────────────────────

function emailHeader(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:20px 0;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr><td style="background:#1e40af;padding:24px 32px;">
            <p style="margin:0;font-family:sans-serif;font-size:20px;font-weight:bold;color:#fff;letter-spacing:-0.5px;">
              EDILIZIA IN CLOUD
            </p>
            <p style="margin:4px 0 0;font-family:sans-serif;font-size:13px;color:#bfdbfe;">
              La piattaforma per l'edilizia italiana
            </p>
          </td></tr>
          <tr><td style="padding:32px;">
  `;
}

function emailFooter(utmCampaign: string): string {
  return `
          </td></tr>
          <tr><td style="background:#f1f5f9;padding:20px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0 0 12px;font-family:sans-serif;font-size:13px;color:#64748b;line-height:1.6;">
              Hai bisogno di aiuto? Scrivici su WhatsApp: ti risponde una persona.
            </p>
            <p style="margin:0 0 12px;">
              <a href="https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(`Ciao, ho ricevuto un avviso di pagamento e mi serve aiuto.`)}"
                 style="display:inline-block;background:#25D366;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-family:sans-serif;font-weight:600;font-size:14px;">
                Scrivici su WhatsApp
              </a>
            </p>
            <p style="margin:0;font-family:sans-serif;font-size:13px;color:#64748b;line-height:1.6;">
              Oppure chiama <strong>${SUPPORT_PHONE}</strong>, rispondi a questa email o
              <a href="${APP_URL}/azienda/supporto?utm_source=dunning&utm_medium=email&utm_campaign=${utmCampaign}"
                 style="color:#1e40af;">apri un ticket</a>.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  `;
}

function buildExpiredEmail(
  company: any,
  daysExpired: number,
  _dunningDay: string,
  opts: { payUrl?: string | null; importo?: string | null; sospensioneAttiva?: boolean } = {},
): string {
  const utmCampaign = `day_${daysExpired}`;
  const impostazioniUrl = `${APP_URL}/azienda/impostazioni/abbonamento?utm_source=dunning&utm_medium=email&utm_campaign=${utmCampaign}`;
  // Il bottone porta al pagamento della fattura vera; la pagina impostazioni
  // resta come ripiego se per qualche motivo la fattura non ce l'abbiamo.
  const ctaUrl = opts.payUrl || impostazioniUrl;
  const ctaLabel = opts.payUrl
    ? (opts.importo ? `Paga ${opts.importo} ora` : "Paga ora")
    : "Rinnova abbonamento";

  // Quanti giorni mancano DAVVERO alla sospensione. Prima era `7 - daysExpired`
  // senza pavimento: a giorno 10 l'email diceva "sospeso tra -3 giorni".
  const giorniAllaSospensione = Math.max(0, GRACE_DAYS - daysExpired);
  const quando = giorniAllaSospensione === 0
    ? "oggi"
    : giorniAllaSospensione === 1
    ? "domani"
    : `fra ${giorniAllaSospensione} giorni`;

  // Se l'annullamento automatico e' spento non si promette una sospensione che
  // non arrivera': si dice che l'accesso e' a rischio, che e' vero.
  const frase = opts.sospensioneAttiva === false
    ? "Il tuo accesso è a rischio sospensione."
    : `Il tuo accesso verrà sospeso ${quando}.`;

  const urgencyBlock =
    daysExpired >= GRACE_DAYS
      ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0;"><p style="margin:0;font-family:sans-serif;font-size:15px;font-weight:bold;color:#dc2626;">Ultimo avviso. ${frase}</p></div>`
      : daysExpired >= 3
      ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:20px 0;"><p style="margin:0;font-family:sans-serif;font-size:15px;font-weight:bold;color:#ea580c;">${frase}</p></div>`
      : `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:20px 0;"><p style="margin:0;font-family:sans-serif;font-size:15px;color:#1e40af;">Il tuo abbonamento è scaduto. Rinnova ora per continuare senza interruzioni.</p></div>`;

  const rigaImporto = opts.importo
    ? `<p style="margin:0 0 4px;font-family:sans-serif;font-size:14px;color:#6b7280;">Importo da saldare: <strong>${opts.importo}</strong></p>`
    : "";

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:600px){table{width:100%!important}td{padding:16px!important}}</style></head><body style="margin:0;padding:0;background:#f8fafc;">
    ${emailHeader()}
    <h2 style="margin:0 0 8px;font-family:sans-serif;font-size:22px;font-weight:bold;color:#111827;">Pagamento non riuscito</h2>
    <p style="margin:0 0 4px;font-family:sans-serif;font-size:14px;color:#6b7280;">Account: <strong>${company.name}</strong></p>
    ${rigaImporto}
    ${urgencyBlock}
    <p style="font-family:sans-serif;font-size:15px;color:#374151;line-height:1.6;">Non siamo riusciti a incassare il rinnovo del tuo abbonamento, scaduto da <strong>${daysExpired} ${daysExpired === 1 ? "giorno" : "giorni"}</strong>. Puoi saldare in un minuto dal link qui sotto: la pagina è quella sicura di Stripe e accetta anche una carta diversa.</p>
    <div style="text-align:center;margin:32px 0;"><a href="${ctaUrl}" style="display:inline-block;background:#1e40af;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-family:sans-serif;font-weight:600;font-size:16px;">${ctaLabel}</a></div>
    <p style="font-family:sans-serif;font-size:13px;color:#6b7280;text-align:center;">Se preferisci, puoi aggiornare il metodo di pagamento <a href="${impostazioniUrl}" style="color:#1e40af;">dalle impostazioni del tuo account</a>.</p>
    ${emailFooter(utmCampaign)}
    </body></html>`;
}

function buildTrialEmail(company: any, daysLeft: number): string {
  const utmCampaign = daysLeft <= 0 ? "trial_expired" : "trial_expiring_3d";
  const ctaUrl = `${APP_URL}/azienda/impostazioni/abbonamento?utm_source=dunning&utm_medium=email&utm_campaign=${utmCampaign}`;

  const content = daysLeft <= 0
    ? `<h2 style="margin:0 0 16px;font-family:sans-serif;font-size:22px;font-weight:bold;color:#111827;">Il tuo periodo di prova è terminato</h2>
       <p style="font-family:sans-serif;font-size:15px;color:#374151;line-height:1.6;">Il periodo di prova gratuito di <strong>${company.name}</strong> è terminato. Scegli il piano più adatto.</p>
       <div style="text-align:center;margin:32px 0;"><a href="${ctaUrl}" style="display:inline-block;background:#1e40af;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-family:sans-serif;font-weight:600;font-size:16px;">Scegli un piano</a></div>`
    : `<h2 style="margin:0 0 16px;font-family:sans-serif;font-size:22px;font-weight:bold;color:#111827;">La tua prova gratuita scade fra ${daysLeft} ${daysLeft === 1 ? "giorno" : "giorni"}</h2>
       <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:0 0 20px;"><p style="margin:0;font-family:sans-serif;font-size:15px;color:#92400e;">Mancano solo <strong>${daysLeft} ${daysLeft === 1 ? "giorno" : "giorni"}</strong> alla scadenza del tuo periodo di prova.</p></div>
       <p style="font-family:sans-serif;font-size:15px;color:#374151;line-height:1.6;">Non perdere l'accesso alle tue funzionalita' — attiva subito il tuo abbonamento.</p>
       <div style="text-align:center;margin:32px 0;"><a href="${ctaUrl}" style="display:inline-block;background:#1e40af;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-family:sans-serif;font-weight:600;font-size:16px;">Attiva abbonamento</a></div>`;

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:600px){table{width:100%!important}td{padding:16px!important}}</style></head><body style="margin:0;padding:0;background:#f8fafc;">
    ${emailHeader()}${content}${emailFooter(utmCampaign)}</body></html>`;
}

// ─── Retry Helpers ──────────────────────────────────────────────────────────

/**
 * Il link che porta DIRETTAMENTE al pagamento di quella fattura.
 *
 * E' la pagina ospitata da Stripe (hosted_invoice_url): paga l'importo esatto,
 * gestisce il 3D Secure e non richiede di entrare nel gestionale e cercare la
 * sezione abbonamento. La salviamo gia' in subscription_invoices.invoice_url.
 */
async function getPagamentoDiretto(companyId: string): Promise<{ url: string | null; importo: string | null }> {
  const { data } = await supabase
    .from("subscription_invoices")
    .select("invoice_url, amount_due")
    .eq("company_id", companyId)
    .neq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.invoice_url) return { url: null, importo: null };
  const cents = Number(data.amount_due ?? 0);
  return {
    url: String(data.invoice_url),
    importo: cents > 0
      ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100)
      : null,
  };
}

async function hasAlreadySent(companyId: string, dunningDay: string): Promise<boolean> {
  const { data } = await supabase
    .from("dunning_attempts")
    .select("id")
    .eq("company_id", companyId)
    .eq("dunning_day", dunningDay)
    .eq("status", "sent")
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function getPendingRetries(): Promise<any[]> {
  const { data } = await supabase
    .from("dunning_attempts")
    .select("*")
    .eq("status", "failed")
    .eq("permanently_failed", false)
    .lte("next_retry_at", new Date().toISOString())
    .limit(50);
  return data || [];
}

async function logDunningAttempt(
  companyId: string, dunningDay: string, status: "sent" | "failed" | "skipped",
  errorMessage?: string, retryCount = 0
) {
  const now = new Date();
  const nextRetryAt = status === "failed" && retryCount < MAX_RETRIES
    ? new Date(now.getTime() + RETRY_DELAY_MS).toISOString() : null;
  await supabase.from("dunning_attempts").insert({
    company_id: companyId, dunning_day: dunningDay,
    sent_at: status === "sent" ? now.toISOString() : null,
    status, error_message: errorMessage ?? null, retry_count: retryCount,
    next_retry_at: nextRetryAt,
    permanently_failed: status === "failed" && retryCount >= MAX_RETRIES,
  });
}

async function updateDunningAttempt(id: string, status: "sent" | "failed", errorMessage?: string, retryCount = 0) {
  const now = new Date();
  const nextRetryAt = status === "failed" && retryCount < MAX_RETRIES
    ? new Date(now.getTime() + RETRY_DELAY_MS).toISOString() : null;
  await supabase.from("dunning_attempts").update({
    status, sent_at: status === "sent" ? now.toISOString() : null,
    error_message: errorMessage ?? null, retry_count: retryCount,
    next_retry_at: nextRetryAt,
    permanently_failed: status === "failed" && retryCount >= MAX_RETRIES,
  }).eq("id", id);
}

async function logDunningEvent(companyId: string, eventType: string, notes: string) {
  await supabase.from("subscription_logs").insert({ company_id: companyId, event_type: eventType, notes, performed_by: null });
}

async function notifySuperAdmin(companyId: string, companyName: string, dunningDay: string, errorMessage: string) {
  try {
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin").limit(3);
    if (!admins?.length) return;
    const { data: profiles } = await supabase.from("profiles").select("email").in("id", admins.map((a: any) => a.user_id));
    const adminEmails = (profiles || []).map((p: any) => p.email).filter(Boolean);
    if (!adminEmails.length) return;
    await sendEmailUnified({
      companyId:    null,
      stream:       "transactional",
      to:           adminEmails,
      subject:      `Dunning fallita permanentemente — ${companyName}`,
      html:         `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;"><h2 style="color:#dc2626;">Email Dunning Fallita</h2><p>Dopo ${MAX_RETRIES} tentativi, la email dunning per <strong>${companyName}</strong> (${dunningDay}) non è stata inviata.</p><p>Errore: <code>${errorMessage}</code></p><p><a href="${APP_URL}/admin/aziende/${companyId}">Vai all'azienda</a></p></div>`,
      templateName: "dunning_admin_alert",
      skipCredits:  true,
      adminClient:  supabase,
      metadata:     { company_id: companyId, dunning_day: dunningDay },
    });
  } catch (err) {
    console.error("[dunning] Failed to notify super admin:", err);
  }
}

/**
 * Il caso arriva a un umano: non paga da N giorni, i solleciti al cliente sono
 * finiti, l'account e' ancora attivo e l'annullamento automatico e' spento.
 * Dice le due sole cose che si possono fare, e non promette nulla al posto suo.
 * Ritorna true se l'avviso e' partito (serve a registrarlo come "fatto").
 */
async function notifyAdminDecisioneSospensione(
  companyId: string, companyName: string, companyEmail: string | null,
  daysExpired: number, pagamento: { url: string | null; importo: string | null },
): Promise<boolean> {
  try {
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin").limit(3);
    if (!admins?.length) return false;
    const { data: profiles } = await supabase.from("profiles").select("email").in("id", admins.map((a: any) => a.user_id));
    const adminEmails = (profiles || []).map((p: any) => p.email).filter(Boolean);
    if (!adminEmails.length) return false;

    const importo = pagamento.importo ? ` di ${pagamento.importo}` : "";
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#b45309;margin:0 0 12px;">${companyName} non paga da ${daysExpired} giorni</h2>
      <p style="margin:0 0 12px;">Il rinnovo${importo} non è andato a buon fine e i solleciti al cliente sono terminati (ultimo avviso al giorno ${GRACE_DAYS}).</p>
      <p style="margin:0 0 12px;"><strong>L'account è ancora attivo e pienamente utilizzabile.</strong> L'annullamento automatico è spento, quindi finché non decidi tu non cambia nulla.</p>
      <p style="margin:0 0 8px;">Le due strade:</p>
      <ul style="margin:0 0 16px;padding-left:20px;">
        <li>sentire il cliente${companyEmail ? ` (${companyEmail})` : ""} e farlo pagare${pagamento.url ? ` — <a href="${pagamento.url}">link diretto alla fattura</a>` : ""};</li>
        <li>sospendere l'account dalla scheda azienda.</li>
      </ul>
      <p style="margin:0 0 16px;"><a href="${APP_URL}/admin/aziende/${companyId}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Apri la scheda azienda</a></p>
      <p style="margin:0;color:#64748b;font-size:12px;">Questo promemoria torna una volta a settimana finché la situazione resta aperta.</p>
    </div>`;

    const res = await sendEmailUnified({
      companyId:    null,
      stream:       "transactional",
      to:           adminEmails,
      subject:      `Decisione richiesta — ${companyName} non paga da ${daysExpired} giorni`,
      html,
      templateName: "dunning_admin_alert",
      skipCredits:  true,
      adminClient:  supabase,
      metadata:     { company_id: companyId, days_expired: daysExpired, tipo: "decisione_sospensione" },
    });
    return res.ok === true;
  } catch (err) {
    console.error("[dunning] avviso decisione sospensione non riuscito:", err);
    return false;
  }
}

// ─── Main Handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const corsH = getCorsHeaders(req);

  // Auth: accept either internal cron secret (scheduled) OR JWT super_admin (manual trigger)
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const requestCronSecret = req.headers.get("x-cron-secret");
  const isCronAuth = !!cronSecret && requestCronSecret === cronSecret;

  if (!isCronAuth) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("process-dunning: accesso non autorizzato");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsH });
    }
    const token = authHeader.split(" ")[1];
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.error("process-dunning: token JWT non valido");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsH });
    }
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleData) {
      console.error(`process-dunning: utente ${user.id} non ha ruolo super_admin`);
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsH });
    }
  }

  const now = new Date();
  const results = { processed: 0, emails_sent: 0, suspended: 0, errors: 0, retries_processed: 0, admin_escalations: 0 };

  // L'annullamento automatico si accende da platform_settings, non da un
  // deploy: sospendere un cliente che paga e' irreversibile dal suo punto di
  // vista (perde l'accesso), quindi la leva deve stare in mano a chi guarda i
  // conti, non a chi rilascia. Spento se la chiave non c'e'.
  const { data: suspendFlag } = await supabase
    .from("platform_settings").select("value")
    .eq("key", "dunning_auto_suspend_enabled").maybeSingle();
  const autoSuspendEnabled = String(suspendFlag?.value ?? "false").toLowerCase() === "true";

  // Mittente: la PIATTAFORMA, non l'azienda. resolveSender, se gli passi il
// companyId, sceglie l'identita' del cliente: il sollecito di pagamento
// arrivava cosi' "da Domus Group" a Domus Group, con Reply-To a Domus Group.
// companyId resta valorizzato per il log e l'associazione, ma il From lo
// forziamo su quello di piattaforma.
  const mittente = await resolveSender(null, "transactional", supabase);
  const senderOverride = {
    from: mittente.from,
    replyTo: mittente.replyTo,
    usingCustomDomain: false,
    source: "platform_default",
  };

  try {
    // ── Process pending retries first ──────────────────────────────────────
    {
      const pendingRetries = await getPendingRetries();
      for (const attempt of pendingRetries) {
        results.retries_processed++;
        try {
          // Un tentativo fallito resta in coda ANCHE se nel frattempo il giro
          // principale e' riuscito a inviare (es. fallito alle 16:03 per
          // crediti, riuscito alle 16:06 dopo il fix): senza questa guardia il
          // retry notturno mandava il doppione. Il traguardo conta una volta.
          if (await hasAlreadySent(attempt.company_id, attempt.dunning_day)) {
            await supabase.from("dunning_attempts").update({
              permanently_failed: true,
              next_retry_at: null,
              error_message: "superato: email gia' inviata dal percorso principale",
            }).eq("id", attempt.id);
            continue;
          }
          const { data: company } = await supabase
            .from("companies").select("id, name, email, trial_ends_at, subscription_plan_id, dunning_started_at")
            .eq("id", attempt.company_id).maybeSingle();

          if (!company?.email) {
            await updateDunningAttempt(attempt.id, "failed", "Company or email not found", attempt.retry_count + 1);
            continue;
          }

          let html: string;
          let subject: string;

          if (attempt.dunning_day.startsWith("trial_")) {
            const daysLeft = company.trial_ends_at ? daysUntil(company.trial_ends_at) : 0;
            html = buildTrialEmail(company, daysLeft);
            subject = daysLeft <= 0 ? "Il tuo periodo di prova è terminato" : `La tua prova gratuita scade fra ${daysLeft} giorni`;
          } else {
            const { data: sub } = await supabase.from("company_subscriptions")
              .select("current_period_end").eq("company_id", company.id)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            // Stesso ancoraggio del giro principale. Qui era rimasto
            // current_period_end: su past_due sta nel FUTURO, e alle 02:30 del
            // 27/08 e' partito un oggetto "scaduto da -20 giorni".
            const anchor = (company as { dunning_started_at?: string | null }).dunning_started_at
              ?? sub?.current_period_end;
            const daysExpired = anchor ? Math.max(0, daysDiff(anchor)) : 0;
            const pagamento = await getPagamentoDiretto(company.id);
            html = buildExpiredEmail(company, daysExpired, attempt.dunning_day, {
              payUrl: pagamento.url,
              importo: pagamento.importo,
              sospensioneAttiva: autoSuspendEnabled,
            });
            const conImporto = pagamento.importo ? ` di ${pagamento.importo}` : "";
            const subjects: Record<string, string> = {
              dunning_day0: `Pagamento${conImporto} non riuscito — rinnova l'abbonamento`,
              dunning_day3: `Sollecito: abbonamento scaduto, il tuo accesso è a rischio`,
              dunning_day7: `Ultimo avviso: abbonamento scaduto da ${daysExpired} giorni`,
            };
            subject = subjects[attempt.dunning_day] || "Abbonamento — serve la tua attenzione";
          }

          const retryResult = await sendEmailUnified({
            companyId:    company.id,
            stream:       "transactional",
            senderOverride,
            to:           [company.email],
            subject,
            html,
            templateName: `dunning_${attempt.dunning_day}`,
            // La paga la piattaforma, non il cliente. Addebitare il sollecito
            // sul borsellino email di chi e' in arretrato significa non poterlo
            // avvisare proprio quando serve: senza credito l'invio falliva con
            // "Crediti email insufficienti" e il cliente non sapeva nulla.
            skipCredits:  true,
            adminClient:  supabase,
            metadata:     { dunning_day: attempt.dunning_day, retry_count: attempt.retry_count },
          });
          if (!retryResult.ok) {
            throw new Error(String((retryResult.body as any)?.error ?? `status ${retryResult.status}`));
          }
          await updateDunningAttempt(attempt.id, "sent", undefined, attempt.retry_count);
          results.emails_sent++;
        } catch (retryErr) {
          const errMsg = (retryErr as Error).message;
          const newRetryCount = attempt.retry_count + 1;
          await updateDunningAttempt(attempt.id, "failed", errMsg, newRetryCount);
          results.errors++;
          if (newRetryCount >= MAX_RETRIES) {
            const { data: co } = await supabase.from("companies").select("id, name").eq("id", attempt.company_id).maybeSingle();
            await notifySuperAdmin(attempt.company_id, co?.name || "Sconosciuto", attempt.dunning_day, errMsg);
          }
        }
      }
    }

    // ── 1. Companies with expired subscriptions (grace period 0-14 days) ──
    const { data: expiredCompanies } = await supabase
      .from("companies").select("id, name, email, status, subscription_plan_id, payment_method, dunning_started_at")
      .in("status", ["active", "trial"]).not("subscription_plan_id", "is", null);

    for (const company of expiredCompanies || []) {
      try {
        // "Regalati"/comped (e sinonimi legacy): ESENTI dall'annullamento per mancato pagamento.
        if (GIFTED_EXEMPT_METHODS.has(String((company as { payment_method?: string }).payment_method ?? "").toLowerCase())) continue;

        const { data: sub } = await supabase.from("company_subscriptions")
          .select("current_period_end, status").eq("company_id", company.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();

        if (!sub || sub.status === "active") continue;
        if (!sub.current_period_end) continue;

        // Da quanti giorni questa azienda e' in sollecito.
        //
        // La fine del periodo pagato NON e' un buon ancoraggio. Quando Stripe
        // non riesce a incassare il rinnovo mette l'abbonamento in past_due ma
        // current_period_end resta nel FUTURO: daysDiff torna negativo e
        // l'azienda veniva scartata dal filtro sotto, cioe' proprio il caso per
        // cui la sequenza esiste non entrava mai. L'ancoraggio giusto e'
        // dunning_started_at, scritto dal webhook al primo pagamento fallito e
        // fermo per tutta la sequenza (last_payment_failure_at invece si sposta
        // a ogni retry di Stripe, e farebbe ripartire i solleciti da capo).
        const anchor = (company as { dunning_started_at?: string | null }).dunning_started_at
          ?? sub.current_period_end;
        const daysExpired = daysDiff(anchor);
        // Il tetto era 30 giorni: al giorno 31 l'azienda USCIVA dal ciclo e
        // non se ne parlava piu' — con l'auto-sospensione spenta restava attiva
        // senza pagare e senza che nessuno lo sapesse. Ora la finestra e' larga:
        // le email al CLIENTE restano comunque quelle dei traguardi (max giorno
        // 7) e sono idempotenti, quindi allargare non manda un'email in piu' a
        // nessuno. Serve solo a tenere il caso sotto osservazione.
        if (daysExpired < 0 || daysExpired > 400) continue;

        results.processed++;

        // Traguardo RAGGIUNTO, non "esattamente oggi". Con l'uguaglianza secca
        // bastava che il cron saltasse un giorno — o che partisse quando
        // l'azienda era gia' oltre — perche' il sollecito non uscisse mai piu'.
        // L'idempotenza la garantisce hasAlreadySent, non il calendario.
        const emailType = (MILESTONES.filter((m) => daysExpired >= m.day).pop() ?? null)?.type ?? null;

        if (emailType && !(await hasAlreadySent(company.id, emailType)) && company.email) {
          const pagamento = await getPagamentoDiretto(company.id);
          const html = buildExpiredEmail(company, daysExpired, emailType, {
            payUrl: pagamento.url,
            importo: pagamento.importo,
            sospensioneAttiva: autoSuspendEnabled,
          });
          // Oggetti: dicono cosa e' successo e quanto, senza promettere una
          // sospensione con un numero di giorni sbagliato.
          const conImporto = pagamento.importo ? ` di ${pagamento.importo}` : "";
          const subjects: Record<string, string> = {
            dunning_day0: `Pagamento${conImporto} non riuscito — rinnova l'abbonamento`,
            dunning_day3: `Sollecito: abbonamento scaduto, il tuo accesso è a rischio`,
            dunning_day7: `Ultimo avviso: abbonamento scaduto da ${daysExpired} giorni`,
          };
          try {
            const sendResult = await sendEmailUnified({
              companyId:    company.id,
              stream:       "transactional",
              senderOverride,
              to:           [company.email],
              subject:      subjects[emailType],
              html,
              templateName: `dunning_${emailType}`,
              // La paga la piattaforma, non il cliente. Addebitare il sollecito
            // sul borsellino email di chi e' in arretrato significa non poterlo
            // avvisare proprio quando serve: senza credito l'invio falliva con
            // "Crediti email insufficienti" e il cliente non sapeva nulla.
            skipCredits:  true,
              adminClient:  supabase,
              metadata:     { dunning_day: emailType, days_expired: daysExpired },
            });
            if (!sendResult.ok) {
              throw new Error(String((sendResult.body as any)?.error ?? `status ${sendResult.status}`));
            }
            await logDunningAttempt(company.id, emailType, "sent");
            results.emails_sent++;
          } catch (emailErr) {
            const errMsg = (emailErr as Error).message;
            console.error(`[dunning] Email send failed for company ${company.id} (${emailType}):`, errMsg);
            await logDunningAttempt(company.id, emailType, "failed", errMsg, 1);
            results.errors++;
          }
          await logDunningEvent(company.id, emailType, `Email dunning inviata (giorno ${daysExpired})`);
        }

        // Annullamento: DOPO l'ultimo avviso, mai al posto suo. Prima la
        // sospensione veniva prima con un `continue`, quindi al giorno 7
        // l'account spariva senza che il cliente avesse ricevuto l'email che
        // gliela annunciava. E si esegue solo se l'interruttore e' acceso.
        if (daysExpired >= GRACE_DAYS && autoSuspendEnabled && company.status !== "suspended") {
          await supabase.from("companies").update({ status: "suspended" }).eq("id", company.id);
          await logDunningEvent(company.id, "dunning_suspended", `Account sospeso (annullamento) dopo ${GRACE_DAYS} giorni di mancato pagamento`);
          results.suspended++;
          await notifySuperAdmin(company.id, company.name, "auto_suspension",
            `Account sospeso (annullamento) dopo ${GRACE_DAYS} giorni di mancato pagamento`);
        }

        // Passato il periodo di grazia senza incasso e senza annullamento
        // automatico, la sequenza verso il cliente e' finita (ultimo avviso al
        // giorno 7) e prima qui non succedeva NIENTE: l'account restava attivo
        // a tempo indeterminato e nessuno decideva. Domus Group e' rimasta
        // cosi' 19 giorni.
        //
        // La sospensione resta una scelta umana (interruttore spento per
        // volonta' del titolare), quindi la cosa giusta e' portare il caso a un
        // umano — e ricordarglielo finche' non lo chiude. Cadenza SETTIMANALE:
        // la chiave contiene il numero di settimana, quindi hasAlreadySent fa
        // da sola sia l'idempotenza sia la ripetizione, senza contatori.
        if (daysExpired >= GRACE_DAYS && !autoSuspendEnabled && company.status !== "suspended") {
          const settimana = Math.floor(daysExpired / 7);
          const chiave = `dunning_admin_escalation_w${settimana}`;
          if (!(await hasAlreadySent(company.id, chiave))) {
            const pagamento = await getPagamentoDiretto(company.id);
            const inviata = await notifyAdminDecisioneSospensione(
              company.id, company.name, company.email ?? null, daysExpired, pagamento,
            );
            await logDunningAttempt(company.id, chiave, inviata ? "sent" : "failed",
              inviata ? undefined : "invio avviso al super admin non riuscito");
            if (inviata) {
              results.admin_escalations++;
              await logDunningEvent(company.id, "dunning_admin_escalation",
                `Avviso al super admin: non paga da ${daysExpired} giorni, account ancora attivo`);
            } else {
              results.errors++;
            }
          }
        }
      } catch (err) {
        console.error(`Dunning error for company ${company.id}:`, err);
        results.errors++;
      }
    }

    // ── 2. Companies with trial expiring / expired ──
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: trialCompanies } = await supabase
      .from("companies").select("id, name, email, trial_ends_at").eq("status", "trial")
      .not("trial_ends_at", "is", null).lte("trial_ends_at", threeDaysFromNow);

    for (const company of trialCompanies || []) {
      try {
        if (!company.trial_ends_at) continue;
        const daysLeft = daysUntil(company.trial_ends_at);

        // Finestra come nel ramo abbonamenti: un "il tuo trial e' scaduto"
        // spedito settimane dopo non recupera nessuno, fa solo la figura di un
        // sistema che si e' appena svegliato. Se il trial e' vecchio, si tace.
        if (daysLeft < -TRIAL_STALE_DAYS) continue;

        results.processed++;

        const emailType = daysLeft <= 0 ? "trial_expired_email" : "trial_expiring_3d";
        if (await hasAlreadySent(company.id, emailType)) continue;

        if (company.email) {
          const html = buildTrialEmail(company, daysLeft);
          try {
            const sendResult = await sendEmailUnified({
              companyId:    company.id,
              stream:       "transactional",
              senderOverride,
              to:           [company.email],
              subject:      daysLeft <= 0 ? "Il tuo periodo di prova è terminato" : `La tua prova gratuita scade fra ${daysLeft} giorni`,
              html,
              templateName: `dunning_${emailType}`,
              // La paga la piattaforma, non il cliente. Addebitare il sollecito
            // sul borsellino email di chi e' in arretrato significa non poterlo
            // avvisare proprio quando serve: senza credito l'invio falliva con
            // "Crediti email insufficienti" e il cliente non sapeva nulla.
            skipCredits:  true,
              adminClient:  supabase,
              metadata:     { dunning_day: emailType, days_left: daysLeft },
            });
            if (!sendResult.ok) {
              throw new Error(String((sendResult.body as any)?.error ?? `status ${sendResult.status}`));
            }
            await logDunningAttempt(company.id, emailType, "sent");
            results.emails_sent++;
          } catch (emailErr) {
            const errMsg = (emailErr as Error).message;
            console.error(`[dunning] Trial email send failed for company ${company.id} (${emailType}):`, errMsg);
            await logDunningAttempt(company.id, emailType, "failed", errMsg, 1);
            results.errors++;
          }
        }
        await logDunningEvent(company.id, emailType, `Email trial ${daysLeft <= 0 ? "scaduto" : `scade fra ${daysLeft} giorni`} inviata`);
      } catch (err) {
        console.error(`Trial dunning error for company ${company.id}:`, err);
        results.errors++;
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-dunning fatal error:", err);
    return new Response(JSON.stringify({ error: String(err), ...results }), {
      status: 500, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }
});
