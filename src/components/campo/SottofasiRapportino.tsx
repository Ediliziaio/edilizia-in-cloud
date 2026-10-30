// src/components/campo/SottofasiRapportino.tsx
import { Check, Hammer } from "lucide-react";
import { cn } from "@/lib/utils";
import { avanzamentoDaSottofasi, intervalloSottofase, type Sottofase } from "@/lib/orders/sottofasi";
import { giornoLocale } from "@/lib/orders/cronoprogramma";
import { testoPiano } from "@/components/orders/SottofasiFase";

interface SottofasiRapportinoProps {
  nomeFase: string;
  sottofasi: Sottofase[];
  /** Id delle sottofasi finite in questo rapportino. */
  spunte: string[];
  onSpunta: (id: string, spuntata: boolean) => void;
  /** Id delle sottofasi su cui si è lavorato oggi senza finirle (31/10/2026). */
  lavorate?: string[];
  onLavorata?: (id: string, lavorata: boolean) => void;
}

/**
 * Nel rapportino del capocantiere: le sottofasi di una fase, al posto dello slider.
 * Per ognuna due scelte, a un tocco: «Ci ho lavorato» (dà l'inizio reale) e «Finita».
 */
export function SottofasiRapportino({ nomeFase, sottofasi, spunte, onSpunta, lavorate = [], onLavorata }: SottofasiRapportinoProps) {
  const fatta = (s: Sottofase) => s.fatta || spunte.includes(s.id);
  const anteprima = avanzamentoDaSottofasi(sottofasi.map((s) => ({ peso: s.peso, fatta: fatta(s) }))) ?? 0;
  const oggi = giornoLocale(new Date().toISOString());
  const inRitardo = (s: Sottofase) => { const i = intervalloSottofase(s); return !fatta(s) && !!i && i[1] < oggi; };
  const scegli = (s: Sottofase, cosa: "lavorata" | "finita") => {
    if (cosa === "finita") {
      const si = !spunte.includes(s.id);
      onSpunta(s.id, si);
      if (si && lavorate.includes(s.id)) onLavorata?.(s.id, false);
    } else {
      const si = !lavorate.includes(s.id);
      onLavorata?.(s.id, si);
      if (si && spunte.includes(s.id)) onSpunta(s.id, false);
    }
  };
  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{nomeFase}</p>
        <span className="shrink-0 font-bold text-primary">{anteprima}%</span>
      </div>
      <ul className="space-y-2" aria-label={`Sottofasi di ${nomeFase}`}>
        {sottofasi.map((s) => {
          const piano = testoPiano(s);
          return (
            <li key={s.id} className="rounded-lg bg-background px-2.5 py-2">
              <p className={cn("text-sm", fatta(s) && "text-muted-foreground line-through")}>{s.name}</p>
              {(piano || inRitardo(s)) && (
                <p className={cn("text-[11px] tabular-nums", inRitardo(s) ? "font-medium text-rose-700" : "text-muted-foreground")}>
                  {piano}{inRitardo(s) ? `${piano ? " · " : ""}in ritardo` : ""}
                </p>
              )}
              {s.fatta ? (
                <p className="mt-1 text-xs text-muted-foreground">Già fatta</p>
              ) : (
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {onLavorata && (
                    <button type="button" aria-pressed={lavorate.includes(s.id)} aria-label={`${s.name}: ci ho lavorato oggi`}
                      onClick={() => scegli(s, "lavorata")}
                      className={cn("flex min-h-11 items-center justify-center gap-1.5 rounded-lg border text-sm",
                        lavorate.includes(s.id) ? "border-sky-600 bg-sky-50 font-medium text-sky-900" : "border-border text-muted-foreground")}>
                      <Hammer className="h-4 w-4" aria-hidden="true" />Ci ho lavorato
                    </button>
                  )}
                  <button type="button" aria-pressed={spunte.includes(s.id)} aria-label={`${s.name}: finita`}
                    onClick={() => scegli(s, "finita")}
                    className={cn("flex min-h-11 items-center justify-center gap-1.5 rounded-lg border text-sm", !onLavorata && "col-span-2",
                      spunte.includes(s.id) ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-900" : "border-border text-muted-foreground")}>
                    <Check className="h-4 w-4" aria-hidden="true" />Finita
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Valgono quando il rapportino viene approvato, con la data di questo rapportino.</p>
    </div>
  );
}
