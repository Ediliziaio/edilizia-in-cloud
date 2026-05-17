/**
 * SicurezzaCantiere — constants
 * Estratto da SicurezzaCantiere.tsx (MP-CAN-001 Fase 3).
 */

export const STATUS_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  approvato: "bg-green-100 text-green-800",
  archiviato: "bg-slate-100 text-slate-600",
  firmato: "bg-blue-100 text-blue-800",
};

export const STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza",
  approvato: "Approvato",
  archiviato: "Archiviato",
  firmato: "Firmato",
};
