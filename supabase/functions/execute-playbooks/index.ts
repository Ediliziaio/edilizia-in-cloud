/**
 * execute-playbooks — Feature 8
 * Funzione schedulata che esegue i lifecycle playbook attivi.
 *
 * Logica:
 *  1. Carica tutti i playbook attivi raggruppati per trigger_event
 *  2. Identifica le aziende che soddisfano ciascun trigger
 *  3. Dedup: salta le aziende che hanno già un'esecuzione recente (<24h)
 *  4. Crea `playbook_executions` (pending → running → completed/failed)
 *  5. Esegue ogni azione definita nel playbook (send_email, add_tag,
 *     send_message, change_flag, wait)
 *
 * Invocabile via cron (ogni 15 minuti) o manualmente dai SuperAdmin.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  getCorsHeaders,
  secureHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/headers.ts";

// ─── Autenticazione ───────────────────────────────────────────────────────────

/**
 * 2026-05-27 SECURITY FIX: prima accettava QUALSIASI Bearer senza validare.
 * Ora verifica che il token sia service-role o un JWT utente valido.
 */
async function verifyCronOrAuth(req: Request): Promise<void> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  if (cronSecret && reqSecret === cronSecret) return;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized: missing cron secret or JWT" }), {
      status: 401,
      headers: secureHeaders,
    });
  }
  const token = authHeader.slice(7);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) return;

  const sbUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!sbUrl || !anonKey) {
    throw new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 503,
      headers: secureHeaders,
    });
  }
  const client = createClient(sbUrl, anonKey);
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Unauthorized: invalid JWT" }), {
      status: 401,
      headers: secureHeaders,
    });
  }
  // SECURITY FIX 2: un JWT valido non basta — QUALSIASI utente tenant poteva
  // triggerare i playbook (invii massivi). Solo super_admin.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    throw new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 503, headers: secureHeaders });
  }
  const admin = createClient(sbUrl, serviceKey);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const isSuperAdmin = (roles || []).some((r: { role: string }) => r.role === "super_admin");
  if (!isSuperAdmin) {
    throw new Response(JSON.stringify({ error: "Forbidden: super_admin only" }), {
      status: 403,
      headers: secureHeaders,
    });
  }
}

// ─── Tipi ─────────────────────────────────────────────────────────────────────

interface PlaybookAction {
  // NB: la UI (usePlaybooks) usa anche "notify_superadmin" e "update_flag":
  // prima finivano nel default "azione sconosciuta" e venivano ignorate.
  type:
    | "send_email"
    | "add_tag"
    | "send_message"
    | "notify_superadmin"
    | "change_flag"
    | "update_flag"
    | "wait";
  template_id?: string;
  tag?: string;
  message?: string;
  flag?: string;
  value?: unknown;
  delay_minutes?: number;
}

interface Playbook {
  id: string;
  name: string;
  trigger_event: string;
  delay_hours: number;
  actions: PlaybookAction[];
}

interface Company {
  id: string;
  name: string;
  status: string;
  trial_ends_at: string | null;
  consecutive_payment_failures: number | null;
  dunning_status: string | null;
  subscription_plan_id: string | null;
  created_at: string;
}

