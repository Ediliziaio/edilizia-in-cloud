import { Mail, MessageSquare, Phone } from "lucide-react";

/**
 * Costanti e helper condivisi della timeline cadenze (canali, accent, etichette
 * ritardo), isolati dai componenti — come flow/index.ts per i nodeTypes — così il
 * fast-refresh continua a funzionare (un file di soli componenti vs uno di soli dati).
 */

export const CH_ICON: Record<string, typeof Mail> = { email: Mail, whatsapp: MessageSquare, sms: Phone };
export const CH_LABEL: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS" };

// Stile accent per canale (coerente con i nodi del builder visuale).
export const CH_ACCENT: Record<string, { wrap: string; text: string; ring: string }> = {
  email: { wrap: "bg-orange-100 dark:bg-orange-900/50", text: "text-orange-600 dark:text-orange-400", ring: "group-hover:ring-orange-200 dark:group-hover:ring-orange-800/60" },
  whatsapp: { wrap: "bg-emerald-100 dark:bg-emerald-900/50", text: "text-emerald-600 dark:text-emerald-400", ring: "group-hover:ring-emerald-200 dark:group-hover:ring-emerald-800/60" },
  sms: { wrap: "bg-sky-100 dark:bg-sky-900/50", text: "text-sky-600 dark:text-sky-400", ring: "group-hover:ring-sky-200 dark:group-hover:ring-sky-800/60" },
};

export interface TimelineStep {
  id?: string;
  channel: string;
  delay_days: number;
  delay_hours?: number;
  subject?: string | null;
  body?: string;
}

/** Etichetta ritardo assoluto leggibile: "Giorno 0", "+3 giorni", "+2 giorni 4h". */
export function delayLabel(days: number, hours = 0): string {
  const d = Math.max(0, Math.trunc(days));
  const h = Math.max(0, Math.trunc(hours));
  if (d === 0 && h === 0) return "Giorno 0";
  const parts: string[] = [];
  if (d > 0) parts.push(`+${d} ${d === 1 ? "giorno" : "giorni"}`);
  if (h > 0) parts.push(`${h}h`);
  return parts.join(" ");
}

/** Etichetta del salto di attesa TRA due step (delta), in stile "Attendi N giorni". */
export function waitLabel(deltaDays: number, deltaHours = 0): string {
  const d = Math.max(0, Math.trunc(deltaDays));
  const h = Math.max(0, Math.trunc(deltaHours));
  if (d === 0 && h === 0) return "Subito dopo";
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} ${d === 1 ? "giorno" : "giorni"}`);
  if (h > 0) parts.push(`${h} ${h === 1 ? "ora" : "ore"}`);
  return `Attendi ${parts.join(" ")}`;
}
