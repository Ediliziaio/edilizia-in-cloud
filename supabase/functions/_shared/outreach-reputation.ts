/**
 * outreach-reputation — logica pura per la salute delle caselle mittenti.
 * Riconosce eventi bounce/complaint (SES/SNS o generici) e decide quando
 * auto-mettere-in-pausa una casella per proteggere la deliverability del pool.
 * Niente Deno/Supabase: testabile in vitest.
 */

export interface SenderRep {
  sent: number;
  bounceCount: number;
  complaintCount: number;
}

export interface PauseThresholds {
  minSent?: number;        // sotto questo volume non si valuta (rumore statistico)
  maxBounceRate?: number;  // oltre questo tasso di bounce → pausa
  maxComplaintRate?: number; // oltre questo tasso di complaint → pausa
}

/**
 * True se la casella va messa in pausa: troppi bounce o complaint su un volume
 * statisticamente sensato. Default: ≥20 invii, bounce ≥8%, complaint ≥0.5%.
 */
export function shouldPauseSender(r: SenderRep, opts?: PauseThresholds): boolean {
  const minSent = opts?.minSent ?? 20;
  const maxBounce = opts?.maxBounceRate ?? 0.08;
  const maxComplaint = opts?.maxComplaintRate ?? 0.005;
  if (r.sent < minSent) return false;
  const bounceRate = r.bounceCount / r.sent;
  const complaintRate = r.complaintCount / r.sent;
  return bounceRate >= maxBounce || complaintRate >= maxComplaint;
}

export interface DeliveryEvent {
  type: "bounce" | "complaint" | "none";
  emails: string[];
  /** true se il bounce è permanente (hard) → suppress definitivo */
  permanent: boolean;
}

function uniqLowerEmails(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out = new Set<string>();
  for (const item of list) {
    const e = typeof item === "string"
      ? item
      : (item && typeof item === "object" && typeof (item as { emailAddress?: unknown }).emailAddress === "string")
        ? (item as { emailAddress: string }).emailAddress
        : null;
    if (e && e.includes("@")) out.add(e.toLowerCase().trim());
  }
  return [...out];
}

/**
 * Riconosce un evento di recapito da un payload SES/SNS o generico.
 * - SES: { notificationType: 'Bounce'|'Complaint', bounce|complaint: {...} }
 * - generico: { event|type: 'bounce'|'complaint'|'spam'|'spamcomplaint', email|recipient }
 * Ritorna {type:'none'} se non è un evento di recapito (es. è una risposta).
 */
export function classifyDeliveryEvent(payload: unknown): DeliveryEvent {
  const none: DeliveryEvent = { type: "none", emails: [], permanent: false };
  if (!payload || typeof payload !== "object") return none;
  const p = payload as Record<string, unknown>;

  // ── SES / SNS ──
  const nt = typeof p.notificationType === "string" ? p.notificationType.toLowerCase()
    : typeof p.eventType === "string" ? p.eventType.toLowerCase() : "";
  if (nt === "bounce" && p.bounce && typeof p.bounce === "object") {
    const b = p.bounce as Record<string, unknown>;
    const permanent = String(b.bounceType ?? "").toLowerCase() === "permanent";
    return { type: "bounce", emails: uniqLowerEmails(b.bouncedRecipients), permanent };
  }
  if (nt === "complaint" && p.complaint && typeof p.complaint === "object") {
    const c = p.complaint as Record<string, unknown>;
    return { type: "complaint", emails: uniqLowerEmails(c.complainedRecipients), permanent: true };
  }

  // ── generico (sendgrid/mailgun/brevo-like) ──
  const ev = typeof p.event === "string" ? p.event.toLowerCase()
    : typeof p.type === "string" ? p.type.toLowerCase() : "";
  const oneEmail = typeof p.email === "string" ? p.email
    : typeof p.recipient === "string" ? p.recipient : null;
  const emails = oneEmail && oneEmail.includes("@") ? [oneEmail.toLowerCase().trim()] : [];
  if ((ev === "bounce" || ev === "hard_bounce" || ev === "failed" || ev === "dropped") && emails.length) {
    return { type: "bounce", emails, permanent: ev !== "failed" };
  }
  if ((ev === "complaint" || ev === "spam" || ev === "spamcomplaint" || ev === "complained") && emails.length) {
    return { type: "complaint", emails, permanent: true };
  }
  return none;
}
