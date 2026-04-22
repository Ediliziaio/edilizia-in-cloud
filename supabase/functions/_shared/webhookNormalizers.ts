// ============================================================================
// webhookNormalizers — Email Dual-Provider FASE 10
// ============================================================================
// Normalizza payload eterogenei di webhook email provider (SendGrid, Brevo,
// Elastic Email, Mailgun, Resend) in un evento comune `NormalizedEvent`.
//
// File pure-TS (zero dipendenze da Deno o esm.sh) per poter essere:
//   - importato dalle Edge Functions Deno (email-provider-webhook)
//   - unit-testato via vitest da `src/test/logic/webhookNormalizers.test.ts`
// ============================================================================

export type EventType =
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "spam"
  | "unsubscribed"
  | "dropped"
  | "deferred"
  | "unknown";

export interface NormalizedEvent {
  type: EventType;
  providerMessageId?: string;
  email?: string;
  reason?: string;
  timestamp?: string;
  /**
   * true = hard bounce (permanent, indirizzo invalido). Rifondiamo il credito.
   * false = soft bounce (temporaneo, il provider riproverà).
   * undefined = ambiguo, no refund.
   */
  isHardBounce?: boolean;
  /** Provider che ha emesso l'evento — salvato in email_suppressions.source_provider. */
  provider?: "sendgrid" | "brevo" | "elastic_email" | "mailgun" | "resend";
}

// ── Per-provider event type mappers ────────────────────────────────────────
export function mapSendGridEvent(event: string): EventType {
  const map: Record<string, EventType> = {
    delivered: "delivered", open: "opened", click: "clicked",
    bounce: "bounced", spamreport: "spam", unsubscribe: "unsubscribed",
    dropped: "dropped", deferred: "deferred",
  };
  return map[event] ?? "unknown";
}

export function mapBrevoEvent(event: string): EventType {
  const map: Record<string, EventType> = {
    delivered: "delivered", opened: "opened", click: "clicked",
    hard_bounce: "bounced", soft_bounce: "bounced", complaint: "spam",
    unsubscribed: "unsubscribed",
  };
  return map[event] ?? "unknown";
}

export function mapElasticEvent(status: string): EventType {
  const map: Record<string, EventType> = {
    Sent: "delivered", Opened: "opened", Clicked: "clicked",
    Bounced: "bounced", Complaint: "spam", Unsubscribed: "unsubscribed",
    Error: "dropped",
  };
  return map[status] ?? "unknown";
}

export function mapMailgunEvent(event: string): EventType {
  const map: Record<string, EventType> = {
    delivered: "delivered", opened: "opened", clicked: "clicked",
    failed: "bounced", complained: "spam", unsubscribed: "unsubscribed",
  };
  return map[event] ?? "unknown";
}

export function mapResendEvent(type: string): EventType {
  const map: Record<string, EventType> = {
    "email.delivered": "delivered", "email.opened": "opened",
    "email.clicked": "clicked", "email.bounced": "bounced",
    "email.complained": "spam",
  };
  return map[type] ?? "unknown";
}

// ── Unified dispatcher ─────────────────────────────────────────────────────
/**
 * Rileva il provider dal payload e restituisce uno o più NormalizedEvent.
 *
 * ORDINE DI CHECK (importante, guard contro falsi positivi):
 *   1. Array → SendGrid (spedisce batch)
 *   2. body.type="email.*" + body.data → Resend (prima di Mailgun perché
 *      anche Mailgun usa body.event/body["event-data"]; Resend ha type
 *      namespaced che è il guardrail più specifico)
 *   3. body.event + body["message-id"] → Brevo
 *   4. body.status + body.msgID → Elastic Email
 *   5. body["event-data"] o body.event → Mailgun (catch-all residuale)
 */
