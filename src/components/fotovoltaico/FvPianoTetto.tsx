/**
 * FvPianoTetto — il piano di posa dei pannelli sul tetto, disegnato in scala sulla vista satellitare.
 *
 * Fase 5 del preventivo fotovoltaico (25/10/2026, torna l'editor tolto il 13/07): l'installatore vede il tetto
 * dall'alto, trascina l'insieme dei moduli sulla falda giusta, lo ruota, sceglie colonne e orientamento. I moduli
 * hanno le loro misure vere (1,13 × 1,72 m), quindi si vede se stanno o no. Il piano si salva sul progetto e
 * diventa una pagina del PDF (stessa geometria: supabase/functions/_shared/fvPianoTetto.ts).
 *
 * Il piano si disegna solo se lo si chiede («Disegna il piano sul tetto»): senza, il PDF non ha la pagina.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Loader2, MapPinned, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PIANO_ALTEZZA, PIANO_LARGHEZZA, PIANO_ZOOM, disponiPannelli, leggiPiano, metriPerPunto, metriTesto,
  misureTesto, pianoConModulo, pianoIniziale, type MisureModulo, type PianoTetto,
} from "../../../supabase/functions/_shared/fvPianoTetto";

type PianoSalvato = { x: number; y: number; rot: number; cols: number; unita?: "m"; orient?: "v" | "o"; modulo?: MisureModulo };

interface Props {
  lat: number;
  lng: number;
  moduli: number;
  kwp?: number | null;
  /** Il piano com'è salvato sul progetto (null = non disegnato). */
  piano: PianoSalvato | null;
  onChange: (piano: PianoSalvato | null) => void;
  /** false = solo lettura (preventivo già emesso). */
  modificabile: boolean;
  /** Le misure del pannello scelto nel preventivo (scheda tecnica, o stimate dalla potenza). */
  modulo: MisureModulo;
}

