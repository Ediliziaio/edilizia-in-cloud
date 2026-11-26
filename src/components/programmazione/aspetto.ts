/** Colori della Programmazione, condivisi fra schede, vista per persona e mappa. */
import { orderColor } from "@/lib/calendarUtils";
import type { EsitoSera, Intervento } from "@/lib/programmazione/giornata";

export function coloreIntervento(i: Intervento): string {
  if (i.tipo === "sopralluogo") return "#8B5CF6";
  if (i.tipo === "manutenzione") return "#0EA5E9";
  if (i.tipo === "commissione") return "#D97706";
  return i.orderId ? orderColor(i.orderId) : "#94A3B8";
}

export const TONO_SERA: Record<EsitoSera, { classe: string; testo: string }> = {
  come_previsto: { classe: "bg-emerald-500", testo: "Ha timbrato qui" },
  presente: { classe: "bg-emerald-300", testo: "Ha timbrato (senza cantiere)" },
  altrove: { classe: "bg-amber-500", testo: "Ha timbrato in un altro cantiere" },
  non_timbrato: { classe: "bg-rose-500", testo: "Non ha timbrato" },
  assente: { classe: "bg-slate-400", testo: "Assente" },
};

