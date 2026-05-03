import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type KPITone = "blue" | "green" | "red" | "neutral";

interface KPIBoxProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: KPITone;
}

const toneClass: Record<KPITone, string> = {
  blue: "text-primary",
  green: "text-emerald-600",
  red: "text-destructive",
  neutral: "text-foreground",
};

export function KPIBox({ label, value, sub, tone = "neutral" }: KPIBoxProps) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", toneClass[tone])}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
