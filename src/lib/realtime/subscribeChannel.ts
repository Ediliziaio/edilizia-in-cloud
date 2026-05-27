/**
 * 2026-05-27 (audit error handling): helper unico per gestire status di
 * un canale Supabase Realtime con error reporting.
 *
 * Prima audit: 30+ posti facevano `channel.subscribe()` senza handler,
 * quindi quando il websocket moriva (CHANNEL_ERROR / TIMED_OUT / CLOSED)
 * l'utente vedeva una pagina "live" che in realtà era ferma — chat ticket
 * congelata, lead Meta non aggiornati, GPS tecnici sparito. Niente
 * feedback né log.
 *
 * Adesso si usa questo wrapper: il `label` identifica il canale nei log,
 * `onDead` riceve callback per mostrare un banner UI (opzionale ma
 * fortemente consigliato per canali user-facing).
 *
 * Esempio:
 *   subscribeChannel(channel, "ticket-messages", {
 *     onDead: () => toast.warning("Connessione live persa", {
 *       description: "Aggiorna la pagina per ricevere nuovi messaggi.",
 *     }),
 *   });
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { logger } from "@/utils/logger";

interface SubscribeChannelOptions {
  /** Callback invocato quando il canale finisce in stato terminale (ERROR/TIMED_OUT/CLOSED). */
  onDead?: (status: string, err?: Error) => void;
  /** Callback invocato quando il canale è SUBSCRIBED con successo. */
  onSubscribed?: () => void;
}

export function subscribeChannel(
  channel: RealtimeChannel,
  label: string,
  options?: SubscribeChannelOptions,
): RealtimeChannel {
  return channel.subscribe((status, err) => {
    if (status === "SUBSCRIBED") {
      options?.onSubscribed?.();
      return;
    }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      logger.warn(`[realtime:${label}] channel dead`, { status, error: err?.message });
      options?.onDead?.(status, err);
    }
  });
}
