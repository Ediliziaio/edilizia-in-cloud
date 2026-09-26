import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";

export type ColorKey = "green" | "yellow" | "red" | "blue";

export const colorStyles: Record<ColorKey, { bg: string; icon: string; val: string }> = {
  green: { bg: "bg-green-50 dark:bg-green-950/30", icon: "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400", val: "text-green-700 dark:text-green-400" },
  yellow: { bg: "bg-amber-50 dark:bg-amber-950/30", icon: "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400", val: "text-amber-700 dark:text-amber-400" },
  red: { bg: "bg-red-50 dark:bg-red-950/30", icon: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400", val: "text-red-700 dark:text-red-400" },
  blue: { bg: "bg-blue-50 dark:bg-blue-950/30", icon: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400", val: "text-blue-700 dark:text-blue-400" },
};

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  colorKey: ColorKey;
  benchmark?: string;
  isLoading?: boolean;
  /** Confronto con il periodo precedente: «buona» colora di verde, «cattiva» di rosso, null neutro. */
  variazione?: { testo: string; buona: boolean | null } | null;
}

export function KPICard({ title, value, subtitle, icon: Icon, colorKey, benchmark, isLoading, variazione }: KPICardProps) {
  const s = colorStyles[colorKey];
  // Telefono: della variazione resta la cifra («▲ +3 pt»), senza «vs periodo precedente».
  const vs = variazione ? variazione.testo.indexOf(" vs ") : -1;
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5 space-y-3 max-sm:space-y-1.5 max-sm:px-2.5 max-sm:py-2">
          <Skeleton className="h-4 w-24 max-sm:h-3 max-sm:w-16" />
          <Skeleton className="h-8 w-20 max-sm:h-5 max-sm:w-14" />
          <Skeleton className="h-3 w-32 max-sm:hidden" />
        </CardContent>
      </Card>
    );
  }
  // Telefono: nome e cifra (con la variazione); senza icona, sottotitolo né benchmark.
  return (
    <Card className={s.bg}>
      <CardContent className="p-5 max-sm:px-2.5 max-sm:py-2">
        <div className="flex items-start justify-between mb-2 max-sm:mb-0.5">
          <p className="text-sm font-medium text-muted-foreground max-sm:truncate max-sm:text-[11px]">{title}</p>
          <div className={`p-2 rounded-lg max-sm:hidden ${s.icon}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className={`text-2xl font-bold max-sm:truncate max-sm:text-base ${s.val}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1 max-sm:hidden">{subtitle}</p>}
        {variazione && (
          <p className={`text-xs mt-1 font-medium max-sm:mt-0 max-sm:truncate max-sm:text-[11px] ${
            variazione.buona === null ? "text-muted-foreground" : variazione.buona ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
          }`}>
            {vs >= 0 ? (
              <>
                {variazione.testo.slice(0, vs)}
                <span className="max-sm:hidden">{variazione.testo.slice(vs)}</span>
              </>
            ) : (
              variazione.testo
            )}
          </p>
        )}
        {benchmark && (
          <p className="text-[11px] text-muted-foreground/70 mt-2 italic max-sm:hidden">Benchmark: {benchmark}</p>
        )}
      </CardContent>
    </Card>
  );
}
