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

function verifyCronOrAuth(req: Request): void {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  if (cronSecret && reqSecret === cronSecret) return;

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) return;

  throw new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: secureHeaders,
  });
}

// ─── Tipi ─────────────────────────────────────────────────────────────────────

interface PlaybookAction {
  type:
    | "send_email"
    | "add_tag"
    | "send_message"
    | "change_flag"
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
  subscription_plan_id: string | null;
  created_at: string;
}

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

    case "trial_expired":
      if (company.status !== "trial" || !company.trial_ends_at) return false;
      return new Date(company.trial_ends_at) < now;

    case "payment_failed":
      return (company.consecutive_payment_failures ?? 0) >= 3;

    case "payment_recovered":
      // consecutive_payment_failures resettato a 0 dopo recupero:
      // difficile da rilevare con cron puro — usiamo il caso base
      return (company.consecutive_payment_failures ?? 0) === 0 &&
        company.status === "active";

    case "account_suspended":
      return company.status === "suspended";

    case "churned":
      return company.status === "churned";

    case "reactivated":
      // Status active + creato da più di 7 giorni (evita nuove iscrizioni)
      if (company.status !== "active") return false;
      return (
        now.getTime() - new Date(company.created_at).getTime() >
        7 * 86400000
      );

    default:
      return false;
  }
}

// ─── Esegue una singola azione ────────────────────────────────────────────────

async function executeAction(
  supabase: ReturnType<typeof createClient>,
  action: PlaybookAction,
  company: Company,
  log: string[],
): Promise<void> {
  switch (action.type) {
    case "send_email": {
      if (!action.template_id) {
        log.push(`send_email: template_id mancante`);
        return;
      }
      // Carica template
      const { data: tpl } = await supabase
        .from("dunning_email_templates")
        .select("subject, body_text")
        .eq("id", action.template_id)
        .single();

      if (!tpl) {
        log.push(`send_email: template ${action.template_id} non trovato`);
        return;
      }

      // Invia via superadmin_comunicazioni (log comunicazione in uscita)
      const { error } = await supabase.from("superadmin_comunicazioni").insert({
        company_id: company.id,
        tipo: "email_automatica",
        oggetto: tpl.subject.replace("{{company_name}}", company.name),
        messaggio: tpl.body_text.replace("{{company_name}}", company.name),
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
        messaggio: action.message.replace("{{company_name}}", company.name),
        inviata_da: null,
      });
      log.push(
        error
          ? `send_message: errore: ${error.message}`
          : `send_message: messaggio inviato`,
      );
      break;
    }

    case "change_flag": {
      if (!action.flag) {
        log.push(`change_flag: flag mancante`);
        return;
      }
      const { error } = await supabase
        .from("companies")
        .update({ [action.flag]: action.value })
        .eq("id", company.id);
      log.push(
        error
          ? `change_flag: errore: ${error.message}`
          : `change_flag: ${action.flag}=${action.value} impostato`,
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
    verifyCronOrAuth(req);

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
        "id, name, status, trial_ends_at, consecutive_payment_failures, subscription_plan_id, created_at",
      )
      .in("status", ["active", "trial", "suspended", "churned"])
      .eq("is_platform_admin_company", false);

    if (compErr) throw compErr;

    // 3. Carica esecuzioni recenti per dedup (ultime 24h)
    const since24h = new Date(now.getTime() - 24 * 3600000).toISOString();
    const { data: recentExecs } = await supabase
      .from("playbook_executions")
      .select("playbook_id, company_id")
      .gte("started_at", since24h)
      .in("status", ["completed", "running", "pending"]);

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
          for (const action of actions) {
            await executeAction(supabase, action, company, actionsLog);
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
