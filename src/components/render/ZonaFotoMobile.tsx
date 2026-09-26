import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

type Accento = "orange" | "cyan" | "blue" | "amber" | "emerald" | "violet" | "rose" | "red" | "sky" | "teal";

// Classi intere (non composte) perché Tailwind le trovi nel sorgente.
const ACCENTI: Record<Accento, { zona: string; icona: string }> = {
  orange: { zona: "border-orange-300 bg-orange-50/60 active:bg-orange-100/70", icona: "text-orange-500" },
  cyan: { zona: "border-cyan-300 bg-cyan-50/60 active:bg-cyan-100/70", icona: "text-cyan-600" },
  blue: { zona: "border-blue-300 bg-blue-50/60 active:bg-blue-100/70", icona: "text-blue-600" },
  amber: { zona: "border-amber-300 bg-amber-50/60 active:bg-amber-100/70", icona: "text-amber-600" },
  emerald: { zona: "border-emerald-300 bg-emerald-50/60 active:bg-emerald-100/70", icona: "text-emerald-600" },
  violet: { zona: "border-violet-300 bg-violet-50/60 active:bg-violet-100/70", icona: "text-violet-600" },
  rose: { zona: "border-rose-300 bg-rose-50/60 active:bg-rose-100/70", icona: "text-rose-600" },
  red: { zona: "border-red-300 bg-red-50/60 active:bg-red-100/70", icona: "text-red-600" },
  sky: { zona: "border-sky-300 bg-sky-50/60 active:bg-sky-100/70", icona: "text-sky-600" },
  teal: { zona: "border-teal-300 bg-teal-50/60 active:bg-teal-100/70", icona: "text-teal-600" },
};

interface ZonaFotoMobileProps {
  /** Apre la scelta del file (fotocamera o galleria: niente `capture` sull'input). */
  onScegli: () => void;
  /** Una riga su come fare la foto, es. «Ampia e luminosa, con sanitari e pavimento». */
  suggerimento?: string;
  accento?: Accento;
  className?: string;
}

/**
 * Telefono: il primo passo dei wizard render. Tutta l'area è il pulsante (niente
 * bottone finto dentro, niente elenco di consigli), alta quasi quanto la foto
 * che la sostituirà e fin sopra la barra in basso.
 *
 * Il tratteggio è forzato (`!border-dashed`): una regola globale in index.css
 * rimette `border-style: solid` su ogni <button>.
 */
export function ZonaFotoMobile({ onScegli, suggerimento, accento = "orange", className }: ZonaFotoMobileProps) {
  const a = ACCENTI[accento];
  return (
    <button
      type="button"
      onClick={onScegli}
      className={cn(
        "flex h-[clamp(300px,calc(100dvh-20rem),460px)] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 !border-dashed px-4 py-8 transition-colors",
        a.zona,
        className,
      )}
    >
      <span className={cn("flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm", a.icona)}>
        <Camera className="h-6 w-6" />
      </span>
      <span className="space-y-1 text-center">
        <span className="block text-sm font-semibold text-foreground">Scatta o scegli una foto</span>
        {suggerimento && <span className="block text-[11px] text-muted-foreground">{suggerimento}</span>}
      </span>
    </button>
  );
}
