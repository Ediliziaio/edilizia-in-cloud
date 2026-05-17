/**
 * Listino Manutenzione — constants.
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 *
 * Allineati ai CHECK DB (migration 20260814000001_listino_prezzi.sql L.37-38):
 *   iva_percentuale IN (0,4,10,22)  — niente 5% (non esiste in IT)
 *   unita IN ('intervento','ora','mq','ml','pz') — niente "giorno"
 */
import type { CategoriaIntervento } from "./types";

export const ICONE_IMPIANTO = ["🔥", "🌡️", "💧", "⚡", "☀️", "🔧", "🏠", "❄️", "🛠️", "⚙️"];

export const CATEGORIE_INTERVENTO: { value: CategoriaIntervento; label: string; color: string }[] = [
  { value: "manutenzione_ordinaria",     label: "Manutenzione ordinaria",     color: "bg-green-100 text-green-700" },
  { value: "manutenzione_straordinaria", label: "Manutenzione straordinaria", color: "bg-amber-100 text-amber-700" },
  { value: "guasto",                     label: "Guasto / emergenza",         color: "bg-red-100 text-red-700" },
  { value: "installazione",              label: "Installazione",              color: "bg-blue-100 text-blue-700" },
  { value: "sopralluogo",                label: "Sopralluogo",                color: "bg-yellow-100 text-yellow-700" },
];

export const UNITA_OPTIONS = ["intervento", "ora", "mq", "ml", "pz"] as const;
export const IVA_OPTIONS = [0, 4, 10, 22] as const;

/** Label user-friendly per l'unità. */
export const UNITA_LABEL: Record<(typeof UNITA_OPTIONS)[number], string> = {
  intervento: "A intervento",
  ora: "Ora",
  mq: "Metro quadro",
  ml: "Metro lineare",
  pz: "Pezzo",
};

/** Helper: badge config per CategoriaIntervento. */
export function categoriaBadge(cat: CategoriaIntervento | null) {
  const found = CATEGORIE_INTERVENTO.find((c) => c.value === cat);
  return found ?? { label: cat ?? "—", color: "bg-gray-100 text-gray-700" };
}
