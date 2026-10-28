import { differenceInCalendarDays, isValid, parseISO } from "date-fns";
import type { PosRiga } from "@/hooks/usePos";
import { vociMancanti } from "../../../supabase/functions/_shared/posModello";
import type { SafetyStage } from "@/components/sicurezza/SafetyWorkflow";
const s = (
  id: string,
  label: string,
  hint: string,
  accent: string,
): SafetyStage => ({ id, label, hint, accent });
export const POS_STAGES = [
  s(
    "compilare",
    "Da compilare",
    "Completa il modello e i dati mancanti",
    "border-t-slate-500",
  ),
  s(
    "approvare",
    "Da approvare",
    "Bozze con tutti i campi richiesti compilati",
    "border-t-amber-500",
  ),
  s(
    "approvato",
    "Approvati",
    "Approvazione registrata sul POS",
    "border-t-emerald-500",
  ),
  s(
    "archiviato",
    "Archiviati",
    "Documenti conservati in archivio",
    "border-t-violet-500",
  ),
  s(
    "altro",
    "Altri stati",
    "Documenti con altri stati registrati",
    "border-t-slate-300",
  ),
];
export function fasePos(
  p: Pick<PosRiga, "status" | "daCompilare" | "contenuto">,
): string {
  return p.status === "approvato"
    ? "approvato"
    : p.status === "archiviato"
      ? "archiviato"
      : p.status !== "bozza"
        ? "altro"
        : p.daCompilare || vociMancanti(p.contenuto).length > 0
          ? "compilare"
          : "approvare";
}
export const DUVRI_STAGES = [
  s(
    "bozza",
    "Bozze",
    "Documenti da rivedere e completare",
    "border-t-slate-500",
  ),
  s(
    "firmato",
    "Firmati",
    "Firma già raccolta e registrata",
    "border-t-blue-500",
  ),
  s(
    "archiviato",
    "Archiviati",
    "Documenti conservati in archivio",
    "border-t-violet-500",
  ),
  s(
    "altro",
    "Altri stati",
    "Stati non presenti nel flusso standard",
    "border-t-slate-300",
  ),
];
export const VERBALI_STAGES = [
  s(
    "non_conforme",
    "Non conformi",
    "Segnalazioni da approfondire",
    "border-t-rose-500",
  ),
  s(
    "parzialmente_conforme",
    "Parzialmente conformi",
    "Prescrizioni e osservazioni da verificare",
    "border-t-amber-500",
  ),
  s(
    "conforme",
    "Conformi",
    "Esito registrato nel verbale",
    "border-t-emerald-500",
  ),
  s(
    "altro",
    "Altri esiti",
    "Verbali con esito diverso o mancante",
    "border-t-slate-300",
  ),
];
export const DURC_STAGES = [
  s(
    "mancante",
    "Data mancante",
    "Inserisci la data del documento",
    "border-t-slate-500",
  ),
  s(
    "scaduto",
    "Scaduti",
    "Scadenza registrata già superata",
    "border-t-rose-500",
  ),
  s(
    "in_scadenza",
    "Entro 30 giorni",
    "Documenti da rinnovare a breve",
    "border-t-amber-500",
  ),
  s(
    "in_validita",
    "Data non scaduta",
    "La data registrata non è ancora trascorsa",
    "border-t-emerald-500",
  ),
];
export function faseDurc(
  value: string | null | undefined,
  now = new Date(),
): string {
  if (!value || !isValid(parseISO(value))) return "mancante";
  const days = differenceInCalendarDays(parseISO(value), now);
  return days < 0 ? "scaduto" : days <= 30 ? "in_scadenza" : "in_validita";
}
export const SCADENZE_STAGES = [
  s(
    "scaduto",
    "Scaduti",
    "Attività aperte con data già superata",
    "border-t-rose-500",
  ),
  s(
    "da_fare",
    "Da fare",
    "Attività aperte da pianificare e svolgere",
    "border-t-amber-500",
  ),
  s(
    "completato",
    "Completati",
    "Completamento registrato",
    "border-t-emerald-500",
  ),
];
export function faseAdempimento(
  a: { stato: string; scadenza_data?: string | null },
  now = new Date(),
): string {
  return a.stato === "completato"
    ? "completato"
    : faseDurc(a.scadenza_data, now) === "scaduto"
      ? "scaduto"
      : "da_fare";
}
export function faseNota(value: string, stages: SafetyStage[]): string {
  return stages.some((s) => s.id === value) ? value : "altro";
}