export function FvPianoTetto({ lat, lng, moduli, kwp, piano, onChange, modificabile, modulo }: Props) {
  const [img, setImg] = useState<string | null>(null);
  const [stato, setStato] = useState<"carico" | "ok" | "errore">("carico");
  const [fornitore, setFornitore] = useState<string | null>(null);
  const riquadro = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let annullato = false;
    setStato("carico");
    setImg(null);
    (async () => {
      try {
        // La stessa vista del PDF: Google, zoom 20, 640 × 400.
        const { data, error } = await supabase.functions.invoke("maps-proxy", {
          body: { action: "staticmap", lat, lng, zoom: PIANO_ZOOM, w: PIANO_LARGHEZZA, h: PIANO_ALTEZZA },
        });
        if (annullato) return;
        const r = data as { dataUrl?: string; provider?: string } | null;
        if (error || !r?.dataUrl) { setStato("errore"); return; }
        setImg(r.dataUrl);
        setFornitore(r.provider ?? null);
        setStato("ok");
      } catch {
        if (!annullato) setStato("errore");
      }
    })();
    return () => { annullato = true; };
  }, [lat, lng]);

  const attuale: PianoTetto | null = leggiPiano(piano);

  // Il pannello cambia dopo il disegno: le misure seguono il pannello scelto, posizione e rotazione restano.
  const misureSalvate = attuale?.modulo;
  useEffect(() => {
    if (!modificabile || !attuale) return;
    const aggiornato = pianoConModulo(attuale, modulo);
    if (aggiornato !== attuale) onChange(aggiornato);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulo.corto, modulo.lungo, modulo.stimato, misureSalvate?.corto, misureSalvate?.lungo, misureSalvate?.stimato, modificabile, !!attuale]);
  const mpp = metriPerPunto(lat);
  const disegno = attuale ? disponiPannelli({ moduli, piano: attuale, metriPerPuntoVista: mpp }) : null;
  const scrivi = (patch: Partial<PianoTetto>) => {
    if (!attuale) return;
    onChange({ ...attuale, ...patch });
  };

  const trascina = (e: ReactPointerEvent<SVGGElement>) => {
    if (!modificabile || !attuale || !riquadro.current) return;
    e.preventDefault();
    const larghezzaSchermo = riquadro.current.getBoundingClientRect().width || PIANO_LARGHEZZA;
    const puntiPerPixel = PIANO_LARGHEZZA / larghezzaSchermo;
    const partenza = { sx: e.clientX, sy: e.clientY, x: attuale.x, y: attuale.y };
    const muovi = (ev: globalThis.PointerEvent) => {
      onChange({
        ...attuale,
        x: partenza.x + (ev.clientX - partenza.sx) * puntiPerPixel * mpp,
        y: partenza.y + (ev.clientY - partenza.sy) * puntiPerPixel * mpp,
      });
    };
    const rilascia = () => {
      window.removeEventListener("pointermove", muovi);
      window.removeEventListener("pointerup", rilascia);
    };
    window.addEventListener("pointermove", muovi);
    window.addEventListener("pointerup", rilascia);
  };

  if (stato === "errore") return null; // niente vista satellitare: niente piano (come per la vista della Fase 4)
  if (!(moduli > 0)) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 mt-4 text-sm text-slate-500">
        Scegli il numero dei pannelli per disegnare il piano sul tetto.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 mt-4" data-testid="fv-piano-tetto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <MapPinned className="h-4 w-4 text-orange-500" /> Piano di posa sul tetto
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {attuale
              ? `Trascina i moduli sulla falda e ruotali: sono in scala, ${misureTesto(attuale.modulo ?? modulo)} l'uno${(attuale.modulo ?? modulo).stimato ? " (misure stimate dalla potenza: scrivile nel pannello del listino)" : ""}. Finisce nel PDF.`
              : "Disegna dove vanno i pannelli sul tetto: nel PDF compare una pagina col piano in scala."}
          </p>
        </div>
        {modificabile && !attuale && stato === "ok" && (
          <button
            type="button"
            onClick={() => onChange(pianoIniziale(moduli, modulo))}
            className="px-3.5 py-2 text-xs font-bold rounded-lg text-white bg-gradient-to-br from-orange-500 to-amber-400 shadow-sm hover:shadow-md"
          >
            Disegna il piano sul tetto
          </button>
        )}
        {modificabile && attuale && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Trash2 className="h-3 w-3" /> Togli il piano
          </button>
        )}
      </div>

      <div
        ref={riquadro}
        className="relative mt-3 w-full overflow-hidden rounded-xl bg-slate-900/5 ring-1 ring-slate-200"
        style={{ aspectRatio: `${PIANO_LARGHEZZA} / ${PIANO_ALTEZZA}` }}
      >
        {stato === "carico" && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carico la vista del tetto…
          </div>
        )}
        {img && (
          <svg viewBox={`0 0 ${PIANO_LARGHEZZA} ${PIANO_ALTEZZA}`} className="absolute inset-0 w-full h-full select-none" role="img" aria-label="Piano di posa dei pannelli sul tetto">
            <image href={img} x={0} y={0} width={PIANO_LARGHEZZA} height={PIANO_ALTEZZA} preserveAspectRatio="xMidYMid slice" />
            {disegno && (
              <g
                transform={`translate(${disegno.cx} ${disegno.cy}) rotate(${disegno.rot})`}
                onPointerDown={trascina}
                style={{ cursor: modificabile ? "move" : "default", touchAction: "none" }}
              >
                {disegno.pannelli.map((p, i) => (
                  <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={1} fill="rgba(37,99,235,0.78)" stroke="#E0F2FE" strokeWidth={0.8} />
                ))}
              </g>
            )}
            <g transform={`translate(${PIANO_LARGHEZZA - 40} 36)`}>
              <circle r={17} fill="rgba(2,6,23,0.6)" />
              <path d="M0 -12 L5 5 L0 2 L-5 5 Z" fill="#fff" />
              <text y={-17} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">N</text>
            </g>
            <g transform={`translate(16 ${PIANO_ALTEZZA - 18})`}>
              <rect x={-6} y={-12} width={5 / mpp + 40} height={24} rx={5} fill="rgba(2,6,23,0.6)" />
              <rect x={0} y={-2} width={5 / mpp} height={4} fill="#fff" />
              <text x={5 / mpp + 6} y={3} fontSize={10} fontWeight={700} fill="#fff">5 m</text>
            </g>
          </svg>
        )}
      </div>

      {attuale && disegno && img && (
        <>
          <div className="mt-3 grid sm:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Rotazione</Label>
                <span className="text-xs font-medium text-slate-600 tabular-nums">{Math.round(attuale.rot)}°</span>
              </div>
              <input
                type="range" min={-90} max={90} value={Math.round(attuale.rot)} disabled={!modificabile}
                onChange={(e) => scrivi({ rot: Number(e.target.value) })}
                className="w-full accent-orange-500" aria-label="Rotazione dei moduli"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Moduli per fila</Label>
                <span className="text-xs font-medium text-slate-600 tabular-nums">{Math.min(attuale.cols, moduli)}</span>
              </div>
              <input
                type="range" min={1} max={Math.min(moduli, 24)} value={Math.min(attuale.cols, moduli, 24)} disabled={!modificabile}
                onChange={(e) => scrivi({ cols: Number(e.target.value) })}
                className="w-full accent-orange-500" aria-label="Moduli per fila"
              />
            </div>
            <div>
              <Label className="text-xs">Posa dei moduli</Label>
              <div role="group" aria-label="Orientamento dei moduli" className="mt-1 flex gap-1.5">
                {([["v", "In verticale"], ["o", "In orizzontale"]] as const).map(([chiave, etichetta]) => (
                  <button
                    key={chiave}
                    type="button"
                    disabled={!modificabile}
                    aria-pressed={attuale.orient === chiave}
                    onClick={() => scrivi({ orient: chiave })}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors",
                      attuale.orient === chiave ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                    )}
                  >
                    {etichetta}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 flex-wrap text-[11px] text-slate-500">
            <span>
              {moduli} moduli{kwp != null && kwp > 0 ? ` · ${kwp.toFixed(1)} kWp` : ""} · ingombro {metriTesto(disegno.larghezzaM)} × {metriTesto(disegno.altezzaM)} · {Math.round(disegno.areaM2)} m²
            </span>
            {modificabile && (
              <button
                type="button"
                onClick={() => scrivi({ x: 0, y: 0 })}
                className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900"
              >
                <RotateCcw className="h-3 w-3" /> Riporta al centro
              </button>
            )}
          </div>
          {disegno.fuori && (
            <p role="alert" className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
              I moduli escono dalla vista: spostali, riduci le file o ruotali. Nel PDF si vedrebbero tagliati.
            </p>
          )}
          {fornitore && fornitore !== "google" && (
            <p className="mt-2 text-[11px] text-slate-400">
              La vista non arriva da Google: la scala è indicativa e il piano non entra nel PDF.
            </p>
          )}
        </>
      )}
    </div>
  );
}
