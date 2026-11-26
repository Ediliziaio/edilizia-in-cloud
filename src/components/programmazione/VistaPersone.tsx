/**
 * La giornata vista per persona (Programmazione, 26/11/2026): una riga per chi
 * esce, gli interventi sulla scala delle ore. È la vista del geometra con tre
 * cantieri e del manutentore con cinque uscite: si vede subito chi è pieno,
 * chi è libero e dove gli orari si accavallano.
 */
import { MapPin, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanyBase } from "@/hooks/useCompanyBase";
import { useStradeGiri } from "@/hooks/useStradeGiri";
import { coloreIntervento, TONO_SERA } from "@/components/programmazione/aspetto";
import {
  agendaPersone, esitoSera, giro, puntiDelGiro, siSovrappongono, viaggiDelGiro, type Giornata, type Intervento, type PersonaGiorno, type Punto,
  type SquadraGiorno,
} from "@/lib/programmazione/giornata";

const DALLE = 6;
const ALLE = 20;
const ORE = Array.from({ length: ALLE - DALLE + 1 }, (_, k) => DALLE + k);

const TOT = (ALLE - DALLE) * 60;
const minutiDi = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
/** Da minuti del giorno a percentuale della scala. */
const pct = (min: number) => ((Math.min(Math.max(min, DALLE * 60), ALLE * 60) - DALLE * 60) / TOT) * 100;
/** Il comune dell'indirizzo («Via Roma 19, Melegnano» → «Melegnano»). */
const comune = (i: Intervento) => i.indirizzo?.split(",").at(-1)?.trim() || null;

function posizione(i: Intervento): { left: number; width: number } | null {
  if (!i.inizio) return null;
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const da = Math.max(m(i.inizio), DALLE * 60);
  const a = Math.min(i.fine ? m(i.fine) : m(i.inizio) + 60, ALLE * 60);
  const tot = (ALLE - DALLE) * 60;
  return { left: ((da - DALLE * 60) / tot) * 100, width: Math.max(((a - da) / tot) * 100, 2.5) };
}

