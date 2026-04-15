/**
 * Central map of widget type → user-facing label (italiano).
 * Usato come fallback per titoli quando l'utente non ne specifica uno
 * e dai tooltip/badge del builder.
 */
import type { WidgetType } from "./types";

export const WIDGET_LABELS: Record<WidgetType, string> = {
  kpi_card: "Scheda KPI",
  stat_tile: "Tile di stato",
  chart_line: "Grafico linea",
  chart_bar: "Grafico barre",
  chart_area: "Grafico area",
  chart_pie: "Grafico torta",
  table: "Tabella dati",
  progress: "Barra progresso",
  gauge: "Indicatore",
  alert_list: "Lista alert",
  text_markdown: "Testo libero",
  divider: "Separatore",
};

export function widgetLabel(type: WidgetType): string {
  return WIDGET_LABELS[type] ?? type;
}
