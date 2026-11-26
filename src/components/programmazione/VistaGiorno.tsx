/**
 * Il calendario del giorno (Programmazione, 26/11/2026): le ore in verticale,
 * gli interventi come blocchi. Si trascina un blocco per cambiare l'ora, si
 * tira il bordo in basso per allungarlo, si porta dentro un intervento «in
 * giornata» per dargli un orario. Le persone dall'elenco a sinistra si
 * trascinano (o si toccano) sui blocchi, come nella vista Cantieri: il
 * trascinamento è uno solo per tutta la pagina (ProgrammazioneGiornata).
 */
import { useState, type PointerEvent as PE } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { coloreIntervento } from "@/components/programmazione/aspetto";
import { agendaPersone, cambiaDurata, giro, ordina, puntiDelGiro, siSovrappongono, viaggiDelGiro, type Giornata, type Intervento, type PersonaGiorno, type Punto } from "@/lib/programmazione/giornata";
import { useCompanyBase } from "@/hooks/useCompanyBase";
import { useStradeGiri } from "@/hooks/useStradeGiri";
import { ALLE, DALLE, ID_GRIGLIA, PX_MIN, PX_ORA, minuti as min } from "@/lib/programmazione/calendarioGiorno";

/** Corsie: interventi che si accavallano vanno affiancati. */
function corsie(interventi: Intervento[]): Map<string, { corsia: number; di: number }> {
  const conOra = ordina(interventi.filter((i) => i.inizio));
  const fine = (i: Intervento) => (i.fine ? min(i.fine) : min(i.inizio!) + 60);
  const gruppi: Intervento[][] = [];
  for (const i of conOra) {
    const g = gruppi.find((gr) => gr.some((x) => min(i.inizio!) < fine(x) && min(x.inizio!) < fine(i)));
    if (g) g.push(i); else gruppi.push([i]);
  }
  const out = new Map<string, { corsia: number; di: number }>();
  for (const g of gruppi) {
    const occupate: number[] = [];
    for (const i of g) {
      let c = 0;
      while (occupate[c] !== undefined && occupate[c] > min(i.inizio!)) c++;
      occupate[c] = fine(i);
      out.set(i.id, { corsia: c, di: 0 });
    }
    const di = occupate.length;
    for (const i of g) out.get(i.id)!.di = di;
  }
  return out;
}

