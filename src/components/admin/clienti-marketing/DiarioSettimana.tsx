/**
 * Il diario della settimana.
 *
 * Il report dice cosa è successo, il diario dice cosa ho capito e cosa faccio.
 * Due righe per settimana: i trend notati e la cosa da fare. La settimana dopo
 * si scrive com'è andata, e quella riga diventa il pezzo di storia che serve al
 * punto mensile — e alla telefonata in cui bisogna dire al cliente che il
 * problema non sta dalla nostra parte.
 */
import { useState } from "react";
import { Check, Loader2, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { dataBreve } from "./formato";
import type { RigaDiario } from "./useSchedaCliente";

/** Il lunedì della settimana di una data, in ora locale. */
function lunedi(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

interface Props {
  righe: RigaDiario[];
  oggi: Date;
  salvataggio: boolean;
  onSalva: (v: { settimana: string; trend?: string | null; cosa_fare?: string | null; esito?: string | null }) => void;
}

/** Il modulo della settimana in corso, rimontato quando cambia la riga di partenza. */
function ModuloSettimana({
  settimana, trendIniziale, cosaFareIniziale, salvataggio, onSalva,
}: {
  settimana: string;
  trendIniziale: string;
  cosaFareIniziale: string;
  salvataggio: boolean;
  onSalva: Props["onSalva"];
}) {
  const [trend, setTrend] = useState(trendIniziale);
  const [cosaFare, setCosaFare] = useState(cosaFareIniziale);
  const cambiato = trend !== trendIniziale || cosaFare !== cosaFareIniziale;

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <label className="space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quali trend hai notato</span>
        <Textarea rows={3} value={trend} onChange={(e) => setTrend(e.target.value)} placeholder="Il CPL è salito da 9 a 14 € da giovedì, e i lead del fine settimana non li richiama nessuno." className="resize-y text-sm" />
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">La cosa da fare questa settimana</span>
        <Textarea rows={3} value={cosaFare} onChange={(e) => setCosaFare(e.target.value)} placeholder="Una cosa sola, con un nome e una scadenza." className="resize-y text-sm" />
      </label>
      <div className="md:col-span-2 flex items-center gap-2">
        <Button size="sm" disabled={!cambiato || salvataggio} onClick={() => onSalva({ settimana, trend, cosa_fare: cosaFare })} className="gap-1.5">
          {salvataggio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salva la settimana
        </Button>
        {!cambiato && (trendIniziale || cosaFareIniziale) && <span className="text-[11px] text-muted-foreground">già scritto</span>}
      </div>
    </div>
  );
}

export function DiarioSettimana({ righe, oggi, salvataggio, onSalva }: Props) {
  const settimana = lunedi(oggi);
  const corrente = righe.find((r) => r.settimana === settimana);
  const passate = righe.filter((r) => r.settimana !== settimana).slice(0, 6);

  return (
    <section className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <NotebookPen className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Il diario · settimana del {dataBreve(settimana, false, oggi)}
        </h3>
      </div>

      <ModuloSettimana
        key={`${settimana}-${corrente?.updated_at ?? "nuova"}`}
        settimana={settimana}
        trendIniziale={corrente?.trend ?? ""}
        cosaFareIniziale={corrente?.cosa_fare ?? ""}
        salvataggio={salvataggio}
        onSalva={onSalva}
      />

      {passate.length > 0 && (
        <ul className="mt-3 space-y-2 border-t pt-2">
          {passate.map((r) => (
            <li key={r.settimana} className="text-xs">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{dataBreve(r.settimana, false, oggi)}</span>
                {r.trend && <span className="text-muted-foreground">{r.trend}</span>}
              </div>
              {r.cosa_fare && (
                <div className={cn("mt-0.5 flex items-baseline gap-1.5", r.chiusa && "text-muted-foreground line-through")}>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">da fare</span>
                  <span>{r.cosa_fare}</span>
                </div>
              )}
              {r.esito ? (
                <div className="mt-0.5 text-[11px] text-muted-foreground">è andata così: {r.esito}</div>
              ) : (
                <button type="button" onClick={() => { const e = window.prompt(`Com'è andata la settimana del ${dataBreve(r.settimana, false, oggi)}?`); if (e != null && e.trim()) onSalva({ settimana: r.settimana, esito: e }); }}
                  className="mt-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                  scrivi com'è andata
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
