/** Priorità delle attività: etichette, colori e ordine crescente (per l'ordinamento in tabella). */
export const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  bassa:   { label: "Bassa",   className: "bg-muted text-muted-foreground" },
  normale: { label: "Normale", className: "bg-primary/10 text-primary" },
  alta:    { label: "Alta",    className: "bg-warning/10 text-warning" },
  urgente: { label: "Urgente", className: "bg-destructive/10 text-destructive" },
};
export const PRIORITY_ORDER = ["bassa", "normale", "alta", "urgente"];