export default function VistaPersone({ companyId, giornata, persone, squadraDellaPersona, puntoDi, onApri }: {
  companyId: string | null;
  giornata: Giornata;
  persone: PersonaGiorno[];
  squadraDellaPersona: Map<string, SquadraGiorno>;
  puntoDi: (i: Intervento) => Punto | null;
  onApri: (interventoId: string) => void;
}) {
  const agenda = agendaPersone(giornata);
  const conPunto = (lista: Intervento[]) => lista.map((i) => ({ ...i, punto: puntoDi(i) }));
  const impegnate = persone.filter((p) => agenda.has(p.id));
  const libere = persone.filter((p) => !agenda.has(p.id) && !p.assenza && p.ruolo !== "altro");
  // Prima chi ha più uscite: è lì che si sbaglia.
  // Raggruppati per squadra (senza squadra in fondo); dentro, prima chi ha più uscite.
  const nomeSquadra = (p: PersonaGiorno) => squadraDellaPersona.get(p.id)?.nome ?? "\uffff";
  impegnate.sort((a, b) => nomeSquadra(a).localeCompare(nomeSquadra(b), "it") || (agenda.get(b.id)!.length - agenda.get(a.id)!.length) || `${a.nome}`.localeCompare(`${b.nome}`, "it"));

  // Gli stessi conti della Mappa: dalla sede e ritorno, con la strada vera se la
  // mappa l'ha già presa (qui si legge soltanto: questa vista non chiama HERE).
  const sede = useCompanyBase();
  const giriPersona = impegnate.map((p) => {
    const tappe = giro(conPunto(agenda.get(p.id)!));
    return { tappe, punti: puntiDelGiro(tappe, sede) };
  });
  const strade = useStradeGiri(companyId, giriPersona.map((g) => g.punti), { chiedi: false });

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[56rem]">
        <div className="grid grid-cols-[13rem_9rem_minmax(0,1fr)] border-b border-slate-100 bg-slate-50/60 text-[10px] font-semibold text-slate-500">
          <div className="px-3 py-1.5">Persona</div>
          <div className="px-2 py-1.5">In giornata</div>
          <div className="relative h-7">
            {ORE.map((h) => (
              <span key={h} className="absolute top-1.5 -translate-x-1/2 tabular-nums" style={{ left: `${((h - DALLE) / (ALLE - DALLE)) * 100}%` }}>{h}</span>
            ))}
          </div>
        </div>

        {impegnate.length === 0 && <p className="px-3 py-8 text-center text-xs text-slate-400">Nessuno ha ancora un intervento in questa giornata.</p>}

        {impegnate.map((p, k) => {
          const viaggi = viaggiDelGiro(giriPersona[k].tappe, sede, strade[k]?.data?.tratte);
          const sqQui = squadraDellaPersona.get(p.id);
          const nuovaSquadra = k === 0 || squadraDellaPersona.get(impegnate[k - 1].id)?.id !== sqQui?.id;
          const testata = nuovaSquadra ? (
            <div key={`t-${sqQui?.id ?? "nessuna"}`} className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/50 px-3 py-1 text-[10px] font-semibold text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: sqQui?.colore || "#CBD5E1" }} aria-hidden="true" />
              {sqQui?.nome ?? "Senza squadra"}
            </div>
          ) : null;
          const suoi = agenda.get(p.id)!;
          const km = viaggi.km;
          const senzaOra = suoi.filter((i) => !i.inizio);
          const conOra = suoi.filter((i) => i.inizio);
          const sq = squadraDellaPersona.get(p.id);
          return [testata, (
            <div key={p.id} className="grid grid-cols-[13rem_9rem_minmax(0,1fr)] items-center border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
              <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: p.colore || "#64748B" }} aria-hidden="true">
                  {`${p.nome?.[0] ?? ""}${p.cognome?.[0] ?? ""}`.toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-xs font-medium", p.assenza ? "text-rose-700" : "text-slate-800")}>{p.nome} {p.cognome}</span>
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="truncate">{p.assenza ?? sq?.nome ?? p.mansione ?? ""}</span>
                    <span className="shrink-0">{suoi.length} {suoi.length === 1 ? "uscita" : "uscite"}</span>
                    {km > 0 && <span className="inline-flex shrink-0 items-center gap-0.5" title={viaggi.stradale ? "Dalla sede e ritorno, sulla strada (senza traffico)" : "Dalla sede e ritorno, stima in linea d'aria × 1,3"}><Route className="h-2.5 w-2.5" aria-hidden="true" />{viaggi.stradale ? "" : "~"}{km.toLocaleString("it-IT")} km</span>}
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1 px-2 py-1.5">
                {senzaOra.map((i) => (
                  <Blocco key={i.id} i={i} p={p} onApri={onApri} className="max-w-full" />
                ))}
              </div>
              <div className="relative h-9">
                {ORE.map((h) => <span key={h} className="absolute inset-y-0 w-px bg-slate-100" style={{ left: `${((h - DALLE) / (ALLE - DALLE)) * 100}%` }} aria-hidden="true" />)}
                {/* Il viaggio: una barra prima di ogni tappa con orario, rossa se non ci si arriva. */}
                {viaggi.tappe.map((t) => {
                  if (!t.intervento.inizio || !t.minuti) return null;
                  const arrivo = minutiDi(t.intervento.inizio);
                  const da = pct(arrivo - t.minuti), a = pct(arrivo);
                  if (a - da <= 0) return null;
                  return (
                    <span key={`v-${t.intervento.id}`} aria-hidden="true"
                      title={`${t.ritardo > 0 ? `Non ci arriva: mancano ${t.ritardo} min · ` : ""}${viaggi.stradale ? "" : "~"}${t.km?.toLocaleString("it-IT")} km, ${t.minuti} min di strada · parti alle ${t.partenza}`}
                      className={cn("absolute top-3.5 h-2 rounded-sm", t.ritardo > 0 ? "bg-rose-400" : "bg-[repeating-linear-gradient(135deg,#cbd5e1_0_3px,transparent_3px_6px)]")}
                      style={{ left: `${da}%`, width: `${a - da}%` }} />
                  );
                })}
                {viaggi.rientroMinuti && viaggi.rientroAlle ? (() => {
                  const fine = minutiDi(viaggi.rientroAlle), da = pct(fine - viaggi.rientroMinuti), a = pct(fine);
                  return a > da ? <span aria-hidden="true" title={`Rientro in sede alle ${viaggi.rientroAlle}`}
                    className="absolute top-3.5 h-2 rounded-sm bg-[repeating-linear-gradient(135deg,#cbd5e1_0_3px,transparent_3px_6px)]"
                    style={{ left: `${da}%`, width: `${a - da}%` }} /> : null;
                })() : null}
                {conOra.map((i) => {
                  const pos = posizione(i)!;
                  const accavallato = conOra.some((j) => j.id !== i.id && siSovrappongono(i, j));
                  return (
                    <Blocco key={i.id} i={i} p={p} onApri={onApri} accavallato={accavallato} stretto={pos.width < 9}
                      className="absolute top-1 h-7" style={{ left: `${pos.left}%`, width: `${pos.width}%` }} />
                  );
                })}
              </div>
            </div>
          )];
        })}

        {libere.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-emerald-50/40 px-3 py-2 text-[11px] text-slate-600">
            <span className="font-semibold text-emerald-700">Liberi · {libere.length}</span>
            {libere.map((p) => <span key={p.id} className="rounded-full bg-white px-2 py-0.5 ring-1 ring-emerald-200">{p.nome} {p.cognome}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Blocco({ i, p, onApri, accavallato, stretto, className, style }: {
  i: Intervento;
  /** Blocco corto: al posto del titolo troncato («S…») il comune. */
  stretto?: boolean;
  p: PersonaGiorno;
  onApri: (id: string) => void;
  accavallato?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const colore = coloreIntervento(i);
  const esito = esitoSera(i, p.consuntivo);
  return (
    <button type="button" onClick={() => onApri(i.id)} style={{ ...style, borderLeftColor: colore }}
      title={`${i.inizio ? `${i.inizio}${i.fine ? `–${i.fine}` : ""} · ` : ""}${i.titolo}${i.indirizzo ? ` · ${i.indirizzo}` : ""}${esito ? ` · ${TONO_SERA[esito].testo}` : ""}`}
      className={cn("flex min-w-0 items-center gap-1 overflow-hidden rounded-md border-l-[3px] bg-slate-50 px-1.5 py-0.5 text-left text-[10px] text-slate-700 ring-1 ring-slate-200 hover:bg-white hover:ring-slate-300",
        accavallato && "ring-2 ring-rose-400", className)}>
      {esito && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONO_SERA[esito].classe)} aria-label={TONO_SERA[esito].testo} />}
      {stretto ? (
        // L'ora si legge dalla posizione sulla scala: qui solo il comune.
        <span className="min-w-0 truncate font-medium leading-tight">{comune(i) ?? i.titolo}</span>
      ) : (
        <>
          <span className="truncate font-medium">{i.titolo}</span>
          {i.indirizzo && <MapPin className="h-2.5 w-2.5 shrink-0 text-slate-400" aria-hidden="true" />}
        </>
      )}
    </button>
  );
}
