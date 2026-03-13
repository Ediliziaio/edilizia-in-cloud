// Category-based color schemes for action nodes (GHL-style)

export interface NodeColorScheme {
  bg: string;
  iconBg: string;
  text: string;
  border: string;
}

/** Maps action category → color scheme */
export const AZIONE_COLORI: Record<string, NodeColorScheme> = {
  comunicazione: { bg: "bg-card", iconBg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", border: "border-border" },
  crm:           { bg: "bg-card", iconBg: "bg-blue-100 dark:bg-blue-900/40",    text: "text-blue-700 dark:text-blue-400",    border: "border-border" },
  marketing:     { bg: "bg-card", iconBg: "bg-violet-100 dark:bg-violet-900/40", text: "text-violet-700 dark:text-violet-400", border: "border-border" },
  ordini:        { bg: "bg-card", iconBg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-400", border: "border-border" },
  fatturazione:  { bg: "bg-card", iconBg: "bg-teal-100 dark:bg-teal-900/40",    text: "text-teal-700 dark:text-teal-400",    border: "border-border" },
  preventivi:    { bg: "bg-card", iconBg: "bg-cyan-100 dark:bg-cyan-900/40",    text: "text-cyan-700 dark:text-cyan-400",    border: "border-border" },
  assistenza:    { bg: "bg-card", iconBg: "bg-pink-100 dark:bg-pink-900/40",    text: "text-pink-700 dark:text-pink-400",    border: "border-border" },
  magazzino:     { bg: "bg-card", iconBg: "bg-amber-100 dark:bg-amber-900/40",  text: "text-amber-700 dark:text-amber-400",  border: "border-border" },
  hr:            { bg: "bg-card", iconBg: "bg-indigo-100 dark:bg-indigo-900/40", text: "text-indigo-700 dark:text-indigo-400", border: "border-border" },
  cantieri:      { bg: "bg-card", iconBg: "bg-stone-100 dark:bg-stone-900/40",  text: "text-stone-700 dark:text-stone-400",  border: "border-border" },
  task:          { bg: "bg-card", iconBg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-700 dark:text-yellow-400", border: "border-border" },
  generale:      { bg: "bg-card", iconBg: "bg-gray-100 dark:bg-gray-800",       text: "text-gray-700 dark:text-gray-400",    border: "border-border" },
  utility:       { bg: "bg-card", iconBg: "bg-gray-100 dark:bg-gray-800",       text: "text-gray-700 dark:text-gray-400",    border: "border-border" },
  logica:        { bg: "bg-card", iconBg: "bg-amber-100 dark:bg-amber-900/40",  text: "text-amber-700 dark:text-amber-400",  border: "border-amber-300 dark:border-amber-700" },
  delay:         { bg: "bg-card", iconBg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-400", border: "border-purple-300 dark:border-purple-700" },
};

const DEFAULT_COLORS: NodeColorScheme = {
  bg: "bg-card", iconBg: "bg-muted", text: "text-foreground", border: "border-border",
};

/** Get color scheme from a catalog item's category */
export function getNodeColors(category?: string): NodeColorScheme {
  if (!category) return DEFAULT_COLORS;
  return AZIONE_COLORI[category] ?? DEFAULT_COLORS;
}
