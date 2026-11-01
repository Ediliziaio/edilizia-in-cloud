/**
 * Riquadro «Effetto sul prezzo» nell'editor: i computi che hanno preso misure da questa pianta
 * e di quanto cambierebbero con le modifiche non ancora salvate.
 */
import { Link } from "react-router-dom";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { EffettoComputo } from "@/lib/planimetrie/effettoPrezzo";

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", signDisplay: "exceptZero" }).format(n);
const num = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(n);

export function EffettoPrezzo({ effetti, collegati }: { effetti: EffettoComputo[]; collegati: number }) {
  if (!collegati) return null;
  const totale = effetti.reduce((t, e) => t + e.totale, 0);
  const cambia = effetti.length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cambia ? (totale >= 0 ? "border-amber-400 text-amber-800" : "border-emerald-400 text-emerald-800") : ""}>
          <Calculator className="mr-1.5 h-4 w-4" />
          {cambia ? `Prezzo ${euro(totale)}` : "Computo invariato"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-h-[70vh] overflow-y-auto space-y-3">
        <div>
          <p className="text-sm font-semibold">Effetto sul prezzo</p>
          <p className="text-xs text-muted-foreground">
            {cambia
              ? "Con le modifiche di adesso i computi collegati cambierebbero così. Dopo il salvataggio, nel computo trovi «La pianta è cambiata» per aggiornarli (se è contrattuale, va in perizia di variante)."
              : `Le misure prese da questa pianta da ${collegati === 1 ? "una riga" : `${collegati} righe`} di computo non cambiano.`}
          </p>
        </div>
        {effetti.map((e) => (
          <div key={e.computo.id} className="space-y-1 rounded-md border p-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium">{e.computo.titolo}</span>
              <span className="shrink-0 font-semibold tabular-nums">{euro(e.totale)}</span>
            </div>
            {e.computo.stato === "contrattuale" && <p className="text-[11px] text-amber-700">Contrattuale: la differenza andrà in una perizia di variante.</p>}
            <ul className="space-y-0.5 text-xs">
              {e.righe.slice(0, 12).map((r) => (
                <li key={r.riga.id} className="flex justify-between gap-2">
                  <span className="truncate text-muted-foreground">{r.riga.voce.descrizione || r.riga.descrizione || "Voce"}</span>
                  <span className="shrink-0 tabular-nums">
                    {num(r.vecchia)} → {num(r.nuova)} {r.riga.voce.unita ?? ""}
                    {r.importo != null && <> · {euro(r.importo)}</>}
                    {r.mancanti.length > 0 && <span className="text-destructive"> · stanza tolta</span>}
                  </span>
                </li>
              ))}
              {e.righe.length > 12 && <li className="text-muted-foreground">…e altre {e.righe.length - 12}</li>}
            </ul>
            {e.senzaPrezzo > 0 && <p className="text-[11px] text-muted-foreground">{e.senzaPrezzo} {e.senzaPrezzo === 1 ? "voce senza prezzo non conta" : "voci senza prezzo non contano"} nel totale.</p>}
            {e.computo.orderId && (
              <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs">
                <Link to={`/azienda/ordini/${e.computo.orderId}`}>Apri la commessa</Link>
              </Button>
            )}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