export default function VistaGiorno({ companyId, puntoDi, giornata, personaDi, onCambia, onTocca, attiva, onApri, onNodoGriglia }: {
  companyId: string | null;
  puntoDi: (i: Intervento) => Punto | null;
  /** Il riquadro delle ore: serve alla pagina per sapere a che ora hai lasciato un blocco. */
  onNodoGriglia: (n: HTMLDivElement | null) => void;
  giornata: Giornata;
  personaDi: Map<string, PersonaGiorno>;
  onCambia: (id: string, patch: Partial<Intervento>) => void;
  /** Tocca-e-metti: l'intervento toccato riceve la persona scelta. */
  onTocca: (id: string) => void;
  attiva: boolean;
  onApri: (id: string) => void;
}) {
  const lane = corsie(giornata.interventi);

  // Il viaggio per arrivare a ogni blocco (il più lungo fra chi ci va), con gli
  // stessi conti della Mappa; qui si legge soltanto la strada già presa dalla
  // mappa, altrimenti la stima: questa vista non chiama HERE.
  const sede = useCompanyBase();
  const agenda = agendaPersone({ ...giornata, interventi: giornata.interventi.map((i) => ({ ...i, punto: puntoDi(i) })) });
  const giriPersona = [...agenda.values()].map((suoi) => {
    const tappe = giro(suoi);
    return { tappe, punti: puntiDelGiro(tappe, sede) };
  });
  const strade = useStradeGiri(companyId, giriPersona.map((g) => g.punti), { chiedi: false });
  const viaggioVerso = new Map<string, { minuti: number; ritardo: number; stima: boolean }>();
  giriPersona.forEach((g, k) => {
    const v = viaggiDelGiro(g.tappe, sede, strade[k]?.data?.tratte);
    for (const t of v.tappe) {
      if (!t.minuti) continue;
      const prima = viaggioVerso.get(t.intervento.id);
      if (!prima || t.minuti > prima.minuti || t.ritardo > prima.ritardo) {
        viaggioVerso.set(t.intervento.id, { minuti: Math.max(t.minuti, prima?.minuti ?? 0), ritardo: Math.max(t.ritardo, prima?.ritardo ?? 0), stima: !v.stradale });
      }
    }
  });
  const senzaOra = giornata.interventi.filter((i) => !i.inizio);

  const ora = new Date();
  const oraAdesso = ora.getHours() * 60 + ora.getMinutes();
  const oggi = giornata.giorno === ora.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

  return (
    <>
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex min-h-[2.25rem] flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5">
          <span className="text-[11px] font-semibold text-slate-500">In giornata</span>
          {senzaOra.length === 0 && <span className="text-[11px] text-slate-400">tutti gli interventi hanno un orario</span>}
          {senzaOra.map((i) => (
            <Blocco key={i.id} i={i} personaDi={personaDi} attiva={attiva} onTocca={onTocca} onApri={onApri} compatto />
          ))}
          {senzaOra.length > 0 && <span className="text-[10px] text-slate-400">← trascinali nella griglia per dargli un orario</span>}
        </div>

        <Griglia onNodo={onNodoGriglia}>
          {Array.from({ length: ALLE - DALLE + 1 }, (_, k) => (
            <div key={k} className="absolute inset-x-0 flex items-start" style={{ top: k * PX_ORA }}>
              <span className="w-10 -translate-y-1.5 pr-2 text-right text-[10px] tabular-nums text-slate-400">{DALLE + k}:00</span>
              <span className="mt-px h-px flex-1 bg-slate-100" />
            </div>
          ))}
          {oggi && oraAdesso >= DALLE * 60 && oraAdesso <= ALLE * 60 && (
            <div className="pointer-events-none absolute left-10 right-0 z-20 h-0.5 bg-rose-500" style={{ top: (oraAdesso - DALLE * 60) * PX_MIN }} aria-hidden="true" />
          )}
          <div className="absolute inset-y-0 left-11 right-1">
            {/* Prima i viaggi (sotto i blocchi): una fascia tratteggiata che finisce all'inizio del blocco. */}
            {giornata.interventi.filter((i) => i.inizio && viaggioVerso.has(i.id)).map((i) => {
              const v = viaggioVerso.get(i.id)!;
              const l = lane.get(i.id) ?? { corsia: 0, di: 1 };
              const inizio = min(i.inizio!);
              const da = Math.max(inizio - v.minuti, DALLE * 60);
              const h = (inizio - da) * PX_MIN;
              if (h < 4) return null;
              return (
                <div key={`v-${i.id}`} aria-hidden="true"
                  title={`${v.ritardo > 0 ? `Non ci arriva: mancano ${v.ritardo} min · ` : ""}${v.stima ? "~" : ""}${v.minuti} min di strada`}
                  className={cn("absolute flex items-end justify-center rounded-t-md border-x border-t border-dashed px-0.5 text-[9px] tabular-nums",
                    v.ritardo > 0 ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-300 bg-[repeating-linear-gradient(135deg,#f1f5f9_0_4px,transparent_4px_8px)] text-slate-500")}
                  style={{ top: (da - DALLE * 60) * PX_MIN, height: h, left: `calc(${(l.corsia / l.di) * 100}% + 4px)`, width: `calc(${100 / l.di}% - 8px)` }}>
                  {h >= 14 && <span className="truncate">{v.ritardo > 0 ? `−${v.ritardo}′` : `${v.stima ? "~" : ""}${v.minuti}′ strada`}</span>}
                </div>
              );
            })}
            {giornata.interventi.filter((i) => i.inizio).map((i) => {
              const l = lane.get(i.id) ?? { corsia: 0, di: 1 };
              const top = (Math.max(min(i.inizio!), DALLE * 60) - DALLE * 60) * PX_MIN;
              const h = Math.max(((i.fine ? min(i.fine) : min(i.inizio!) + 60) - min(i.inizio!)) * PX_MIN, 22);
              const accavallato = i.persone.some((p) => giornata.interventi.some((j) => j.id !== i.id && j.persone.includes(p) && siSovrappongono(i, j)));
              return (
                <div key={i.id} className="absolute px-0.5" style={{ top, height: h, left: `${(l.corsia / l.di) * 100}%`, width: `${100 / l.di}%` }}>
                  <Blocco i={i} personaDi={personaDi} attiva={attiva} onTocca={onTocca} onApri={onApri} accavallato={accavallato}
                    onDurata={(delta) => onCambia(i.id, cambiaDurata(i, delta))} />
                </div>
              );
            })}
          </div>
        </Griglia>
        <p className="text-[10px] text-slate-400">Trascina un blocco per cambiare l'ora (a passi di 15 minuti), tira il bordo in basso per allungarlo, porta le persone sui blocchi. Doppio clic per aprire la scheda.</p>
      </div>
    </>
  );
}

function Griglia({ onNodo, children }: { onNodo: (n: HTMLDivElement | null) => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: ID_GRIGLIA });
  return (
    <div ref={(n) => { setNodeRef(n); onNodo(n); }} className={cn("relative select-none", isOver && "bg-orange-50/40")} style={{ height: (ALLE - DALLE) * PX_ORA + 8 }}>
      {children}
    </div>
  );
}

function Blocco({ i, personaDi, attiva, onTocca, onApri, compatto, accavallato, onDurata }: {
  i: Intervento;
  personaDi: Map<string, PersonaGiorno>;
  attiva: boolean;
  onTocca: (id: string) => void;
  onApri: (id: string) => void;
  compatto?: boolean;
  accavallato?: boolean;
  onDurata?: (deltaMinuti: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `blocco:${i.id}`, data: { kind: "blocco", id: i.id, da: null } });
  // Il blocco riceve anche le persone, i mezzi e le squadre trascinati dall'elenco.
  const zona = useDroppable({ id: i.id });
  const [tiro, setTiro] = useState<{ y: number; delta: number } | null>(null);
  const colore = coloreIntervento(i);
  const persone = i.persone.map((p) => personaDi.get(p)).filter((p): p is PersonaGiorno => !!p);

  const inizioTiro = (e: PE) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setTiro({ y: e.clientY, delta: 0 });
  };
  const muoviTiro = (e: PE) => { if (tiro) setTiro({ ...tiro, delta: e.clientY - tiro.y }); };
  const fineTiro = () => {
    if (tiro && onDurata && Math.abs(tiro.delta) > 3) onDurata(tiro.delta / PX_MIN);
    setTiro(null);
  };

  return (
    <div
      ref={(n) => { setNodeRef(n); zona.setNodeRef(n); }}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); if (attiva) onTocca(i.id); }}
      onDoubleClick={() => onApri(i.id)}
      title={`${i.inizio ? `${i.inizio}${i.fine ? `–${i.fine}` : ""} · ` : ""}${i.titolo}${i.indirizzo ? ` · ${i.indirizzo}` : ""}`}
      style={{
        transform: transform ? `translate3d(${compatto ? transform.x : 0}px, ${transform.y}px, 0)` : undefined,
        borderLeftColor: colore,
        height: compatto ? undefined : `calc(100% + ${tiro?.delta ?? 0}px)`,
      }}
      className={cn(
        "relative touch-none overflow-hidden rounded-md border-l-[3px] bg-white text-[11px] shadow-sm ring-1 ring-slate-200",
        compatto ? "inline-flex max-w-[14rem] cursor-grab items-center gap-1 px-1.5 py-1" : "h-full cursor-grab px-1.5 py-1",
        isDragging && "z-30 opacity-80 shadow-lg ring-orange-300",
        attiva && "cursor-copy hover:ring-orange-400",
        accavallato && "ring-2 ring-rose-400",
        zona.isOver && !isDragging && "ring-2 ring-orange-400 bg-orange-50",
      )}
    >
      {!compatto && (
        <p className="flex items-center gap-1 text-[10px] font-semibold tabular-nums text-slate-500">
          <Clock className="h-2.5 w-2.5" aria-hidden="true" />{i.inizio}{i.fine ? `–${i.fine}` : ""}
        </p>
      )}
      <p className="truncate font-semibold text-slate-800">{i.titolo}</p>
      {!compatto && i.indirizzo && <p className="flex items-center gap-0.5 truncate text-[10px] text-slate-500"><MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />{i.indirizzo}</p>}
      <span className={cn("flex -space-x-1", compatto ? "" : "mt-0.5")}>
        {persone.slice(0, 6).map((p) => (
          <span key={p.id} className="flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold text-white ring-1 ring-white" style={{ backgroundColor: p.colore || "#64748B" }} title={`${p.nome} ${p.cognome}`}>
            {`${p.nome?.[0] ?? ""}${p.cognome?.[0] ?? ""}`.toUpperCase()}
          </span>
        ))}
        {persone.length === 0 && <span className="text-[9px] text-amber-600">nessuno</span>}
      </span>
      {onDurata && (
        <span
          role="separator"
          aria-label="Allunga o accorcia"
          onPointerDown={inizioTiro}
          onPointerMove={muoviTiro}
          onPointerUp={fineTiro}
          onPointerCancel={() => setTiro(null)}
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize bg-gradient-to-t from-slate-200/60 to-transparent hover:from-orange-300/70"
        />
      )}
    </div>
  );
}
