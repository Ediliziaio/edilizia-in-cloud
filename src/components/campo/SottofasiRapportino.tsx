// src/components/campo/SottofasiRapportino.tsx
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { avanzamentoDaSottofasi, intervalloSottofase, type Sottofase } from "@/lib/orders/sottofasi";
import { giornoLocale } from "@/lib/orders/cronoprogramma";
import { testoPiano } from "@/components/orders/SottofasiFase";

interface SottofasiRapportinoProps {
  nomeFase: string;
  sottofasi: Sottofase[];
  /** Id delle sottofasi spuntate in questo rapportino. */
  spunte: string[];
  onSpunta: (id: string, spuntata: boolean) => void;
}

/** Nel rapportino del capocantiere: le sottofasi di una fase, al posto dello slider. */
export function SottofasiRapportino({ nomeFase, sottofasi, spunte, onSpunta }: SottofasiRapportinoProps) {
  const fatta = (s: Sottofase) => s.fatta || spunte.includes(s.id);
  const oggi = giornoLocale(new Date().toISOString());
  const inRitardo = (s: Sottofase) => { const i = intervalloSottofase(s); return !fatta(s) && !!i && i[1] < oggi; };
  const anteprima = avanzamentoDaSottofasi(sottofasi.map((s) => ({ peso: s.peso, fatta: fatta(s) }))) ?? 0;
  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{nomeFase}</p>
        <span className="shrink-0 font-bold text-primary">{anteprima}%</span>
      </div>
      <ul className="space-y-0.5" aria-label={`Sottofasi di ${nomeFase}`}>
        {sottofasi.map((s) => (
          <li key={s.id}>
            <label className="flex min-h-11 items-center gap-2.5 text-sm">
              <Checkbox
                checked={fatta(s)}
                disabled={s.fatta}
                onCheckedChange={(v) => onSpunta(s.id, v === true)}
                aria-label={`${s.name}: ${s.fatta ? "già fatta" : "da fare"}`}
              />
              <span className="min-w-0 flex-1">
                <span className={cn(fatta(s) && "text-muted-foreground line-through")}>{s.name}</span>
                {testoPiano(s) && <span className={cn("block text-[11px] tabular-nums", inRitardo(s) ? "font-medium text-rose-700" : "text-muted-foreground")}>
                  {testoPiano(s)}{inRitardo(s) ? " · in ritardo" : ""}
                </span>}
              </span>
              {s.fatta && <span className="shrink-0 text-[11px] text-muted-foreground">già fatta</span>}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Le sottofasi risultano fatte quando il rapportino viene approvato.</p>
    </div>
  );
}
