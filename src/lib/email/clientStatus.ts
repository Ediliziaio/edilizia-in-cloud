import type { EmailConnectionHealth } from "@/pages/azienda/email/components/EmailConnectionHealthPanel";

export function emailClientStatus(connections: EmailConnectionHealth[], loading: boolean, failed: boolean, syncing: boolean, syncFailed = false): {label: string; warning: boolean} {
  if (syncing) return {label: "Sincronizzazione…", warning: false};
  if (loading) return {label: "Verifica caselle…", warning: false};
  if (failed) return {label: "Stato caselle non disponibile", warning: true};
  if (syncFailed) return {label: "Sincronizzazione non riuscita", warning: true};
  if (connections.some(c => c.status !== "active" || !!c.last_sync_error || (c.consecutive_errors ?? 0) > 0)) return {label: "Problemi di sincronizzazione", warning: true};
  if (connections.some(c => c.poll_enabled === false)) return {label: "Sincronizzazione sospesa", warning: true};
  const times = connections.map(c => c.last_synced_at ? new Date(c.last_synced_at).getTime() : NaN).filter(Number.isFinite);
  if (times.length === 0) return {label: "Nessuna sincronizzazione registrata", warning: false};
  const time = new Date(Math.max(...times)).toLocaleString("it-IT", {day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"});
  return {label: `Ultimo sync: ${time}`, warning: false};
}
export function emailReadErrorMessage(error: unknown): string {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error ?? "");
  if (/timeout|timed out|statement timeout|connection terminated|network|fetch/i.test(message)) return "Il servizio email non ha risposto in tempo. Riprova per rileggere i messaggi già ricevuti.";
  return "Non è stato possibile leggere le email. Riprova; se il problema continua, verifica lo stato della casella nelle impostazioni.";
}
