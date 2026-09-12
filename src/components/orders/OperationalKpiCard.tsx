import type { ElementType, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type OperationalKpiTone = "blue" | "green" | "amber" | "red" | "orange" | "slate";

interface OperationalKpiCardProps {
  icon: ElementType;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: OperationalKpiTone;
  isLoading?: boolean;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

const toneStyles: Record<OperationalKpiTone, { accent: string; iconBox: string; icon: string; value: string }> = {
  blue: {
    accent: "bg-blue-500",
    iconBox: "bg-blue-50 ring-blue-100",
    icon: "text-blue-600",
    value: "text-slate-950",
  },
  green: {
    accent: "bg-emerald-500",
    iconBox: "bg-emerald-50 ring-emerald-100",
    icon: "text-emerald-600",
    value: "text-emerald-700",
  },
  amber: {
    accent: "bg-amber-400",
    iconBox: "bg-amber-50 ring-amber-100",
    icon: "text-amber-600",
    value: "text-amber-700",
  },
  red: {
    accent: "bg-red-500",
    iconBox: "bg-red-50 ring-red-100",
    icon: "text-red-600",
    value: "text-red-600",
  },
  orange: {
    accent: "bg-orange-500",
    iconBox: "bg-orange-50 ring-orange-100",
    icon: "text-orange-600",
    value: "text-orange-600",
  },
  slate: {
    accent: "bg-slate-300",
    iconBox: "bg-slate-100 ring-slate-200",
    icon: "text-slate-500",
    value: "text-slate-950",
  },
};

export function OperationalKpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "slate",
  isLoading,
  active,
  onClick,
  className,
}: OperationalKpiCardProps) {
  const styles = toneStyles[tone];

  return (
    <Card
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "relative overflow-hidden border-slate-200/80 bg-gradient-to-br from-white to-slate-50/80 shadow-sm transition-all",
        // Lift hover SOLO se cliccabile — su card read-only non ha senso
        // suggerire interattività che non c'è (causava aspettative sbagliate).
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
        active && "border-orange-200 ring-2 ring-orange-200/80",
        className,
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1", styles.accent)} />
      {/* Riquadri più bassi (erano p-4 su schermo grande con l'icona a 40px):
          otto card in due righe rubavano una fascia di pagina alla tabella. */}
      <CardContent className="flex items-center gap-3 p-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1", styles.iconBox)}>
          <Icon className={cn("h-[18px] w-[18px]", styles.icon)} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{label}</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-7 w-28" />
          ) : (
            <p
              className={cn(
                "mt-0.5 truncate font-bold leading-tight tabular-nums",
                styles.value,
                // Gli importi non entrano a text-2xl e venivano troncati in
                // "365...." — cioe' il numero spariva del tutto. Misurato: la
                // colonna di testo della card e' 82px, un importo a text-2xl ne
                // chiede oltre 90. I conteggi ("10", "5") restano grandi.
                String(value).length > 5 ? "text-base sm:text-lg" : "text-lg sm:text-xl",
              )}
            >
              {value}
            </p>
          )}
          {hint && !isLoading && (
            <p className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-xs">{hint}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
