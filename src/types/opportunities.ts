export interface OpportunityStage {
  id: string;
  name: string;
  position: number;
  auto_status?: string | null;
}

export const STATUS_OPTIONS = [
  { value: "open", label: "Aperta" },
  { value: "won", label: "Vinta" },
  { value: "lost", label: "Persa" },
  { value: "abandoned", label: "Abbandonata" },
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
