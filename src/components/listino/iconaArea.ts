import type { LucideIcon } from "lucide-react";
import { AppWindow, Bath, Flame, Hammer, Home, Layers3, LayoutGrid, Snowflake, Sun, Waves, Zap } from "lucide-react";

/** L'icona di un'area del listino (areeStandard.ts): la stessa in «+ Area» e nella Libreria listino. */
const ICONE: Record<string, LucideIcon> = {
  serramenti: AppWindow,
  fotovoltaico: Sun,
  bagni: Bath,
  tetti: Home,
  ristrutturazione: Hammer,
  climatizzazione: Snowflake,
  termoidraulico: Flame,
  elettrico: Zap,
  pavimenti: LayoutGrid,
  piscine: Waves,
};

export function iconaArea(chiave: string | null | undefined): LucideIcon {
  return (chiave && ICONE[chiave]) || Layers3;
}