// Il body è opaque JSON dal provider esterno: la type-safety statica sarebbe
// più costosa del valore (dup. logica nei type guards). Coperto al 100% da
// 38 test unit che esercitano tutti i branch + edge case.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeEvents(body: any, _stream: string): NormalizedEvent[] {
  // SendGrid: array di eventi
  if (Array.isArray(body)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return body.map((ev: any) => ({
      type: mapSendGridEvent(ev.event),
      providerMessageId: ev.sg_message_id ? String(ev.sg_message_id).split(".")[0] : undefined,
      email: ev.email,
      reason: ev.reason || ev.response,
      timestamp: ev.timestamp ? new Date(ev.timestamp * 1000).toISOString() : undefined,
      isHardBounce: ev.event === "bounce"
        ? (ev.type === "bounce"
          || String(ev.bounce_classification || "").toLowerCase().includes("invalid")
          || String(ev.reason || "").toLowerCase().includes("does not exist"))
        : undefined,
      provider: "sendgrid" as const,
    }));
  }

  // Resend: { type: 'email.*', data: { email_id, to, bounce? } }
  if (body && typeof body.type === "string" && body.type.startsWith("email.") && body.data) {
    const btype = String(body.data?.bounce?.type || "").toLowerCase();
    return [{
      type: mapResendEvent(body.type),
      providerMessageId: body.data?.email_id,
      email: body.data?.to?.[0],
      reason: body.data?.bounce?.message,
      timestamp: body.created_at,
      isHardBounce: body.type === "email.bounced"
        ? (btype === "permanent" ? true : btype === "transient" ? false : undefined)
        : undefined,
      provider: "resend" as const,
    }];
  }

  // Brevo: body.event + body["message-id"]
  if (body && body.event && body["message-id"]) {
    return [{
      type: mapBrevoEvent(body.event),
      providerMessageId: body["message-id"],
      email: body.email,
      reason: body.reason,
      timestamp: body.date,
      isHardBounce: body.event === "hard_bounce" ? true
        : body.event === "soft_bounce" ? false
        : undefined,
      provider: "brevo" as const,
    }];
  }

  // Elastic Email: body.status + body.msgID
  if (body && body.status && body.msgID) {
    const cat = String(body.error_category || body.bounce_category || "").toLowerCase();
    return [{
      type: mapElasticEvent(body.status),
      providerMessageId: body.msgID,
      email: body.to,
      reason: body.error_category,
      timestamp: body.date,
      isHardBounce: body.status === "Bounced"
        ? (cat.includes("hard") || cat.includes("nomailbox") || cat.includes("badaddress") ? true : undefined)
        : undefined,
      provider: "elastic_email" as const,
    }];
  }

  // Mailgun: body["event-data"] o body.event (catch-all)
  if (body && (body["event-data"] || body.event)) {
    const ev = body["event-data"] || body;
    const severity = String(ev.severity || ev["delivery-status"]?.severity || "").toLowerCase();
    return [{
      type: mapMailgunEvent(ev.event),
      providerMessageId: ev.message?.headers?.["message-id"],
      email: ev.recipient,
      reason: ev["delivery-status"]?.description,
      timestamp: ev.timestamp ? new Date(Number(ev.timestamp) * 1000).toISOString() : undefined,
      isHardBounce: ev.event === "failed"
        ? (severity === "permanent" ? true : severity === "temporary" ? false : undefined)
        : undefined,
      provider: "mailgun" as const,
    }];
  }

  return [];
}

// ── Suppression scope decision ─────────────────────────────────────────────
export interface SuppressionDecision {
  reason: "hard_bounce" | "spam_complaint" | "unsubscribe" | null;
  /** NULL = globale (vale per tutte le aziende); UUID = scope per-azienda. */
  companyIdScope: string | null;
  /** false = non generare una suppression (bounce soft, tipo ignoto, ecc.). */
  shouldSuppress: boolean;
}

/**
 * Decide se e come generare una riga in `email_suppressions` dato
 * un NormalizedEvent. Deriva scope (globale vs per-azienda) in base al tipo.
 *
 * - hard_bounce → GLOBALE (email invalida ovunque)
 * - spam_complaint → GLOBALE (protezione reputazione dominio mittente)
 * - unsubscribe → PER-AZIENDA (l'utente vuole solo essere escluso da quel sender)
 * - bounce soft / opened / clicked / delivered → nessuna suppression
 */
export function decideSuppression(
  event: NormalizedEvent,
  deliveryCompanyId: string | null,
): SuppressionDecision {
  if (event.type === "bounced" && event.isHardBounce === true) {
    return { reason: "hard_bounce", companyIdScope: null, shouldSuppress: true };
  }
  if (event.type === "spam") {
    return { reason: "spam_complaint", companyIdScope: null, shouldSuppress: true };
  }
  if (event.type === "unsubscribed") {
    return {
      reason: "unsubscribe",
      companyIdScope: deliveryCompanyId,
      shouldSuppress: true,
    };
  }
  return { reason: null, companyIdScope: null, shouldSuppress: false };
}
