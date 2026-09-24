/**
 * Fasi commessa predefinite per settore, per l'anteprima in /admin/aziende/nuova.
 *
 * I modelli stanno in `supabase/functions/_shared/fasiCommessa.ts`, lo stesso
 * file con cui create-company e public-checkout creano le fasi: l'anteprima
 * mostra esattamente quello che l'azienda riceverà.
 */
export {
  getOrderStatusTemplate,
  type OrderStatusTemplate,
} from "../../supabase/functions/_shared/fasiCommessa";

export const availableIcons = [
  "FileText",
  "CheckCircle",
  "Clipboard",
  "Ruler",
  "Factory",
  "Package",
  "Truck",
  "Wrench",
  "Home",
  "Zap",
  "Sun",
  "Hammer",
  "PaintBucket",
  "Settings",
  "Clock",
  "Calendar",
  "Shield",
  "Star",
  "Award",
  "Flag",
  "LifeBuoy",
] as const;

export const availableColors = [
  "#2563EB", // blu
  "#16A34A", // verde
  "#CA8A04", // ambra
  "#DC2626", // rosso
  "#7C3AED", // viola
  "#0891B2", // ciano
  "#EA580C", // arancione
  "#DB2777", // rosa
] as const;

export type AvailableIcon = typeof availableIcons[number];
export type AvailableColor = typeof availableColors[number];
