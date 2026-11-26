/**
 * «Oggi / Domani sei a…» nell'app di cantiere (26/11/2026): la giornata che
 * l'ufficio ha pubblicato in Commesse → Programmazione, solo per chi la legge.
 * Se la programmazione non è ancora attiva nel database, non mostra niente.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarClock, Check, ClipboardEdit, Crown, MapPin, Truck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { oggiRoma } from "@/hooks/useOperai";
import { spostaGiorno } from "@/lib/programmazione/giornata";
import { funzioneMancante, programmazioneAssente, segnaProgrammazioneAssente } from "@/lib/programmazione/disponibilita";

interface MiaUscita {
  id: string;
  giorno: string;
  orderId: string | null;
  titolo: string;
  codice: string | null;
  indirizzo: string | null;
  inizio: string | null;
  fine: string | null;
  capo: boolean;
  fase: string | null;
  note: string | null;
  compagni: string[];
  mezzi: string[];
  visto?: boolean;
  faseId?: string | null;
  momento?: "prima" | "dopo" | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useMioProgramma(giorno: string) {
  return useQuery({
    queryKey: ["campo", "mio-programma", giorno],
    queryFn: async (): Promise<MiaUscita[]> => {
      if (programmazioneAssente()) return [];
      const { data, error } = await db.rpc("campo_mio_programma", { p_giorno: giorno });
      // Funzione non ancora nel database: niente programma, niente errore (e per un po' non si richiede).
      if (error) { if (funzioneMancante(error)) segnaProgrammazioneAssente(); return []; }
      return (data ?? []) as MiaUscita[];
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function MioProgramma() {
  const oggi = oggiRoma();
  const domani = spostaGiorno(oggi, 1);
  const q1 = useMioProgramma(oggi);
  const q2 = useMioProgramma(domani);
  const qc = useQueryClient();
  const visto = useMutation({
    mutationFn: async (giorno: string) => {
      const { error } = await db.rpc("campo_programma_visto", { p_giorno: giorno });
      if (error) throw error;
    },
    onSuccess: (_d, giorno) => qc.invalidateQueries({ queryKey: ["campo", "mio-programma", giorno] }),
  });
  const giorni = [
    { etichetta: "Oggi", giorno: oggi, uscite: q1.data ?? [] },
    { etichetta: "Domani", giorno: domani, uscite: q2.data ?? [] },
  ].filter((g) => g.uscite.length > 0);
  if (giorni.length === 0) return null;

  return (
    <section aria-labelledby="mio-programma" className="rounded-2xl border border-orange-200 bg-orange-50/40 p-3 shadow-sm md:p-4">
      <h2 id="mio-programma" className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <CalendarClock className="h-4 w-4 text-orange-500" aria-hidden="true" /> Il tuo programma
      </h2>
      <div className="space-y-3">
        {giorni.map((g) => (
          <div key={g.etichetta}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-orange-700">{g.etichetta} sei a</p>
              {g.uscite.every((u) => u.visto) ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><Check className="h-3 w-3" aria-hidden="true" />Visto</span>
              ) : (
                <button type="button" disabled={visto.isPending} onClick={() => visto.mutate(g.giorno)}
                  className="rounded-full bg-orange-500 px-3 py-1 text-[11px] font-semibold text-white active:scale-95">
                  Ok, visto
                </button>
              )}
            </div>
            <ul className="space-y-1.5">
              {g.uscite.map((u) => {
                const corpo = (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{u.inizio ? `${u.inizio}${u.fine ? `–${u.fine}` : ""}` : u.momento === "prima" ? "Prima del cantiere" : u.momento === "dopo" ? "Dopo il cantiere" : "In giornata"}</span>
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{u.titolo}</span>
                      {u.capo && <Crown className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-label="Sei il capocantiere" />}
                    </div>
                    {u.indirizzo && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-600"><MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />{u.indirizzo}</p>}
                    {u.capo && <p className="mt-0.5 text-xs font-medium text-orange-700">Guidi tu la squadra qui</p>}
                    {u.fase && <p className="mt-0.5 text-xs text-slate-600">Lavorazione: <strong>{u.fase}</strong></p>}
                    {(u.compagni.length > 0 || u.mezzi.length > 0) && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                        {u.compagni.length > 0 && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden="true" />con {u.compagni.join(", ")}</span>}
                        {u.mezzi.length > 0 && <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" aria-hidden="true" />{u.mezzi.join(", ")}</span>}
                      </p>
                    )}
                    {u.note && <p className="mt-0.5 text-xs italic text-slate-500">{u.note}</p>}
                  </>
                );
                return (
                  <li key={u.id} className="rounded-xl bg-white p-2.5 ring-1 ring-orange-100">
                    {u.orderId ? <Link to={`/campo/lavoro/${u.orderId}`} className="block">{corpo}</Link> : corpo}
                    {u.orderId && g.giorno === oggi && (
                      <Link to={`/campo/lavoro/${u.orderId}/rapportino?data=${g.giorno}`}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-orange-700">
                        <ClipboardEdit className="h-3.5 w-3.5" aria-hidden="true" /> Fai il rapportino
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
