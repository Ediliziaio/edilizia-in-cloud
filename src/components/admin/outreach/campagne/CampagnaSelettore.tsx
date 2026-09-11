/**
 * Selettore delle campagne cold, condiviso da Pipeline e Statistiche: una
 * scheda per campagna con quanto è avanti (contattati su iscritti) e come sta
 * andando (risposte). La scelta resta la stessa passando da una scheda
 * all'altra e alla riapertura della pagina.
 */
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CampagnaRiepilogo } from "./useCampagneOutreach";
import { percentuale, STATO_CAMPAGNA } from "./campagneFasi";

export function CampagnaSelettore({ campagne, scelta, onCambia, conTutte = false }: {
  campagne: CampagnaRiepilogo[];
  scelta: string | null;
  onCambia: (id: string | null) => void;
  conTutte?: boolean;
}) {
  const totIscritti = campagne.reduce((s, c) => s + c.iscritti, 0);
  const totContattati = campagne.reduce((s, c) => s + c.contattati, 0);
  const totRisposte = campagne.reduce((s, c) => s + c.risposte, 0);

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex gap-2.5" role="radiogroup" aria-label="Campagna">
        {conTutte && (
          <Scheda
            attiva={scelta === "tutte"}
            onClick={() => onCambia(null)}
            testa={<span className="inline-flex items-center gap-1.5"><Layers className="h-3 w-3" /> Panoramica</span>}
            titolo="Tutte le campagne"
            iscritti={totIscritti}
            contattati={totContattati}
            risposte={totRisposte}
          />
        )}
        {campagne.map((c) => {
          const stato = STATO_CAMPAGNA[c.stato] ?? STATO_CAMPAGNA.draft;
          return (
            <Scheda
              key={c.sequence_id}
              attiva={scelta === c.sequence_id}
              onClick={() => onCambia(c.sequence_id)}
              testa={
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", stato.punto)} aria-hidden />
                  <span className="shrink-0">{stato.etichetta}</span>
                  {c.brand && <span className="truncate text-muted-foreground/70">· {c.brand}</span>}
                </span>
              }
              titolo={c.nome}
              iscritti={c.iscritti}
              contattati={c.contattati}
              risposte={c.risposte}
            />
          );
        })}
      </div>
    </div>
  );
}

function Scheda({ attiva, onClick, testa, titolo, iscritti, contattati, risposte }: {
  attiva: boolean;
  onClick: () => void;
  testa: React.ReactNode;
  titolo: string;
  iscritti: number;
  contattati: number;
  risposte: number;
}) {
  const quota = iscritti > 0 ? Math.max(contattati > 0 ? 2 : 0, Math.round((contattati / iscritti) * 100)) : 0;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={attiva}
      onClick={onClick}
      className={cn(
        "flex w-[260px] shrink-0 flex-col gap-2 rounded-xl border bg-card p-3 text-left shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        attiva ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
      )}
    >
      <span className="text-[11px] font-medium text-muted-foreground">{testa}</span>
      <span className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-foreground" title={titolo}>{titolo}</span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-primary" style={{ width: `${quota}%` }} />
      </span>
      <span className="text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">{contattati.toLocaleString("it-IT")}</span> di {iscritti.toLocaleString("it-IT")} contattati
        {" · "}{percentuale(contattati, iscritti)}
        {" · "}<span className="font-semibold text-foreground">{risposte.toLocaleString("it-IT")}</span> {risposte === 1 ? "risposta" : "risposte"}
      </span>
    </button>
  );
}
