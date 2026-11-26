/**
 * Riepiloghi a comparsa della Programmazione (26/11/2026): un clic sul nome
 * della commessa o su una lavorazione e si vede cosa c'è da fare, senza
 * lasciare la giornata. Si leggono solo all'apertura.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, ExternalLink, MapPin, Phone, StickyNote } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { giornoDelCantiere, testoGiornoCantiere } from "@/lib/programmazione/giornata";
import type { FaseGiorno } from "@/hooks/useProgrammazioneGiornata";

const STATO_FASE: Record<string, { testo: string; tono: string }> = {
  da_iniziare: { testo: "Da iniziare", tono: "bg-slate-100 text-slate-600" },
  in_corso: { testo: "In corso", tono: "bg-sky-50 text-sky-700" },
  completata: { testo: "Completata", tono: "bg-emerald-50 text-emerald-700" },
  sospesa: { testo: "Sospesa", tono: "bg-amber-50 text-amber-700" },
};

function statoFase(s: string) {
  return STATO_FASE[s] ?? { testo: s.replace(/_/g, " "), tono: "bg-slate-100 text-slate-600" };
}

function data(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, g] = d.slice(0, 10).split("-");
  return `${g}/${m}/${y.slice(2)}`;
}

function Barra({ valore }: { valore: number }) {
  const v = Math.max(0, Math.min(100, Math.round(valore)));
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${v}%` }} /></span>
      <span className="text-[10px] tabular-nums text-slate-500">{v}%</span>
    </span>
  );
}

/** Le voci della lavorazione (descrizione, quantità): gli importi non servono qui. */
function useVociFase(faseId: string, aperto: boolean) {
  return useQuery({
    queryKey: ["programmazione", "voci-fase", faseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_work_phase_voci")
        .select("id, descrizione, quantita, unita, position")
        .eq("phase_id", faseId)
        .order("position")
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
    enabled: aperto,
    staleTime: 5 * 60_000,
  });
}

export function RiepilogoFase({ fase, giorno, scelta, onScegli, children }: {
  fase: FaseGiorno;
  giorno: string;
  scelta: boolean;
  onScegli: (faseId: string | null) => void;
  children: ReactNode;
}) {
  const [aperto, setAperto] = useState(false);
  const voci = useVociFase(fase.id, aperto);
  const st = statoFase(fase.stato);
  const g = giornoDelCantiere(giorno, fase.dal, fase.al);
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-2 border-b border-slate-100 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-tight text-slate-900">{fase.nome}</p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", st.tono)}>{st.testo}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" aria-hidden="true" />{data(fase.dal)} → {data(fase.al)}</span>
            {g && <span className={cn(g.ritardo > 0 && fase.stato !== "completata" && "font-medium text-rose-600")}>{testoGiornoCantiere(g)}</span>}
            <Barra valore={fase.percentuale} />
          </div>
          {fase.note && <p className="flex gap-1 text-[11px] text-slate-600"><StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />{fase.note}</p>}
        </div>
        <div className="max-h-56 overflow-y-auto p-3">
          <p className="mb-1 text-[10px] font-semibold text-slate-500">Da fare</p>
          {voci.isLoading ? (
            <p className="text-[11px] text-slate-400">Carico le voci…</p>
          ) : (voci.data ?? []).length === 0 ? (
            <p className="text-[11px] text-slate-400">Nessuna voce di computo su questa lavorazione.</p>
          ) : (
            <ul className="space-y-1">
              {(voci.data ?? []).map((v) => (
                <li key={v.id} className="flex items-baseline gap-2 text-[11px]">
                  <span className="min-w-0 flex-1 text-slate-700">{v.descrizione}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">{Number(v.quantita).toLocaleString("it-IT", { maximumFractionDigits: 2 })} {v.unita ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-100 p-2">
          <button type="button" onClick={() => { onScegli(scelta ? null : fase.id); setAperto(false); }}
            className={cn("flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium",
              scelta ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-orange-500 text-white hover:bg-orange-600")}>
            {scelta ? "Lavorano su tutto il cantiere" : <><Check className="h-3.5 w-3.5" /> Oggi lavorano su questa</>}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type DettaglioCommessa = {
  id: string;
  order_code: string | null;
  client_name: string | null;
  client_company: string | null;
  client_phone: string | null;
  work_address: string | null;
  indirizzo_lavori: string | null;
  work_description: string | null;
  description: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  percentuale_avanzamento: number | null;
};

export function RiepilogoCommessa({ orderId, giorno, fasi, faseScelta, onScegliFase, children }: {
  orderId: string;
  giorno: string;
  fasi: FaseGiorno[];
  faseScelta: string | null;
  onScegliFase: (faseId: string | null) => void;
  children: ReactNode;
}) {
  const [aperto, setAperto] = useState(false);
  const q = useQuery({
    queryKey: ["programmazione", "commessa", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, client_name, client_company, client_phone, work_address, indirizzo_lavori, work_description, description, work_start_date, work_end_date, percentuale_avanzamento")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data as DettaglioCommessa | null;
    },
    enabled: aperto,
    staleTime: 60_000,
  });
  const c = q.data;
  const indirizzo = c?.work_address || c?.indirizzo_lavori;
  const g = c ? giornoDelCantiere(giorno, c.work_start_date, c.work_end_date) : null;
  const daFare = fasi.filter((f) => f.stato !== "completata");

  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0" onClick={(e) => e.stopPropagation()}>
        {!c ? (
          <p className="p-4 text-xs text-slate-400">{q.isLoading ? "Carico la commessa…" : "Commessa non trovata."}</p>
        ) : (
          <>
            <div className="space-y-1.5 border-b border-slate-100 p-3">
              <p className="text-[10px] font-medium text-slate-400">{c.order_code}</p>
              <p className="text-sm font-semibold leading-tight text-slate-900">{c.client_company || c.client_name || "Commessa"}</p>
              {(c.work_description || c.description) && <p className="line-clamp-3 text-[11px] text-slate-600">{c.work_description || c.description}</p>}
              <div className="space-y-1 pt-1 text-[11px] text-slate-600">
                {indirizzo ? (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzo)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-slate-900">
                    <MapPin className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />{indirizzo}
                  </a>
                ) : <p className="flex items-center gap-1.5 italic text-amber-700"><MapPin className="h-3 w-3" aria-hidden="true" />Indirizzo del cantiere da completare</p>}
                {c.client_phone && <a href={`tel:${c.client_phone}`} className="flex items-center gap-1.5 hover:text-slate-900"><Phone className="h-3 w-3 text-slate-400" aria-hidden="true" />{c.client_phone}</a>}
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3 w-3 text-slate-400" aria-hidden="true" />{data(c.work_start_date)} → {data(c.work_end_date)}</span>
                  {g && <span className={cn("text-slate-500", g.ritardo > 0 && "font-medium text-rose-600")}>{testoGiornoCantiere(g)}</span>}
                  <Barra valore={c.percentuale_avanzamento ?? 0} />
                </p>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-3">
              <p className="mb-1 text-[10px] font-semibold text-slate-500">Lavorazioni da fare · {daFare.length}</p>
              {daFare.length === 0 ? (
                <p className="text-[11px] text-slate-400">Nessuna lavorazione aperta.</p>
              ) : (
                <ul className="space-y-0.5">
                  {daFare.map((f) => {
                    const st = statoFase(f.stato);
                    return (
                      <li key={f.id}>
                        <button type="button" onClick={() => onScegliFase(faseScelta === f.id ? null : f.id)}
                          className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] hover:bg-slate-50", faseScelta === f.id && "bg-orange-50 ring-1 ring-orange-200")}>
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", f.attivaOggi ? "bg-orange-500" : "bg-slate-300")} title={f.attivaOggi ? "In calendario oggi" : undefined} />
                          <span className="min-w-0 flex-1 truncate text-slate-800">{f.nome}</span>
                          <span className={cn("shrink-0 rounded-full px-1.5 text-[9px]", st.tono)}>{st.testo}</span>
                          <span className="w-8 shrink-0 text-right tabular-nums text-slate-400">{Math.round(f.percentuale)}%</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-1.5 text-[10px] text-slate-400">Tocca una lavorazione per dire che oggi si lavora lì. Il pallino arancio: è in calendario oggi.</p>
            </div>
            <div className="border-t border-slate-100 p-2">
              <a href={`/azienda/ordini/${c.id}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Apri la commessa <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
