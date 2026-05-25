/**
 * Helper per scrivere audit log lato client per azioni admin distruttive.
 *
 * Razionale:
 *   - Le RLS della tabella `admin_audit_log` consentono SELECT solo a super_admin
 *     ma INSERT è ristretta al `service_role` (fatto via edge function).
 *   - Da client diretto useremmo `service_role` → non possibile.
 *   - Workflow: chiamiamo edge function `manage-audit-log` con action `log`
 *     che fa l'INSERT con service_role internamente. Sicuro + tamper-proof.
 *
 * Per ora, esponiamo `logAdminAuditAction` che chiama un'edge function se
 * disponibile, altrimenti fa fail-silent (no blocking della UX).
 *
 * Uso tipico:
 *   onDeleteSuccess: () => {
 *     logAdminAuditAction({
 *       action: "user.delete",
 *       targetType: "platform_user",
 *       targetId: deletedUser.id,
 *       details: { email: deletedUser.email, roles: deletedUser.roles },
 *     });
 *   }
 */
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

export interface AdminAuditLogEntry {
  /** Azione codificata (es. "user.delete", "course.grant.revoke"). */
  action: string;
  /** Tipo entità target (platform_user, multi_company_user, portal_course, ...). */
  targetType?: string;
  /** ID dell'entità target. */
  targetId?: string;
  /** Payload contestuale (before/after, ragione, ecc.). NON metterci secrets. */
  details?: Record<string, unknown>;
}

/**
 * Logga un'azione admin distruttiva.
 * Fail-silent: in caso di errore, log a console ma non interrompe la UX.
 * L'utente NON deve mai vedere errori "audit log fallito" — il dato critico
 * è già stato salvato dall'azione principale (delete/revoke/...).
 */
/**
 * Cache: una volta scoperto che l'edge function `manage-audit-log` non esiste
 * (non ancora deployed), evitiamo di ritentare ogni azione — sprecherebbe
 * roundtrip e popolerebbe la console di warning su ogni delete/reset.
 *
 * Stato session-scoped (reset al refresh pagina) — se la function viene
 * deployata, il prossimo refresh pulisce il flag e i log riprendono.
 */
let edgeFunctionMissing = false;

/**
 * Detect se l'errore è dovuto a edge function NON deployata (vs errore reale).
 *
 * Pattern target:
 *   - "404 Not Found"
 *   - "Function not found"
 *   - "does not exist"
 *
 * NB: il pattern generico "non-2xx status code" di Supabase è stato RIMOSSO
 * intenzionalmente: matcha anche 500/503 reali → maschereremmo errori
 * legittimi e perderemmo audit log forensics. Meglio loggare un warn per
 * gli errori non-deterministici e mantenere il silenzio solo sui 404 reali.
 *
 * Test in `safeStatusCheck`: usiamo prima il `status` numerico se disponibile
 * dal context, fallback alla regex sul message.
 */
function isEdgeFunctionMissing(errMsg: string, status?: number): boolean {
  if (typeof status === "number") {
    // Soglia rigorosa: solo 404 = function not deployed.
    return status === 404;
  }
  const msg = errMsg.toLowerCase();
  return (
    msg.includes("404") ||
    msg.includes("function not found") ||
    msg.includes("function_not_found") ||
    msg.includes("does not exist")
  );
}

function extractStatus(err: unknown): number | undefined {
  // FunctionsHttpError ha `context.status` (Response object)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (err as any)?.context;
  if (ctx && typeof ctx === "object" && "status" in ctx) {
    return (ctx as { status?: number }).status;
  }
  return undefined;
}

export async function logAdminAuditAction(entry: AdminAuditLogEntry): Promise<void> {
  // Skip silenzioso se sappiamo già che la function non è deployata
  if (edgeFunctionMissing) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sp = supabase as any;
    const { data: sessionData } = await sp.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      logger.debug("[audit] skipped — no session token");
      return;
    }

    const { error } = await supabase.functions.invoke("manage-audit-log", {
      body: { action: "log", entry },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (error) {
      const msg = String(error.message ?? error);
      const status = extractStatus(error);
      if (isEdgeFunctionMissing(msg, status)) {
        // Edge function non deployata — log silenzioso e mai più ritentare
        // in questa session. Niente warning rumoroso in console.
        edgeFunctionMissing = true;
        logger.debug("[audit] edge function not deployed, skipping audit logs this session");
        return;
      }
      logger.warn("[audit] failed to write log:", msg);
    }
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    const status = extractStatus(err);
    if (isEdgeFunctionMissing(msg, status)) {
      edgeFunctionMissing = true;
      logger.debug("[audit] edge function not deployed, skipping audit logs this session");
      return;
    }
    logger.warn("[audit] write threw:", msg);
  }
}
