// src/components/campo/SottofasiRapportino.tsx
import { useMemo, useState } from "react";
import { Check, Hammer, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { avanzamentoDaSottofasi, intervalloSottofase, percentualeDaQuantita, type Sottofase } from "@/lib/orders/sottofasi";
import { giornoLocale } from "@/lib/orders/cronoprogramma";
import { testoPiano } from "@/components/orders/SottofasiFase";

export type DatoAvanzata = { quantita?: number; percentuale?: number };

interface SottofasiRapportinoProps {
  nomeFase: string;
  sottofasi: Sottofase[];
  /** Id delle sottofasi finite in questo rapportino. */
  spunte: string[];
  onSpunta: (id: string, spuntata: boolean) => void;
  /** Id delle sottofasi su cui si è lavorato oggi senza finirle (31/10/2026). */
  lavorate?: string[];
  onLavorata?: (id: string, lavorata: boolean) => void;
  /** Quantità e unità di ogni sottofase: se ci sono si dichiara quanto si è fatto oggi, altrimenti la percentuale. */
  quantitaDi?: ReadonlyMap<string, { quantita: number; unita: string | null }>;
  avanzate?: Readonly<Record<string, DatoAvanzata>>;
  onAvanzata?: (id: string, dato: DatoAvanzata | null) => void;
}

const PASSI = [25, 50, 75];
/** Oltre queste righe servono ricerca e filtro: su un cantiere grande una fase ne ha decine. */
const TANTE = 8;

/**
 * Nel rapportino del capocantiere: le sottofasi di una fase, al posto dello slider.
 * Per ognuna, a un tocco, «Ci ho lavorato» (dà l'inizio reale) e «Finita»; e se ci ha lavorato, quanto.
 */
export function SottofasiRapportino({ nomeFase, sottofasi, spunte, onSpunta, lavorate = [], onLavorata, quantitaDi, avanzate = {}, onAvanzata }: SottofasiRapportinoProps) {
  const [cerca, setCerca] = useState("");
  const [tutte, setTutte] = useState(false);
  const fatta = (s: Sottofase) => s.fatta || spunte.includes(s.id);
  // La percentuale che la sottofase avrà con quello che si sta dichiarando.
  const puntoDi = (s: Sottofase) => {
    const prima = Number(s.percentuale) || 0;
    const dato = avanzate[s.id];
    if (!dato) return prima;
    const q = quantitaDi?.get(s.id);
    if (dato.quantita && q) {
      const giaFatta = Number(s.quantita_fatta) || (q.quantita * prima) / 100;
      return Math.max(prima, percentualeDaQuantita(giaFatta + dato.quantita, q.quantita) ?? prima);
    }
    return Math.max(prima, dato.percentuale ?? 0);
  };
  const anteprima = avanzamentoDaSottofasi(sottofasi.map((s) => ({ peso: s.peso, fatta: fatta(s), percentuale: puntoDi(s) }))) ?? 0;
  const oggi = giornoLocale(new Date().toISOString());
  const inRitardo = (s: Sottofase) => { const i = intervalloSottofase(s); return !fatta(s) && !!i && i[1] < oggi; };
  const scegli = (s: Sottofase, cosa: "lavorata" | "finita") => {
    if (cosa === "finita") {
      const si = !spunte.includes(s.id);
      onSpunta(s.id, si);
      if (si) {
        if (lavorate.includes(s.id)) onLavorata?.(s.id, false);
        onAvanzata?.(s.id, null);
      }
    } else {
      const si = !lavorate.includes(s.id);
      onLavorata?.(s.id, si);
      if (si && spunte.includes(s.id)) onSpunta(s.id, false);
      if (!si) onAvanzata?.(s.id, null);
    }
  };
  const tante = sottofasi.length > TANTE;
  const daFare = sottofasi.filter((s) => !s.fatta).length;
  const viste = useMemo(() => {
    const q = cerca.trim().toLocaleLowerCase("it-IT");
    return sottofasi.filter((s) => {
      if (q) return s.name.toLocaleLowerCase("it-IT").includes(q);
      // Con tante righe partono solo quelle da fare, in ordine: quelle già toccate oggi non spariscono.
      return !tante || tutte || !s.fatta || spunte.includes(s.id);
    });
  }, [cerca, tante, tutte, sottofasi, spunte]);

  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{nomeFase}</p>
        <span className="shrink-0 font-bold text-primary">{anteprima}%</span>
      </div>
      {tante && (
        <div className="mb-2 space-y-1.5">
          <label className="relative block">
            <Search className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label={`Cerca nelle sottofasi di ${nomeFase}`} placeholder="Cerca una lavorazione…"
              className="h-10 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-sm" />
          </label>
          <button type="button" onClick={() => setTutte((v) => !v)} className="text-xs text-primary underline underline-offset-2">
            {tutte ? `Solo da fare (${daFare})` : `Mostra anche le fatte (${sottofasi.length - daFare})`}
          </button>
        </div>
      )}
      <ul className="space-y-2" aria-label={`Sottofasi di ${nomeFase}`}>
        {viste.map((s) => {
          const piano = testoPiano(s);
          const q = quantitaDi?.get(s.id);
          const dato = avanzate[s.id];
          const punto = puntoDi(s);
          const aperta = lavorate.includes(s.id) && !!onAvanzata;
          return (
            <li key={s.id} className="rounded-lg bg-background px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className={cn("min-w-0 text-sm", fatta(s) && "text-muted-foreground line-through")}>{s.name}</p>
                {!fatta(s) && punto > 0 && <span className="shrink-0 text-xs font-medium tabular-nums text-primary">{punto}%</span>}
              </div>
              {(piano || inRitardo(s)) && (
                <p className={cn("text-[11px] tabular-nums", inRitardo(s) ? "font-medium text-rose-700" : "text-muted-foreground")}>
                  {piano}{inRitardo(s) ? `${piano ? " · " : ""}in ritardo` : ""}
                </p>
              )}
              {s.fatta ? (
                <p className="mt-1 text-xs text-muted-foreground">Già fatta</p>
              ) : (
                <>
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
                  {aperta && (q ? (
                    <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="shrink-0">Fatti oggi</span>
                      <input type="number" inputMode="decimal" min={0} step="any" aria-label={`${s.name}: quantità fatta oggi`} value={dato?.quantita ?? ""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          onAvanzata!(s.id, e.target.value !== "" && Number.isFinite(n) && n > 0 ? { quantita: n } : null);
                        }}
                        className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-base text-foreground" />
                      <span className="shrink-0 tabular-nums">su {q.quantita.toLocaleString("it-IT", { maximumFractionDigits: 2 })}{q.unita ? ` ${q.unita}` : ""}</span>
                    </label>
                  ) : (
                    <div className="mt-2 flex items-center gap-1.5" role="group" aria-label={`${s.name}: a che punto è`}>
                      <span className="shrink-0 text-xs text-muted-foreground">Arrivati a</span>
                      {PASSI.map((p) => (
                        <button key={p} type="button" aria-pressed={dato?.percentuale === p} disabled={p <= (Number(s.percentuale) || 0)}
                          onClick={() => onAvanzata!(s.id, dato?.percentuale === p ? null : { percentuale: p })}
                          className={cn("min-h-11 flex-1 rounded-lg border text-sm tabular-nums disabled:opacity-40",
                            dato?.percentuale === p ? "border-sky-600 bg-sky-50 font-medium text-sky-900" : "border-border text-muted-foreground")}>{p}%</button>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </li>
          );
        })}
        {viste.length === 0 && <li className="px-1 py-2 text-xs text-muted-foreground">{cerca ? "Nessuna lavorazione con questo nome." : "Tutte fatte."}</li>}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Valgono quando il rapportino viene approvato, con la data di questo rapportino.</p>
    </div>
  );
}
