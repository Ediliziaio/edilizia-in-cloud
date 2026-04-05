/**
 * Selettore intervallo di date per la dashboard Google Ads.
 * Offre preset rapidi (7gg, 30gg, 90gg) e selezione personalizzata.
 *
 * @param dateRange - Intervallo attualmente selezionato
 * @param onChangeRange - Callback invocato al cambio intervallo
 */
import { subDays } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GoogleAdsDateRange } from "@/types/google-ads";

interface GoogleAdsDateRangePickerProps {
  dateRange: GoogleAdsDateRange;
  onChangeRange: (range: GoogleAdsDateRange) => void;
}

type Preset = { label: string; days: number };

const PRESETS: Preset[] = [
  { label: "Ultimi 7 giorni", days: 7 },
  { label: "Ultimi 30 giorni", days: 30 },
  { label: "Ultimi 90 giorni", days: 90 },
];

export function GoogleAdsDateRangePicker({
  dateRange,
  onChangeRange,
}: GoogleAdsDateRangePickerProps) {
  const today = new Date();

  const handlePreset = (days: number) => {
    onChangeRange({ from: subDays(today, days - 1), to: today });
  };

  // Determina quale preset è attivo in base alla differenza di giorni
  const activeDays =
    Math.round(
      (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
      {PRESETS.map((p) => (
        <Button
          key={p.days}
          variant={activeDays === p.days ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => handlePreset(p.days)}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
