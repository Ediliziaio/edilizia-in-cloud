/**
 * Dove ha lavorato il mezzo (26/09/2026): negli ultimi 90 giorni, cantiere per
 * cantiere e persona per persona, con i giorni lavorativi e — per i mezzi che
 * guidano fino al cantiere — i km stimati dalla sede, andata e ritorno.
 * Viene dallo storico delle assegnazioni che il database scrive da solo.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Loader2, MapPin } from "lucide-react";
import { useMezzoAssegnazioni } from "@/hooks/useMezzi";
import { useDistanzeCantieri } from "@/hooks/useDistanzaCantieri";
import { TimelineUso, type RigaTimeline } from "@/components/mezzi/TimelineUso";
import { TIPI_CHE_VIAGGIANO, formatKm, giorniLavorativiSovrapposti, kmStimati } from "@/lib/manodopera/km";
import { aggiungiGiorni, giornoItaliano, oggiIso } from "@/types/mezzi";

const GIORNI = 90;
const COLORI = ["#EA580C", "#2563EB", "#16A34A", "#9333EA", "#DB2777", "#0891B2", "#CA8A04", "#475569"];

export function MezzoUsoCantieri({ mezzoId, tipo }: { mezzoId: string; tipo: string }) {
  const { data: periodi = [], isLoading } = useMezzoAssegnazioni(mezzoId);
  const oggi = oggiIso();
  const da = aggiungiGiorni(oggi, -(GIORNI - 1));
  const viaggia = TIPI_CHE_VIAGGIANO.has(tipo);

  const nelPeriodo = useMemo(
    () => periodi.filter((p) => !p.al || giornoItaliano(p.al) >= da),
    [periodi, da],
  );
  const orderIds = useMemo(() => [...new Set(nelPeriodo.map((p) => p.order_id).filter((x): x is string => !!x))], [nelPeriodo]);
  const { data: distanze } = useDistanzeCantieri(viaggia ? orderIds : []);

  const cantieri = useMemo(() => {
    const per = new Map<string, { etichetta: string; periodi: { dal: string; al: string | null }[]; giorni: number }>();
    for (const p of nelPeriodo) {
      if (!p.order_id) continue;
      const r = per.get(p.order_id) ?? { etichetta: p.commessa ?? "Commessa", periodi: [], giorni: 0 };
      r.periodi.push({ dal: giornoItaliano(p.dal), al: p.al ? giornoItaliano(p.al) : null });
      r.giorni += giorniLavorativiSovrapposti(p.dal, p.al, da, oggi);
      per.set(p.order_id, r);
    }
    return [...per.entries()].map(([id, r], i) => {
      const km = viaggia ? kmStimati(r.giorni, distanze?.[id]?.km) : null;
      return { id, ...r, km, colore: COLORI[i % COLORI.length] };
    });
  }, [nelPeriodo, da, oggi, viaggia, distanze]);

  const persone = useMemo(() => {
    const per = new Map<string, { periodi: { dal: string; al: string | null }[]; giorni: number }>();
    for (const p of nelPeriodo) {
      if (!p.persona) continue;
      const r = per.get(p.persona) ?? { periodi: [], giorni: 0 };
      r.periodi.push({ dal: giornoItaliano(p.dal), al: p.al ? giornoItaliano(p.al) : null });
      r.giorni += giorniLavorativiSovrapposti(p.dal, p.al, da, oggi);
      per.set(p.persona, r);
    }
    return [...per.entries()];
  }, [nelPeriodo, da, oggi]);

  if (isLoading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const giorniTot = cantieri.reduce((t, c) => t + c.giorni, 0);
  const kmTot = cantieri.reduce((t, c) => t + (c.km ?? 0), 0);

  const righeCantieri: RigaTimeline[] = cantieri.map((c) => ({
    id: c.id,
    etichetta: c.etichetta,
    colore: c.colore,
    periodi: c.periodi,
    dettaglio: [c.giorni === 1 ? "1 giorno" : `${c.giorni} giorni`, c.km != null ? formatKm(c.km) : null].filter(Boolean).join(" · "),
  }));
  const righePersone: RigaTimeline[] = persone.map(([nome, r]) => ({
    id: nome,
    etichetta: nome,
    colore: "#64748B",
    periodi: r.periodi,
    dettaglio: r.giorni === 1 ? "1 giorno" : `${r.giorni} giorni`,
  }));

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm text-slate-700">
          Negli ultimi {GIORNI} giorni:{" "}
          <span className="font-semibold text-slate-900">
            {cantieri.length === 1 ? "1 cantiere" : `${cantieri.length} cantieri`} · {giorniTot === 1 ? "1 giorno lavorativo" : `${giorniTot} giorni lavorativi`}
          </span>
          {viaggia && kmTot > 0 && <> · circa <span className="font-semibold text-slate-900">{formatKm(kmTot)}</span> fra andata e ritorno dalla sede</>}
          .
        </p>
        {viaggia && orderIds.length > 0 && kmTot === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">I km compaiono quando il cantiere ha l'indirizzo con la posizione e la sede è impostata.</p>
        )}
      </div>

      {cantieri.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Negli ultimi {GIORNI} giorni non è stato su nessun cantiere.
        </p>
      ) : (
        <section className="space-y-2" aria-label="Cantieri">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><MapPin className="h-4 w-4 text-orange-600" aria-hidden="true" />Cantieri</h3>
          <TimelineUso righe={righeCantieri} da={da} a={oggi} />
          <ul className="grid gap-1.5 pt-1 text-xs text-slate-600 sm:grid-cols-2">
            {cantieri.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: c.colore }} aria-hidden="true" />
                <Link to={`/azienda/ordini/${c.id}`} className="truncate hover:text-orange-700 hover:underline">{c.etichetta}</Link>
                {viaggia && distanze?.[c.id] && <span className="shrink-0 text-muted-foreground">· {formatKm(distanze[c.id].km)} dalla sede</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {righePersone.length > 0 && (
        <section className="space-y-2" aria-label="Chi l'ha avuto">
          <h3 className="text-sm font-semibold text-slate-900">Chi l'ha avuto</h3>
          <TimelineUso righe={righePersone} da={da} a={oggi} />
        </section>
      )}
    </div>
  );
}
