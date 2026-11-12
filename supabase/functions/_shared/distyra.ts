import { isIP } from "node:net";

const testo = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const record = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

/** Contratto ufficiale: balance_booked/balance_available sono oggetti {amount,currency}. */
export function importoDistyra(v: unknown): number | null {
  const oggetto = record(v);
  const valore = oggetto ? oggetto.amount : v;
  if (valore == null || (typeof valore === "string" && !valore.trim())) return null;
  if ((typeof valore !== "number" && typeof valore !== "string") || !Number.isFinite(Number(valore))) {
    throw new Error("Saldo bancario in un formato non valido");
  }
  return Number(valore);
}

/** Con balance_known:false non azzera un saldo già importato. */
export function contoDistyra(a: Record<string, unknown>, companyId: string, connectionId: string) {
  const uid = testo(a.account_id) ?? testo(a.uid);
  if (!uid) throw new Error("Il servizio bancario ha restituito un conto senza identificativo");
  const base = {
    company_id: companyId, connection_id: connectionId, external_account_id: uid,
    iban: testo(a.iban_masked), account_name: testo(a.name), account_owner_name: testo(a.holder_name),
    account_type: testo(a.account_type), currency: testo(a.currency) ?? "EUR", is_active: true,
  };
  if (a.balance_known === false) return base;
  const saldo = importoDistyra(a.balance_booked ?? a.balance);
  const disponibile = importoDistyra(a.balance_available);
  return { ...base,
    ...(saldo === null ? {} : { current_balance: saldo }),
    ...(disponibile === null ? {} : { available_balance: disponibile }),
    ...(saldo === null && disponibile === null ? {} : { balance_updated_at: new Date().toISOString() }),
  };
}

/** Solo una richiesta visibile dell'utente che ha autorizzato il conto.
 * IP e User-Agent provengono dal gateway, mai dal corpo o da un IP del server.
 * Cron, altri utenti e richieste prive di contesto mantengono i limiti automatici.
 */
export function intestazioniPsu(req: Request, onScreen: unknown, owner: unknown, userId: string): Record<string, string> {
  const ip = req.headers.get("cf-connecting-ip")?.trim();
  const ua = req.headers.get("user-agent")?.trim();
  if (onScreen !== true || owner !== userId || !ip || !isIP(ip) || !ua || ua.length > 512) return {};
  return { "Psu-Ip-Address": ip, "Psu-User-Agent": ua };
}

export class DistyraError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number, public resetsAt?: string) { super(message); }
}

export function erroreDistyra(status: number, body: Record<string, unknown> | null): DistyraError {
  const code = testo(body?.error) ?? "bank_service_unavailable";
  const retry = Number(body?.retry_after_seconds);
  const resetsAt = testo(body?.resets_at) ?? undefined;
  let message = "Il servizio bancario non è disponibile. Riprova più tardi.";
  if (code === "bank_fetch_limit_reached") message = "La banca ha raggiunto il limite giornaliero delle richieste. Non serve ricollegare il conto: riprova dopo il ripristino del limite.";
  else if (status === 429) message = "Troppe richieste al servizio bancario. Attendi prima di riprovare.";
  else if (status === 409) message = "Il consenso bancario non è ancora pronto o deve essere rinnovato. Verifica il collegamento.";
  else if (status === 502 || status === 503) message = "La banca non risponde. Il collegamento esistente resta disponibile: riprova più tardi.";
  return new DistyraError(status, code, message, Number.isFinite(retry) && retry > 0 ? retry : undefined, resetsAt);
}
