// ============================================================================
// DDTStatusBadge — Badge visuale con icona per ogni stato DDT
// ----------------------------------------------------------------------------
// Stati supportati: atteso · attesa · parziale · ricevuto · verificato · non_conforme
// ============================================================================

import { Badge } from "@/components/ui/badge";
import {
  Clock, Hourglass, Package, PackageCheck, ShieldCheck, AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DDTStato } from "@/hooks/useDDTRicezione";

interface StatoMeta {
  label: string;
  icon: LucideIcon;
  className: string;
  dotColor: string;
}

export const DDT_STATO_META: Record<DDTStato, StatoMeta> = {
  atteso: {
    label: "Atteso",
    icon: Hourglass,
    className:
      "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900",
    dotColor: "bg-sky-500",
  },
  attesa: {
    label: "In attesa",
    icon: Clock,
    className:
      "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    dotColor: "bg-slate-400",
  },
  parziale: {
    label: "Parziale",
    icon: Package,
    className:
      "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
    dotColor: "bg-amber-500",
  },
  ricevuto: {
    label: "Ricevuto",
    icon: PackageCheck,
    className:
      "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
    dotColor: "bg-emerald-500",
  },
  verificato: {
    label: "Verificato",
    icon: ShieldCheck,
    className:
      "bg-green-100 text-green-800 border-green-300 hover:bg-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
    dotColor: "bg-green-600",
  },
  non_conforme: {
    label: "Non conforme",
    icon: AlertTriangle,
    className:
      "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
    dotColor: "bg-rose-500",
  },
};

interface DDTStatusBadgeProps {
  stato: DDTStato;
  size?: "sm" | "md";
  withIcon?: boolean;
  className?: string;
}

export function DDTStatusBadge({
  stato,
  size = "md",
  withIcon = true,
  className,
}: DDTStatusBadgeProps) {
  const meta = DDT_STATO_META[stato] ?? DDT_STATO_META.atteso;
  const Icon = meta.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium border",
        size === "sm" ? "text-[10px] py-0 px-1.5 h-5" : "text-xs py-0.5 px-2",
        meta.className,
        className,
      )}
    >
      {withIcon && <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />}
      {meta.label}
    </Badge>
  );
}

/**
 * Dot-only variant per contesti minimali (es. sidebar, liste compatte).
 */
export function DDTStatusDot({ stato, className }: { stato: DDTStato; className?: string }) {
  const meta = DDT_STATO_META[stato] ?? DDT_STATO_META.atteso;
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", meta.dotColor, className)}
      title={meta.label}
    />
  );
}
