import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

/** «mese:2026-11» → {anno: 2026, mese: 11}; null per ogni altro periodo. */
export function leggiMese(preset: string): { anno: number; mese: number } | null {
  const m = /^mese:(\d{4})-(\d{2})$/.exec(preset);
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? { anno: Number(m[1]), mese: Number(m[2]) } : null;
}
export const presetMese = (anno: number, mese: number) => `mese:${anno}-${String(mese).padStart(2, "0")}`;

/** Sposta di `passo` mesi, anche oltre l'anno. */
export function spostaMese(anno: number, mese: number, passo: number) {
  const d = new Date(anno, mese - 1 + passo, 1);
  return { anno: d.getFullYear(), mese: d.getMonth() + 1 };
}

const nomeMese = (anno: number, mese: number, formato: "long" | "short" = "long") => {
  const s = new Date(anno, mese - 1, 1).toLocaleDateString(intlCampo(), formato === "long" ? { month: "long", year: "numeric" } : { month: "short" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

interface Props {
  preset: string;
  /** Anno scelto, o «all». Vale quando il periodo non è un mese preciso. */
  anno: string;
  onMese: (anno: number, mese: number) => void;
  onAnno: (anno: string) => void;
  onProssimi30: () => void;
  onPersonalizzato: () => void;
  className?: string;
  /** Al posto del nome del periodo (es. «Arretrato al 31/10/2026»): le frecce restano spente. */
  etichettaFissa?: string;
}

/** «‹ Novembre 2026 ›»: il mese si cambia con le frecce, il nome apre la scelta di mese, anno o intervallo. */
export function NavigatoreMese({ preset, anno, onMese, onAnno, onProssimi30, onPersonalizzato, className, etichettaFissa }: Props) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const mese = leggiMese(preset);
  const annoNum = anno === "all" ? new Date().getFullYear() : Number(anno);
  const [annoVista, setAnnoVista] = useState(mese?.anno ?? annoNum);
  const scorrevole = !etichettaFissa && !!mese || (!etichettaFissa && !preset && anno !== "all");
  const etichetta = etichettaFissa ? etichettaFissa : mese ? nomeMese(mese.anno, mese.mese)
    : preset === "30gg" ? t("Prossimi 30 gg")
    : preset === "custom" ? t("Personalizzato")
    : anno === "all" ? t("Tutti gli anni") : t("Tutto il {anno}", { anno });
  const passo = (d: number) => {
    if (mese) { const n = spostaMese(mese.anno, mese.mese, d); onMese(n.anno, n.mese); }
    else if (!preset && anno !== "all") onAnno(String(Number(anno) + d));
  };
  const oggi = new Date();
  const scegli = (fn: () => void) => { fn(); setAperto(false); };
  return (
    <div role="group" aria-label={t("Periodo scadenze")} className={cn("flex items-center gap-0.5", className)}>
      <Button type="button" variant="outline" size="icon" className="size-8 shrink-0 max-lg:size-10" disabled={!scorrevole} onClick={() => passo(-1)}
        aria-label={mese ? t("Mese prima") : t("Anno prima")}><ChevronLeft className="h-4 w-4" /></Button>
      <Popover open={aperto} onOpenChange={(v) => { setAperto(v); if (v) setAnnoVista(mese?.anno ?? annoNum); }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-8 min-w-[9.5rem] flex-1 justify-center gap-1.5 px-2 text-sm font-semibold max-lg:h-10"
            aria-label={t("Scegli il periodo: {periodo}", { periodo: etichetta })}>
            <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />{etichetta}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-2 p-3">
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={t("Anno prima")} onClick={() => setAnnoVista((a) => a - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-semibold tabular-nums">{annoVista}</span>
            <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={t("Anno dopo")} onClick={() => setAnnoVista((a) => a + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const scelto = mese?.anno === annoVista && mese.mese === m;
              const corrente = oggi.getFullYear() === annoVista && oggi.getMonth() + 1 === m;
              return <Button key={m} type="button" size="sm" variant={scelto ? "default" : "ghost"} aria-pressed={scelto}
                className={cn("h-8 px-0 text-xs", corrente && !scelto && "ring-1 ring-primary/40")}
                onClick={() => scegli(() => onMese(annoVista, m))}>{nomeMese(annoVista, m, "short")}</Button>;
            })}
          </div>
          <div className="flex flex-col gap-1 border-t pt-2">
            <Button type="button" size="sm" variant="ghost" className="h-8 justify-start text-xs" onClick={() => scegli(() => onAnno(String(annoVista)))}>{t("Tutto il {anno}", { anno: String(annoVista) })}</Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 justify-start text-xs" onClick={() => scegli(() => onAnno("all"))}>{t("Tutti gli anni")}</Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 justify-start text-xs" onClick={() => scegli(onProssimi30)}>{t("Prossimi 30 gg")}</Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 justify-start text-xs" onClick={() => scegli(onPersonalizzato)}>{t("Personalizzato")}</Button>
          </div>
        </PopoverContent>
      </Popover>
      <Button type="button" variant="outline" size="icon" className="size-8 shrink-0 max-lg:size-10" disabled={!scorrevole} onClick={() => passo(1)}
        aria-label={mese ? t("Mese dopo") : t("Anno dopo")}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  );
}
