/**
 * AdminStatusCards — riga di card stato in stile "Da completare / Completati /
 * In assistenza / Margine basso" (vedi screenshot /azienda/ordini).
 *
 * Ogni card ha icona colorata + valore grande + label sotto.
 * Cliccabile (opzionale onClick) per filter quick-action.
 */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminStatusCard {
  /** Label tutta maiuscola in alto (es. "DA COMPLETARE"). */
  label: string;
  /** Valore principale (numero o stringa) — default mostrato grande. */
  value: React.ReactNode;
  /** Caption sotto al valore (es. "commesse operative"). */
  caption?: React.ReactNode;
  icon: LucideIcon;
  /** Tono colore icona/card — controlla il bg circle dell'icona. */
  tone?: "orange" | "emerald" | "blue" | "red" | "amber" | "slate";
  /** Click handler — se presente, la card diventa interattiva. */
  onClick?: () => void;
  /** Stato attivo (filtro applicato) — ring orange visibile. */
  active?: boolean;
}

interface AdminStatusCardsProps {
  cards: AdminStatusCard[];
  /** Cols su desktop (default 4). */
  cols?: 2 | 3 | 4;
}

const TONE_BG: Record<NonNullable<AdminStatusCard["tone"]>, string> = {
  orange: "bg-orange-50 text-orange-600 ring-1 ring-orange-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100",
  blue: "bg-blue-50 text-blue-600 ring-1 ring-blue-100",
  red: "bg-rose-50 text-rose-600 ring-1 ring-rose-100",
  amber: "bg-amber-50 text-amber-600 ring-1 ring-amber-100",
  slate: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
};

const COLS_CLASS: Record<NonNullable<AdminStatusCardsProps["cols"]>, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

export function AdminStatusCards({ cards, cols = 4 }: AdminStatusCardsProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-3", COLS_CLASS[cols])}>
      {cards.map((card) => {
        const Icon = card.icon;
        const Component = card.onClick ? "button" : "div";
        const toneBg = TONE_BG[card.tone ?? "slate"];
        return (
          <Component
            key={card.label}
            type={card.onClick ? "button" : undefined}
            onClick={card.onClick}
            className={cn(
              "flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all",
              card.onClick && "cursor-pointer hover:border-orange-200 hover:shadow-md",
              card.active
                ? "border-orange-300 ring-2 ring-orange-200/60"
                : "border-slate-200",
            )}
          >
            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", toneBg)}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {card.label}
              </p>
              <p className="mt-0.5 text-2xl font-bold leading-none text-slate-950">
                {card.value}
              </p>
              {card.caption ? (
                <p className="mt-1 text-xs text-slate-500">{card.caption}</p>
              ) : null}
            </div>
          </Component>
        );
      })}
    </div>
  );
}
