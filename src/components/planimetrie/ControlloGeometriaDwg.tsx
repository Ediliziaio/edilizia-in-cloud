import { Check, ScanLine, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { areaPoligono, distanza } from "../../../shared/planimetrie/geometria.ts";
import type { EsitoRiscontroDwg, RiscontroDwg } from "../../../shared/planimetrie/controlloDwg.ts";
import type { Locale } from "../../../shared/planimetrie/modello.ts";

export const NOMI_RISCONTRI_DWG = {
  portoni: "Battute dei portoni",
  chiusura: "Chiusura del contorno",
  sovrapposizione: "Tratti CAD sovrapposti",
};
const misura = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const superficie = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const etichettaStato = (r: RiscontroDwg) => r.stato === "confermata"
  ? (r.modifica ? "Applicata" : "Verificata") : r.stato === "ignorata" ? "Ignorata" : "Da rivedere";

export function ControlloGeometriaDwg({ riscontri, selezionato, locali, puoScrivere, inSalvataggio, errore, onScegli, onDecidi }: {
  riscontri: RiscontroDwg[];
  selezionato?: RiscontroDwg;
  locali: Locale[];
  puoScrivere: boolean;
  inSalvataggio: boolean;
  errore: string;
  onScegli: (id: string) => void;
  onDecidi: (r: RiscontroDwg, stato: EsitoRiscontroDwg) => void;
}) {
  const daRivedere = riscontri.filter(r => r.stato === "da_rivedere").length;
  const nomeLocale = (r: RiscontroDwg) => r.modifica && locali.find(l => l.id === r.modifica.localeId)?.nome;
  const lunghezza = (r: RiscontroDwg) => Math.max(...r.tratti.map(t => distanza(t.a, t.b)));
  const mqPrima = selezionato?.modifica ? areaPoligono(selezionato.modifica.prima) / 10000 : 0;
  const mqDopo = selezionato?.modifica ? areaPoligono(selezionato.modifica.dopo) / 10000 : 0;
  const fonti = [...new Map(selezionato?.tratti.flatMap(t => t.fonti).map(f => [f.handle, f]) ?? []).values()];
  return <section aria-label="Controllo geometria DWG" aria-busy={inSalvataggio} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
    <div className="border-b px-4 py-3.5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><ScanLine className="h-4 w-4 text-primary" aria-hidden="true"/>Controllo geometria DWG</h2>
      <p className="ml-6 mt-1 text-xs text-muted-foreground">{daRivedere ? `${daRivedere} da rivedere` : "Riscontri esaminati"}</p>
    </div>
    <ul className="max-h-64 divide-y overflow-y-auto">
      {riscontri.map(r => <li key={r.id}>
        <button type="button" onClick={() => onScegli(r.id)} aria-pressed={r.id === selezionato?.id} disabled={inSalvataggio}
          className={cn("flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            r.id === selezionato?.id && "bg-primary/[0.08]")}>
          <span className="min-w-0">
            <span className="block font-medium">{NOMI_RISCONTRI_DWG[r.tipo]}</span>
            <span className="block text-xs text-muted-foreground">
              {nomeLocale(r) ?? `${misura.format(lunghezza(r) / 100)} m`}
            </span>
          </span>
          <span className={cn("mt-0.5 shrink-0 text-xs", r.stato === "confermata" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
            {etichettaStato(r)}
          </span>
        </button>
      </li>)}
    </ul>
    {selezionato && <div className="space-y-3 border-t px-4 py-3.5">
      {selezionato.modifica ? <>
        <p className="text-xs leading-relaxed text-muted-foreground">{selezionato.tipo === "portoni"
          ? "La proposta include le rientranze fino alle battute disegnate sul DWG."
          : `I fili del muro sono distanti ${misura.format(lunghezza(selezionato))} cm. La chiusura proposta passa per i due estremi.`}</p>
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/35 p-2.5 text-xs">
          <div><div className="font-medium text-blue-800 dark:text-blue-300">Prima</div><strong className="mt-0.5 block text-base tabular-nums">{superficie.format(mqPrima)} m²</strong></div>
          <div><div className="font-medium text-emerald-800 dark:text-emerald-300">Dopo</div><strong className="mt-0.5 block text-base tabular-nums">{superficie.format(mqDopo)} m²</strong></div>
        </div>
      </> : <p className="text-xs leading-relaxed text-muted-foreground">
        Due tratti di muro coincidono per {misura.format(lunghezza(selezionato) / 100)} m. Confermare il riscontro registra la verifica sulla tavola.
      </p>}
      {fonti.length > 0 && <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Entità del DWG</summary>
        <ul className="mt-1.5 space-y-1">{fonti.map(f => <li key={f.handle}><code>{f.handle}</code> · {f.layer}</li>)}</ul>
      </details>}
      {errore && <p role="alert" className="text-xs font-medium text-destructive">{errore}</p>}
      {puoScrivere && (selezionato.stato === "da_rivedere"
        ? <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" className="gap-1.5" disabled={inSalvataggio} onClick={() => onDecidi(selezionato, "confermata")}>
            <Check className="h-3.5 w-3.5" aria-hidden="true"/>{selezionato.modifica ? "Applica al contorno" : "Conferma riscontro"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={inSalvataggio} onClick={() => onDecidi(selezionato, "ignorata")}>Ignora</Button>
        </div>
        : <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={inSalvataggio} onClick={() => onDecidi(selezionato, "da_rivedere")}>
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true"/>{selezionato.modifica && selezionato.stato === "confermata" ? "Ripristina contorno iniziale" : "Riapri riscontro"}
        </Button>)}
    </div>}
  </section>;
}
