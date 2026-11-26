/**
 * La settimana (Programmazione, 26/11/2026): una riga per chi esce, una
 * colonna per giorno lavorativo. Si vede chi è fisso dove, chi è scoperto e
 * quali giorni non sono ancora stati preparati. Un clic su una casella apre
 * quel giorno.
 */
import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { coloreIntervento } from "@/components/programmazione/aspetto";
import { useGiornatePreparate } from "@/hooks/useProgrammazioneGiornata";
import { agendaPersone, copiaGiornata, spostaGiorno, type Giornata, type PersonaGiorno, type SquadraGiorno } from "@/lib/programmazione/giornata";

function lunediDi(giorno: string): string {
  const d = new Date(`${giorno}T12:00:00Z`).getUTCDay();
  return spostaGiorno(giorno, d === 0 ? -6 : 1 - d);
}

export default function VistaSettimana({ companyId, giorno, nelDatabase, persone, squadraDellaPersona, onApriGiorno, onSalvaGiorni }: {
  /** Scrive altri giorni (come «Ripeti nei prossimi giorni»). */
  onSalvaGiorni: (g: Giornata[]) => Promise<void>;
  companyId: string | null;
  giorno: string;
  nelDatabase: boolean;
  persone: PersonaGiorno[];
  squadraDellaPersona: Map<string, SquadraGiorno>;
  onApriGiorno: (giorno: string) => void;
}) {
  const lunedi = lunediDi(giorno);
  const giorni = [0, 1, 2, 3, 4].map((n) => spostaGiorno(lunedi, n));
  const settimana = useGiornatePreparate(companyId, giorni, nelDatabase);
  const agende = settimana.map((s) => (s.giornata ? agendaPersone(s.giornata) : null));
  const nomeSquadra = (id: string) => squadraDellaPersona.get(id)?.nome ?? "\uffff";
  const [conferma, setConferma] = useState(false);
  const preparati = settimana.filter((s): s is typeof s & { giornata: Giornata } => !!s.giornata && s.giornata.interventi.length > 0);
  const copiaSullaProssima = () => {
    // Chi è in ferie la settimana dopo lo si vede aprendo i giorni: lì la proposta lo segnala.
    const copie = preparati.map((s) => ({ ...copiaGiornata(s.giornata, spostaGiorno(s.giorno, 7), new Set()), parziale: s.giornata.parziale }));
    onSalvaGiorni(copie).then(
      () => { toast.success(`Settimana copiata: ${copie.length} giorni`, { action: { label: "Vai alla prossima", onClick: () => onApriGiorno(spostaGiorno(lunedi, 7)) } }); setConferma(false); },
      (e: Error) => toast.error("Copia non riuscita", { description: e.message }),
    );
  };
  const righe = persone
    .filter((p) => p.ruolo !== "altro" || agende.some((a) => a?.has(p.id)))
    .sort((a, b) => nomeSquadra(a.id).localeCompare(nomeSquadra(b.id), "it") || `${a.nome} ${a.cognome}`.localeCompare(`${b.nome} ${b.cognome}`, "it"));

  return (
    <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
      {conferma ? (
        <>
          <span className="text-amber-800">Sostituisce i giorni già preparati della settimana dopo.</span>
          <button type="button" onClick={copiaSullaProssima} className="rounded-md bg-orange-500 px-2.5 py-1 font-semibold text-white hover:bg-orange-600">Copia {preparati.length} giorni</button>
          <button type="button" onClick={() => setConferma(false)} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">Annulla</button>
        </>
      ) : (
        <button type="button" disabled={preparati.length === 0} onClick={() => setConferma(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          title={preparati.length === 0 ? "Nessun giorno preparato in questa settimana" : undefined}>
          <Copy className="h-3.5 w-3.5" /> Copia questa settimana sulla prossima
        </button>
      )}
    </div>
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid min-w-[50rem] grid-cols-[12rem_repeat(5,minmax(0,1fr))]">
        <div className="border-b border-slate-100 bg-slate-50/60 px-3 py-1.5 text-[10px] font-semibold text-slate-500">Persona</div>
        {settimana.map((s) => {
          const etichetta = new Date(`${s.giorno}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
          return (
            <button key={s.giorno} type="button" onClick={() => onApriGiorno(s.giorno)}
              className={cn("border-b border-l border-slate-100 px-2 py-1.5 text-left text-[10px] hover:bg-orange-50", s.giorno === giorno ? "bg-orange-50" : "bg-slate-50/60")}>
              <span className="block font-semibold capitalize text-slate-700">{etichetta}</span>
              <span className={cn("block", s.giornata && !s.giornata.parziale ? "text-emerald-700" : "text-slate-400")}>
                {s.caricamento ? "…" : s.giornata ? (s.giornata.parziale ? "solo i fissi" : `${s.giornata.interventi.length} interventi`) : "da preparare"}
              </span>
            </button>
          );
        })}

        {righe.map((p, k) => (
          <div key={p.id} className="contents">
            {(k === 0 || squadraDellaPersona.get(righe[k - 1].id)?.id !== squadraDellaPersona.get(p.id)?.id) && (
              <div className="col-span-6 flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/50 px-3 py-1 text-[10px] font-semibold text-slate-500">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: squadraDellaPersona.get(p.id)?.colore || "#CBD5E1" }} aria-hidden="true" />
                {squadraDellaPersona.get(p.id)?.nome ?? "Senza squadra"}
              </div>
            )}
            <div className="flex min-w-0 items-center gap-2 border-b border-slate-100 px-3 py-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white" style={{ backgroundColor: p.colore || "#64748B" }} aria-hidden="true">
                {`${p.nome?.[0] ?? ""}${p.cognome?.[0] ?? ""}`.toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-medium text-slate-800">{p.nome} {p.cognome}</span>
                <span className="block truncate text-[9px] text-slate-400">{squadraDellaPersona.get(p.id)?.nome ?? p.mansione ?? ""}</span>
              </span>
            </div>
            {settimana.map((s, k) => {
              const suoi = agende[k]?.get(p.id) ?? [];
              return (
                <button key={s.giorno} type="button" onClick={() => onApriGiorno(s.giorno)}
                  className={cn("flex min-h-[2.25rem] flex-col gap-0.5 border-b border-l border-slate-100 px-1 py-1 text-left hover:bg-slate-50", s.giorno === giorno && "bg-orange-50/40")}>
                  {suoi.slice(0, 3).map((i) => (
                    <span key={i.id} className="truncate rounded border-l-2 bg-slate-50 px-1 text-[10px] text-slate-700" style={{ borderLeftColor: coloreIntervento(i) }}>
                      {i.inizio ? <span className="tabular-nums text-slate-400">{i.inizio} </span> : null}{i.titolo}
                    </span>
                  ))}
                  {suoi.length > 3 && <span className="text-[9px] text-slate-400">+{suoi.length - 3}</span>}
                  {suoi.length === 0 && s.giornata && !s.giornata.parziale && <span className="text-[9px] text-emerald-600">libero</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400">
        «Da preparare»: il giorno si costruisce da solo dalle squadre e dal calendario quando lo apri. «Solo i fissi»: ci sono gli interventi fissati da un altro giorno.
      </p>
    </div>
    </div>
  );
}
