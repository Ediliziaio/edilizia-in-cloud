/**
 * Pezzi della Programmazione dentro il Calendario (26/11/2026):
 *  - SegnoProgrammato: il segno nella casella del giorno (mese);
 *  - ProgrammaDelGiorno: la sezione nel dettaglio del giorno (tutte le viste);
 *  - StrisciaProgrammazione: la riga sopra il Calendario sul giorno scelto.
 * I dati arrivano dal contesto che il Calendario riempie con un solo
 * programmazione_riepilogo per il periodo visibile.
 */
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowRight, CalendarRange, ClipboardList, Crown, Truck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { linkProgrammazione, useConProgrammazione, useProgrammaDelGiorno, type RiepilogoGiorno } from "@/hooks/useProgrammazioneCalendario";

function statoTesto(p: RiepilogoGiorno): { testo: string; tono: string } {
  if (p.stato === "pubblicata" && p.modificata_dopo) return { testo: "Pubblicata, poi cambiata", tono: "bg-amber-50 text-amber-800 ring-amber-200" };
  if (p.stato === "pubblicata") return { testo: "Pubblicata", tono: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
  return { testo: "In bozza", tono: "bg-slate-100 text-slate-700 ring-slate-200" };
}

const orario = (i: RiepilogoGiorno["interventi"][number]) =>
  i.inizio ? `${i.inizio}${i.fine ? `–${i.fine}` : ""}` : i.momento === "prima" ? "Prima" : i.momento === "dopo" ? "Dopo" : "In giornata";

/** Il segno nella casella del mese: quanti interventi e se è pubblicato. */
export function SegnoProgrammato({ giorno }: { giorno: Date }) {
  const p = useProgrammaDelGiorno(giorno);
  if (!p || p.interventi.length === 0) return null;
  const pubblicata = p.stato === "pubblicata" && !p.modificata_dopo;
  const persone = new Set(p.interventi.flatMap((i) => i.persone)).size;
  return (
    <span title={`Programmazione: ${statoTesto(p).testo.toLowerCase()} · ${p.interventi.length} interventi · ${persone} persone`}
      className={cn("ml-auto inline-flex items-center gap-0.5 rounded px-1 text-[9px] font-semibold tabular-nums ring-1",
        pubblicata ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200")}>
      <ClipboardList className="h-2.5 w-2.5" aria-hidden="true" />{persone}
    </span>
  );
}

/** Nel dettaglio del giorno: chi va dove, a che ora, con cosa. */
export function ProgrammaDelGiorno({ giorno, onNaviga }: { giorno: Date; onNaviga?: () => void }) {
  const p = useProgrammaDelGiorno(giorno);
  const attiva = useConProgrammazione();
  const chiave = format(giorno, "yyyy-MM-dd");
  if (!attiva) return null;
  if (!p || p.interventi.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />Giornata non ancora programmata</span>
        <Link to={linkProgrammazione(chiave)} onClick={onNaviga} className="inline-flex items-center gap-1 font-semibold text-orange-700 hover:underline">
          Programma la giornata <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    );
  }
  const st = statoTesto(p);
  return (
    <section className="rounded-lg border border-slate-200 bg-white" aria-label="Programmazione del giorno">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <ClipboardList className="h-4 w-4 text-orange-500" aria-hidden="true" />Programmazione
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", st.tono)}>{st.testo}</span>
        </span>
        <Link to={linkProgrammazione(chiave)} onClick={onNaviga} className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:underline">
          Apri la programmazione <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <ul className="divide-y divide-slate-100">
        {p.interventi.map((i) => (
          <li key={i.id} className="flex gap-3 px-3 py-1.5 text-xs">
            <span className="w-20 shrink-0 tabular-nums text-slate-500">{orario(i)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-800">{i.titolo}</span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                {i.persone.length > 0 ? <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden="true" />{i.persone.join(", ")}</span> : !i.esterni.length && <span className="text-amber-700">nessuno</span>}
                {i.capo && <span className="inline-flex items-center gap-1"><Crown className="h-3 w-3 text-orange-500" aria-hidden="true" />{i.capo}</span>}
                {i.esterni.length > 0 && <span>{i.esterni.join(", ")}</span>}
                {i.mezzi.length > 0 && <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" aria-hidden="true" />{i.mezzi.join(", ")}</span>}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sopra il Calendario: lo stato della programmazione del giorno scelto. */
export function StrisciaProgrammazione({ giorno }: { giorno: Date }) {
  const p = useProgrammaDelGiorno(giorno);
  const chiave = format(giorno, "yyyy-MM-dd");
  const etichetta = giorno.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  if (!p || p.interventi.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200">
        <span className="inline-flex items-center gap-1.5"><CalendarRange className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />Programmazione di {etichetta}: non ancora preparata</span>
        <Link to={linkProgrammazione(chiave)} className="font-semibold text-orange-700 hover:underline">Programma la giornata →</Link>
      </div>
    );
  }
  const st = statoTesto(p);
  const persone = new Set(p.interventi.flatMap((i) => i.persone)).size;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200">
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <ClipboardList className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
        <span>Programmazione di {etichetta}:</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", st.tono)}>{st.testo}</span>
        <span className="tabular-nums">{p.interventi.length} interventi · {persone} persone</span>
      </span>
      <Link to={linkProgrammazione(chiave)} className="font-semibold text-orange-700 hover:underline">Apri la programmazione →</Link>
    </div>
  );
}
