export interface OpportunityStage {
  id: string;
  name: string;
  position: number;
  auto_status?: string | null;
}

export type OpportunityStatus = "open" | "won" | "lost" | "abandoned";

const STATUS_VALUES = new Set<OpportunityStatus>(["open", "won", "lost", "abandoned"]);

export function normalizeOpportunityStatus(value: unknown): OpportunityStatus | undefined {
  return typeof value === "string" && STATUS_VALUES.has(value as OpportunityStatus)
    ? value as OpportunityStatus
    : undefined;
}

export function inferOpportunityStatusFromStage(
  stage?: Pick<OpportunityStage, "name" | "auto_status"> | null,
  fallback: OpportunityStatus = "open",
): OpportunityStatus {
  const explicit = normalizeOpportunityStatus(stage?.auto_status);
  if (explicit) return explicit;

  const normalizedName = (stage?.name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/\b(won|vint[ao]|chius[ao]\s+vint[ao])\b/.test(normalizedName)) return "won";
  if (/\b(lost|pers[ao]|chius[ao]\s+pers[ao])\b/.test(normalizedName)) return "lost";
  if (/\b(abbandonat[ao]|abandoned)\b/.test(normalizedName)) return "abandoned";

  return fallback;
}

export const STATUS_OPTIONS = [
  { value: "open", label: "Aperta" },
  { value: "won", label: "Vinta" },
  { value: "lost", label: "Persa" },
  { value: "abandoned", label: "Abbandonata" },
] as const;

// Opzioni della colonna "stato automatico" di una fase pipeline: quando
// un'opportunita' entra nella fase, il suo status diventa questo.
// Unica fonte per PipelinesConfig (creazione) e PipelineStagesConfig (modifica):
// prima erano due liste separate che potevano divergere.
//
// I 4 stati sono chiusi e non vanno estesi alla leggera: sono la matematica
// dell'imbuto (forecast, tasso di chiusura, grafici) ed e' hardcodata in ~15
// punti. Per distinguere i MOTIVI di uscita (numero sbagliato, fuori zona,
// non qualificato) si usa il nome della fase: le automazioni sanno gia'
// scattare per singola fase con opportunity_stage_changed + to_stage_id.
export const AUTO_STATUS_OPTIONS = [
  {
    value: "none",
    label: "Nessuno",
    hint: "La fase non tocca lo stato dell'opportunità.",
  },
  {
    value: "open",
    label: "Aperta",
    hint: "Trattativa viva, resta nel forecast.",
  },
  {
    value: "won",
    label: "Vinta",
    hint: "Contratto chiuso: entra nel fatturato e alza il tasso di chiusura.",
  },
  {
    value: "lost",
    label: "Persa",
    hint: "Trattativa fatta e persa: abbassa il tasso di chiusura.",
  },
  {
    value: "abandoned",
    label: "Abbandonata",
    hint: "Mai diventata trattativa (numero sbagliato, fuori zona, non qualificato): esclusa dal tasso di chiusura.",
  },
] as const;

export const STATUS_MAP: Record<string, { label: string; className: string }> = {
  open: { label: "Aperta", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  won: { label: "Vinta", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  lost: { label: "Persa", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  abandoned: { label: "Abbandonata", className: "bg-muted text-muted-foreground" },
};

export function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}
