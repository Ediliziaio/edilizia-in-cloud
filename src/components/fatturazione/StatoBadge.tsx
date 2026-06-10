import { cn } from "@/lib/utils";
import {
  FileEdit, CheckCircle2, XCircle, AlertCircle, Ban, Send, Clock,
} from "lucide-react";
import type { StatoDocumento } from "@/types/fatturazione";

const CONFIG: Record<string, {
  label: string;
  className: string;
  icon: React.ElementType;
}> = {
  bozza: {
    label: "Bozza",
    className: "bg-muted text-muted-foreground border-border",
    icon: FileEdit,
  },
  emessa: {
    label: "Emessa",
    className: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
    icon: Send,
  },
  in_invio: {
    label: "Invio in corso",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    icon: Clock,
  },
  inviata_sdi: {
    label: "Inviata SDI",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
    icon: Send,
  },
  consegnata: {
    label: "Consegnata",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  accettata: {
    label: "Accettata",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  pagata: {
    label: "Pagata",
    className: "bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700",
    icon: CheckCircle2,
  },
  parzialmente_pagata: {
    label: "Parz. pagata",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    icon: Clock,
  },
  scaduta: {
    label: "Scaduta",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    icon: AlertCircle,
  },
  rifiutata: {
    label: "Rifiutata",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    icon: XCircle,
  },
  stornata: {
    label: "Stornata",
    className: "bg-muted text-muted-foreground border-border line-through",
    icon: Ban,
  },
  annullata: {
    label: "Annullata",
    className: "bg-muted text-muted-foreground border-border",
    icon: Ban,
  },
};

interface StatoBadgeProps {
  stato: StatoDocumento;
  className?: string;
}

export function StatoBadge({ stato, className }: StatoBadgeProps) {
  const config = CONFIG[stato] ?? CONFIG.bozza;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border whitespace-nowrap",
        config.className,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
