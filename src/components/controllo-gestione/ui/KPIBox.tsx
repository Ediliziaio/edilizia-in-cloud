import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type KPITone = "blue" | "green" | "red" | "neutral";

interface KPIBoxProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: KPITone;
  /** Valore pieno o spiegazione mostrati passando sopra il numero. */
  valueTitle?: string;
  /** Breve spiegazione del termine (EBIT, BEP…) passando sopra l'etichetta. */
  spiegazione?: string;
}

const toneClass: Record<KPITone, string> = {
  blue: "text-primary",
  green: "text-emerald-600",
  red: "text-destructive",
  neutral: "text-foreground",
};

export function KPIBox({ label, value, sub, tone = "neutral", valueTitle, spiegazione }: KPIBoxProps) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4">
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
          spiegazione && "cursor-help underline decoration-dotted underline-offset-2",
        )}
        title={spiegazione}
      >
        {label}
      </p>
      {/* break-words e non truncate: un importo tagliato («4.655.616,...») non si legge. */}
      <p className={cn("mt-1 break-words text-xl font-bold leading-tight tabular-nums", toneClass[tone])} title={valueTitle}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
