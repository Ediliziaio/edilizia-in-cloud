/**
 * CategoriaBadge — MP-EMAIL-AI-01
 *
 * Badge per mostrare la categoria di un'email, con icona Lucide + colore.
 * Usa COALESCE(categoria, ai_category) per retrocompatibilità.
 */

import { cn } from "@/lib/utils";
import {
  User, Truck, HardHat, FileText, Receipt, TrendingUp, LifeBuoy,
  Briefcase, Newspaper, AtSign, Bell, Ban, HelpCircle,
  type LucideIcon,
} from "lucide-react";
import {
  CATEGORIA_LABELS, CATEGORIA_COLORS,
  type EmailCategoria,
} from "@/lib/email-ai/types";

const ICON_MAP: Record<EmailCategoria, LucideIcon> = {
  cliente: User,
  fornitore: Truck,
  operaio: HardHat,
  preventivo: FileText,
  fattura: Receipt,
  opportunita: TrendingUp,
  supporto: LifeBuoy,
  pratica: Briefcase,
  newsletter: Newspaper,
  social: AtSign,
  notifica: Bell,
  spam: Ban,
  altro: HelpCircle,
};

/**
 * Mappa le categorie legacy (ai_category) alle nuove (categoria MP).
 * Permette di mostrare un badge unificato anche per email non ancora migrate.
 */
const LEGACY_CATEGORY_MAP: Record<string, EmailCategoria> = {
  lead: "opportunita",
  cliente_esistente: "cliente",
  fornitore: "fornitore",
  fattura: "fattura",
  pratica_amministrativa: "pratica",
  spam: "spam",
  pending: "altro",
  altro: "altro",
};

export interface CategoriaBadgeProps {
  /** Nuova categoria (categoria) — prevale */
  categoria?: string | null;
  /** Categoria legacy (ai_category) — fallback */
  ai_category?: string | null;
  /** Mostra icona */
  showIcon?: boolean;
  /** Mostra label testuale */
  showLabel?: boolean;
  /** Indicatore "da_rivedere" */
  daRivedere?: boolean;
  /** Custom className */
  className?: string;
  /** Compatto (h-5 px-1.5 text-[10px]) */
  compact?: boolean;
}

export function CategoriaBadge({
  categoria,
  ai_category,
  showIcon = true,
  showLabel = true,
  daRivedere = false,
  className,
  compact = false,
}: CategoriaBadgeProps) {
  // Risolvi categoria effettiva
  const effective = resolveCategoria(categoria, ai_category);
  if (!effective) return null;

  const Icon = ICON_MAP[effective];
  const label = CATEGORIA_LABELS[effective];
  const color = CATEGORIA_COLORS[effective];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border font-medium whitespace-nowrap",
        compact ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-xs",
        color,
        daRivedere && "ring-1 ring-amber-400 ring-offset-1",
        className,
      )}
      title={daRivedere ? `${label} (da rivedere)` : label}
    >
      {showIcon && <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />}
      {showLabel && <span>{label}</span>}
      {daRivedere && <span className="text-amber-600 font-bold">?</span>}
    </span>
  );
}

/**
 * Risoluzione categoria: prevale categoria (nuova) → fallback ai_category (legacy).
 * Restituisce null se nessuna è valida.
 */
export function resolveCategoria(
  categoria?: string | null,
  ai_category?: string | null,
): EmailCategoria | null {
  if (categoria) {
    // Verifica sia valore valido del nuovo enum
    if (isValidCategoria(categoria)) return categoria as EmailCategoria;
  }
  if (ai_category) {
    // Map legacy → nuovo enum
    const mapped = LEGACY_CATEGORY_MAP[ai_category.toLowerCase()];
    if (mapped) return mapped;
    if (isValidCategoria(ai_category)) return ai_category as EmailCategoria;
  }
  return null;
}

function isValidCategoria(value: string): boolean {
  return value in CATEGORIA_LABELS;
}