// Placeholder supportati nei template/messaggi. La UI documentava {{name}},
// {{plan}} e {{days}} ma l'executor sostituiva solo {{company_name}} (e solo
// la PRIMA occorrenza): arrivavano messaggi con {{name}} letterale.
function renderTemplate(text: string, company: Company, planName: string | null, now: Date): string {
  const daysLeft = company.trial_ends_at
    ? String(Math.max(0, Math.ceil((new Date(company.trial_ends_at).getTime() - now.getTime()) / 86400000)))
    : "";
  return text
    .replaceAll("{{company_name}}", company.name)
    .replaceAll("{{name}}", company.name)
    .replaceAll("{{plan}}", planName ?? "")
    .replaceAll("{{days}}", daysLeft);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Valuta se un'azienda soddisfa il trigger ─────────────────────────────────

function companyMatchesTrigger(
  trigger: string,
  company: Company,
  now: Date,
): boolean {
  switch (trigger) {
    case "trial_started":
      if (company.status !== "trial") return false;
      // Aziende create nelle ultime 2 ore (nuovo trial avviato)
      return (
        now.getTime() - new Date(company.created_at).getTime() <
        2 * 3600 * 1000
      );

    case "trial_expiring_7d":
      if (company.status !== "trial" || !company.trial_ends_at) return false;
      {
        const daysLeft = Math.ceil(
          (new Date(company.trial_ends_at).getTime() - now.getTime()) / 86400000,
        );
        return daysLeft >= 6 && daysLeft <= 7;
      }

    case "trial_expired": {
      if (company.status !== "trial" || !company.trial_ends_at) return false;
      // solo scaduti negli ultimi 7 giorni: senza il limite ogni trial scaduto
      // da mesi rimatchava a ogni run.
      const expiredMs = now.getTime() - new Date(company.trial_ends_at).getTime();
      return expiredMs > 0 && expiredMs <= 7 * 86400000;
    }

    case "payment_failed":
      return (company.consecutive_payment_failures ?? 0) >= 3;

    case "payment_recovered":
      // BUGFIX: prima matchava OGNI azienda attiva senza fallimenti (cioè
      // tutte quelle sane) → "grazie per il pagamento recuperato" a chi non ha
      // mai fallito. Ora richiede il segnale reale del dunning.
      return company.dunning_status === "recovered" && company.status === "active";

    case "account_suspended":
      return company.status === "suspended";

    case "churned":
      // companies.status non vale mai "churned" (il dunning setta "suspended"
      // e il churn vive su dunning_status): controlla entrambi.
      return company.status === "churned" || company.dunning_status === "churned";

    case "reactivated":
      // BUGFIX: prima bastava "active da più di 7 giorni" → matchava TUTTI i
      // clienti attivi. Riattivato = attivo con recupero dunning alle spalle.
      return company.status === "active" && company.dunning_status === "recovered" &&
        now.getTime() - new Date(company.created_at).getTime() > 7 * 86400000;

    default:
      return false;
  }
}

// ─── Esegue una singola azione ────────────────────────────────────────────────

interface ExecContext {
  planName: string | null;
  now: Date;
  superAdminIds: string[];
  playbookName: string;
}

async function executeAction(
  supabase: ReturnType<typeof createClient>,
  action: PlaybookAction,
  company: Company,
  log: string[],
  ctx: ExecContext,
): Promise<void> {
  switch (action.type) {
    case "send_email": {
      if (!action.template_id) {
        log.push(`send_email: template_id mancante`);
        return;
      }
      // BUGFIX: la UI/libreria passa slug testuali ("welcome_trial") ma la
      // lookup era solo per id uuid → template mai trovato. Ora: uuid → id,
      // altrimenti step_name (lo "slug" reale di dunning_email_templates).
      const tplQ = supabase.from("dunning_email_templates").select("subject, body_text");
      const { data: tpl } = UUID_RE.test(action.template_id)
        ? await tplQ.eq("id", action.template_id).maybeSingle()
        : await tplQ.eq("step_name", action.template_id).maybeSingle();

      if (!tpl) {
        log.push(`send_email: template "${action.template_id}" non trovato (né per id né per step_name)`);
        return;
      }

      // Invia via superadmin_comunicazioni (log comunicazione in uscita)
      const { error } = await supabase.from("superadmin_comunicazioni").insert({
        company_id: company.id,
        tipo: "email_automatica",
        oggetto: renderTemplate(tpl.subject, company, ctx.planName, ctx.now),
        messaggio: renderTemplate(tpl.body_text, company, ctx.planName, ctx.now),
        inviata_da: null,
      });

      log.push(
        error
          ? `send_email: errore inserimento comunicazione: ${error.message}`
          : `send_email: comunicazione registrata per ${company.name}`,
      );
      break;
    }

    case "add_tag": {
      if (!action.tag) {
        log.push(`add_tag: tag mancante`);
        return;
      }
      // Aggiunge tag a company_tags (se esiste la tabella)
      const { error } = await supabase.from("company_tags").upsert(
        { company_id: company.id, tag: action.tag },
        { onConflict: "company_id,tag" },
      );
      log.push(
        error
          ? `add_tag: errore: ${error.message}`
          : `add_tag: tag "${action.tag}" aggiunto`,
      );
      break;
    }

    case "send_message": {
      if (!action.message) {
        log.push(`send_message: messaggio mancante`);
        return;
      }
      const { error } = await supabase.from("superadmin_comunicazioni").insert({
        company_id: company.id,
        tipo: "messaggio_automatico",
        oggetto: "Messaggio automatico",
        messaggio: renderTemplate(action.message, company, ctx.planName, ctx.now),
        inviata_da: null,
      });
      log.push(
        error
          ? `send_message: errore: ${error.message}`
          : `send_message: messaggio inviato`,
      );
      break;
    }

    case "notify_superadmin": {
      // Prima finiva in "azione sconosciuta": ora crea una notifica in-app
      // per ogni super_admin (campanella), con link all'azienda.
      const body = renderTemplate(action.message || `Playbook "${ctx.playbookName}" scattato per {{company_name}}`, company, ctx.planName, ctx.now);
      if (ctx.superAdminIds.length === 0) {
        log.push(`notify_superadmin: nessun super_admin trovato`);
        return;
      }
      const rows = ctx.superAdminIds.map((uid) => ({
        user_id: uid,
        company_id: company.id,
        type: "playbook_alert",
        title: `Playbook: ${ctx.playbookName}`,
        body,
        action_url: `/admin/aziende/${company.id}`,
      }));
      const { error } = await supabase.from("notifications").insert(rows);
      log.push(
        error
          ? `notify_superadmin: errore: ${error.message}`
          : `notify_superadmin: notificati ${rows.length} super_admin`,
      );
      break;
    }

    case "change_flag":
    case "update_flag": {
      // "update_flag" è il nome usato dalla UI: prima veniva ignorato.
      if (!action.flag) {
        log.push(`${action.type}: flag mancante`);
        return;
      }
      const { error } = await supabase
        .from("companies")
        .update({ [action.flag]: action.value })
        .eq("id", company.id);
      log.push(
        error
          ? `${action.type}: errore: ${error.message}`
          : `${action.type}: ${action.flag}=${action.value} impostato`,
      );
      break;
    }

    case "wait": {
      // "wait" è puramente dichiarativo nel JSONB — nessuna azione reale
      log.push(
        `wait: ${action.delay_minutes ?? 0} min (ignorato nell'esecuzione sincrona)`,
      );
      break;
    }

    default:
      log.push(`azione sconosciuta: ${(action as PlaybookAction).type}`);
  }
}

// ─── Handler principale ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    await verifyCronOrAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();

    // 1. Carica playbook attivi
    const { data: playbooks, error: pbErr } = await supabase
      .from("lifecycle_playbooks")
      .select("id, name, trigger_event, delay_hours, actions")
      .eq("is_active", true);

    if (pbErr) throw pbErr;
    if (!playbooks || playbooks.length === 0) {
      return jsonResponse({ success: true, executed: 0, message: "Nessun playbook attivo" });
    }

    // 2. Carica aziende attive/trial/suspended/churned
    const { data: companies, error: compErr } = await supabase
      .from("companies")
      .select(
        "id, name, status, trial_ends_at, consecutive_payment_failures, dunning_status, subscription_plan_id, created_at",
      )
      .in("status", ["active", "trial", "suspended", "churned"])
      .eq("is_platform_admin_company", false)
      .limit(10000);

    if (compErr) throw compErr;

    // Nomi piani per i placeholder {{plan}}
    const { data: plans } = await supabase.from("subscription_plans").select("id, name");
    const planNameById = new Map((plans || []).map((p: any) => [p.id, p.name as string]));

    // Super admin per l'azione notify_superadmin
    const { data: saRoles } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin");
    const superAdminIds = [...new Set((saRoles || []).map((r: any) => r.user_id as string))];

    // 3. Dedup ALL-TIME per (playbook, company): i trigger sono transizioni
    // one-shot (welcome, winback, recovered…) — col vecchio dedup a sole 24h
    // la stessa azienda rimatchava a ogni run e riceveva la stessa email OGNI
    // GIORNO finché la condizione restava vera.
    const { data: recentExecs } = await supabase
      .from("playbook_executions")
      .select("playbook_id, company_id")
      .in("status", ["completed", "running", "pending"])
      .limit(100000);

    const dedupSet = new Set(
      (recentExecs || []).map((e: any) => `${e.playbook_id}:${e.company_id}`),
    );

    let executedCount = 0;
    const errors: string[] = [];

    for (const playbook of playbooks as Playbook[]) {
      for (const company of (companies || []) as Company[]) {
        // Valuta trigger
        if (!companyMatchesTrigger(playbook.trigger_event, company, now)) continue;

        // Dedup
        const key = `${playbook.id}:${company.id}`;
        if (dedupSet.has(key)) continue;
        dedupSet.add(key);

        // Ritardo configurato sul playbook
        if (playbook.delay_hours > 0) {
          // Non eseguiamo immediatamente se il delay non è scaduto —
          // semplicemente lo scheduleremmo, ma in modalità cron sincrona
          // creiamo l'execution e la marchiamo completed per semplicità.
          // Un'implementazione con pg_cron o task queue può gestire il delay.
        }

        // Crea record execution
        const { data: exec, error: execInsertErr } = await supabase
          .from("playbook_executions")
          .insert({
            playbook_id: playbook.id,
            company_id: company.id,
            trigger_event: playbook.trigger_event,
            status: "running",
            started_at: now.toISOString(),
          })
          .select("id")
          .single();

        if (execInsertErr || !exec) {
          errors.push(`Insert execution error per ${company.id}: ${execInsertErr?.message}`);
          continue;
        }

        // Esegui azioni
        const actionsLog: string[] = [];
        let execStatus: "completed" | "failed" = "completed";
        let errorMessage: string | null = null;

        try {
          const actions = Array.isArray(playbook.actions) ? playbook.actions : [];
          const ctx: ExecContext = {
            planName: company.subscription_plan_id ? (planNameById.get(company.subscription_plan_id) ?? null) : null,
            now,
            superAdminIds,
            playbookName: playbook.name,
          };
          for (const action of actions) {
            await executeAction(supabase, action, company, actionsLog, ctx);
          }
        } catch (err) {
          execStatus = "failed";
          errorMessage = err instanceof Error ? err.message : String(err);
          actionsLog.push(`ERRORE FATALE: ${errorMessage}`);
        }

        // Aggiorna execution record
        await supabase
          .from("playbook_executions")
          .update({
            status: execStatus,
            completed_at: new Date().toISOString(),
            actions_log: actionsLog,
            error_message: errorMessage,
          })
          .eq("id", exec.id);

        executedCount++;
      }
    }

    return jsonResponse({
      success: true,
      executed: executedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    console.error("execute-playbooks error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
