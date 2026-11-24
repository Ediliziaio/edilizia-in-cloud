// Selettore periodo compatto e condiviso dall'area Costi (Panoramica + Personale).
// mode: "mese" (default, comportamento storico) | "trimestre" | "anno" — cambia
// il passo delle frecce e l'etichetta; il valore resta sempre un mese (l'inizio
// del periodo lo calcola chi consuma).
import { addMonths, format, getQuarter, isSameMonth, isSameQuarter, isSameYear, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

export type PeriodMode = "mese" | "trimestre" | "anno";

const STEP: Record<PeriodMode, number> = { mese: 1, trimestre: 3, anno: 12 };

export function MonthPicker({
  month,
  onChange,
  mode = "mese",
}: {
  month: Date;
  onChange: (m: Date) => void;
  mode?: PeriodMode;
}) {
  const t = useT();
  const now = new Date();
  const isCurrent =
    mode === "anno" ? isSameYear(month, now)
    : mode === "trimestre" ? isSameQuarter(month, now)
    : isSameMonth(month, now);
  const label =
    mode === "anno" ? format(month, "yyyy")
    : mode === "trimestre" ? `${getQuarter(month)}° trim. ${format(month, "yyyy")}`
    : format(month, "MMMM yyyy", { locale: dateFnsCampo() });
  const step = STEP[mode];

  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {/* tap-compact: su telefono i bottoni restano da 32px (non 44). */}
      <Button
        variant="ghost"
        size="icon"
        className="tap-compact h-8 w-8"
        onClick={() => onChange(startOfMonth(addMonths(month, -step)))}
        aria-label={t("Periodo precedente")}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[130px] text-center text-sm font-semibold capitalize text-slate-900">
        {label}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="tap-compact h-8 w-8"
        onClick={() => onChange(startOfMonth(addMonths(month, step)))}
        aria-label={t("Periodo successivo")}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {!isCurrent && (
        <Button
          variant="outline"
          size="sm"
          className="tap-compact h-8 text-xs"
          onClick={() => onChange(startOfMonth(now))}
        >
          {t("Oggi")}
        </Button>
      )}
    </div>
  );
}
