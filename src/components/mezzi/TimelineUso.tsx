/**
 * Dove e quando: una riga per mezzo (o per cantiere), una barra per periodo,
 * sull'asse dei giorni (26/09/2026, «avere anche un visuale»). Le date sono
 * giorni AAAA-MM-GG; un periodo aperto arriva fino ad «a».
 */
import { giorniTra } from "@/types/mezzi";
import { cn } from "@/lib/utils";

export interface RigaTimeline {
  id: string;
  etichetta: string;
  /** Colore della barra (es. quello della squadra o del cantiere). */
  colore?: string | null;
  periodi: { dal: string; al: string | null; nota?: string }[];
  /** A destra, es. «14 giorni · 1.352 km». */
  dettaglio?: string;
}

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export function TimelineUso({ righe, da, a, className }: { righe: RigaTimeline[]; da: string; a: string; className?: string }) {
  const totale = Math.max(1, giorniTra(da, a) + 1);
  const pos = (g: string) => Math.min(100, Math.max(0, (giorniTra(da, g) / totale) * 100));

  // Tacche all'inizio di ogni mese dentro l'intervallo.
  const tacche: { g: string; etichetta: string }[] = [];
  const [y0, m0] = da.split("-").map(Number);
  for (let y = y0, m = m0; ; m++) {
    if (m > 12) { m = 1; y++; }
    const g = `${y}-${String(m).padStart(2, "0")}-01`;
    if (g > a) break;
    if (g >= da) tacche.push({ g, etichetta: MESI[m - 1] });
    if (tacche.length > 24) break;
  }

  return (
    <div className={cn("space-y-1.5", className)} role="img" aria-label={righe.map((r) => `${r.etichetta}: ${r.dettaglio ?? ""}`).join("; ")}>
      <div className="relative ml-[9.5rem] h-4 text-[10px] text-slate-400 max-sm:ml-24">
        {tacche.map((t) => (
          <span key={t.g} className="absolute -translate-x-1/2" style={{ left: `${pos(t.g)}%` }}>{t.etichetta}</span>
        ))}
      </div>
      {righe.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <span className="w-36 shrink-0 truncate text-xs text-slate-700 max-sm:w-[5.5rem]" title={r.etichetta}>{r.etichetta}</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
            {tacche.map((t) => (
              <span key={t.g} className="absolute inset-y-0 w-px bg-white" style={{ left: `${pos(t.g)}%` }} aria-hidden="true" />
            ))}
            {r.periodi.map((p, i) => {
              const inizio = p.dal < da ? da : p.dal;
              const fine = !p.al || p.al > a ? a : p.al;
              if (fine < inizio) return null;
              const left = pos(inizio);
              const width = Math.max(0.8, ((giorniTra(inizio, fine) + 1) / totale) * 100);
              return (
                <span
                  key={i}
                  className="absolute inset-y-0.5 rounded-sm"
                  style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, backgroundColor: r.colore ?? "#F97316" }}
                  title={p.nota}
                />
              );
            })}
          </div>
          {r.dettaglio && <span className="w-28 shrink-0 text-right text-[11px] tabular-nums text-slate-500 max-sm:hidden">{r.dettaglio}</span>}
        </div>
      ))}
    </div>
  );
}
