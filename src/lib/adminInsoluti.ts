/** Gli importi della vista insoluti sono espressi in centesimi. */
export function formatInsolutiEuro(cents: number | null | undefined): string {
  if (cents == null) return "Non disponibile";
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}
const PAYMENT_LABELS: Record<string, string> = {
  past_due: "Pagamento in ritardo", unpaid: "Non pagato", canceled: "Abbonamento annullato",
  active: "Abbonamento attivo", trialing: "In prova", incomplete: "Pagamento da completare",
  incomplete_expired: "Pagamento iniziale scaduto", paused: "Abbonamento in pausa",
};
const REMINDER_LABELS: Record<string, string> = {
  none: "Nessun sollecito", recovered: "Pagamento recuperato", critical: "Recupero urgente",
  warning: "Sollecito in corso", first_reminder: "Primo sollecito", second_reminder: "Secondo sollecito",
  suspended: "Sospeso", pending: "Sollecito in attesa",
};
export function paymentStatusLabel(status: string | null): string {
  return status ? PAYMENT_LABELS[status] ?? "Stato da verificare" : "Stato non disponibile";
}
export function reminderStatusLabel(status: string): string {
  return REMINDER_LABELS[status] ?? "Sollecito da verificare";
}
export function paymentFailureLabel(reason: string): string {
  if (/insufficient_funds/i.test(reason)) return "Fondi insufficienti sulla carta";
  if (/expired_card/i.test(reason)) return "Carta scaduta";
  if (/authentication_required/i.test(reason)) return "Autenticazione del pagamento richiesta";
  if (/incorrect_cvc/i.test(reason)) return "Codice di sicurezza della carta non valido";
  if (/card_declined/i.test(reason)) return "Pagamento rifiutato dalla banca";
  if (/processing_error/i.test(reason)) return "Errore durante l’elaborazione del pagamento";
  return "Pagamento non riuscito: verifica i dettagli";
}
export function plannedRecoveryAction(action: string | null): string {
  if (action?.startsWith("sospensione automatica")) return "Sospensione prevista dalle regole di recupero";
  return action || "Azione da verificare";
}
