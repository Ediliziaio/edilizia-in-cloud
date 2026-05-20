/**
 * personaVisuals — v8.6.73
 *
 * Mappe condivise icon→Lucide e color→Tailwind classes per le 18 AI personas.
 * Estratto da AssistenteAIPage per riuso in AIPersonasSessionsTab + futuri
 * componenti che renderizzano avatar persona.
 *
 * Il database (ai_personas_public) memorizza icon/color come stringa libera;
 * qui mappiamo a Lucide icon component + className Tailwind.
 *
 * Fallback: icon → Bot, color → slate.
 */
import {
  Wallet, Calculator, FileText, BookOpen, HardHat, Construction, Ruler,
  ShoppingCart, TrendingUp, Briefcase, UserCheck, Headphones, Megaphone,
  Users, ShieldCheck, Scale, Crown, Brain, Bot,
  type LucideIcon,
} from "lucide-react";

export const PERSONA_ICON_MAP: Record<string, LucideIcon> = {
  Wallet, Calculator, FileText, BookOpen, HardHat, Construction, Ruler,
  ShoppingCart, TrendingUp, Briefcase, UserCheck, Headphones, Megaphone,
  Users, ShieldCheck, Scale, Crown, Brain, Bot,
};

/**
 * Classi per "ring" avatar (icona dentro box colorato).
 * Uso: <div className={cn("rounded-md p-1.5 ring-1", PERSONA_COLOR_RING[p.color] ?? PERSONA_COLOR_RING.slate)} />
 */
export const PERSONA_COLOR_RING: Record<string, string> = {
  emerald: "ring-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:ring-emerald-800/50 dark:text-emerald-300",
  amber:   "ring-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:ring-amber-800/50 dark:text-amber-300",
  blue:    "ring-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:ring-blue-800/50 dark:text-blue-300",
  purple:  "ring-purple-200 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:ring-purple-800/50 dark:text-purple-300",
  orange:  "ring-orange-200 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:ring-orange-800/50 dark:text-orange-300",
  cyan:    "ring-cyan-200 bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:ring-cyan-800/50 dark:text-cyan-300",
  green:   "ring-green-200 bg-green-50 text-green-700 dark:bg-green-950/40 dark:ring-green-800/50 dark:text-green-300",
  pink:    "ring-pink-200 bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:ring-pink-800/50 dark:text-pink-300",
  rose:    "ring-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:ring-rose-800/50 dark:text-rose-300",
  indigo:  "ring-indigo-200 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:ring-indigo-800/50 dark:text-indigo-300",
  red:     "ring-red-200 bg-red-50 text-red-700 dark:bg-red-950/40 dark:ring-red-800/50 dark:text-red-300",
  violet:  "ring-violet-200 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:ring-violet-800/50 dark:text-violet-300",
  slate:   "ring-slate-200 bg-slate-50 text-slate-700 dark:bg-slate-950/40 dark:ring-slate-800/50 dark:text-slate-300",
};

export function getPersonaIcon(iconName: string | null | undefined): LucideIcon {
  if (!iconName) return Bot;
  return PERSONA_ICON_MAP[iconName] ?? Bot;
}

export function getPersonaColorRing(color: string | null | undefined): string {
  if (!color) return PERSONA_COLOR_RING.slate;
  return PERSONA_COLOR_RING[color] ?? PERSONA_COLOR_RING.slate;
}
