/**
 * Stato di manutenzione di un impianto, calcolato dalla prossima scadenza del
 * suo piano. È il "kanban che si aggiorna da solo": nessuno lo sposta a mano,
 * cambia colonna quando cambia la data.
 */
import { differenceInDays } from "date-fns";

export type StatoManutenzione = "scaduta" | "in_scadenza" | "in_regola" | "senza_piano";

export interface StatoManutMeta {
  key: StatoManutenzione;
  label: string;
  /** tono per StatTile / badge */
  tone: "red" | "amber" | "green" | "neutral";
  /** classi badge (bg+text) coerenti con l'assistenza */
  badge: string;
}

export const STATI_MANUTENZIONE: StatoManutMeta[] = [
  { key: "scaduta", label: "Scaduta", tone: "red", badge: "bg-red-100 text-red-700" },
  { key: "in_scadenza", label: "In scadenza", tone: "amber", badge: "bg-amber-100 text-amber-700" },
  { key: "in_regola", label: "In regola", tone: "green", badge: "bg-emerald-100 text-emerald-700" },
  { key: "senza_piano", label: "Senza piano", tone: "neutral", badge: "bg-slate-100 text-slate-600" },
];

export const STATO_MANUT_META: Record<StatoManutenzione, StatoManutMeta> = Object.fromEntries(
  STATI_MANUTENZIONE.map((s) => [s.key, s]),
) as Record<StatoManutenzione, StatoManutMeta>;

/** Soglia "in scadenza": stessa finestra dei 14 giorni usata in tutta la pagina. */
export function statoManutenzione(prossimaScadenza: string | null, hasPiano: boolean): StatoManutenzione {
  if (!hasPiano || !prossimaScadenza) return "senza_piano";
  const giorni = differenceInDays(new Date(prossimaScadenza), new Date());
  if (giorni < 0) return "scaduta";
  if (giorni <= 14) return "in_scadenza";
  return "in_regola";
}

/** Etichetta breve "Scade tra Xgg / Scaduta Xgg fa / —". */
export function etichettaScadenza(prossimaScadenza: string | null): string {
  if (!prossimaScadenza) return "—";
  const giorni = differenceInDays(new Date(prossimaScadenza), new Date());
  if (giorni < 0) return `Scaduta ${Math.abs(giorni)}gg fa`;
  if (giorni === 0) return "Scade oggi";
  return `Scade tra ${giorni}gg`;
}
