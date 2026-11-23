import { useState, type KeyboardEvent } from "react";
import { Check, RotateCcw, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { proiezioneFoglio, raddrizzaSchizzo, type AngoliSchizzo } from "@/lib/planimetrie/prospettivaSchizzo";
import { useBlobRef } from "../useBlobRef";
import type { Punto } from "./adattatore";

const ANGOLI = ["Alto a sinistra", "Alto a destra", "Basso a destra", "Basso a sinistra"] as const;
const INIZIALI = [{ x: .05, y: .05 }, { x: .95, y: .05 }, { x: .95, y: .95 }, { x: .05, y: .95 }];

export default function RaddrizzaSchizzo({ file, iniziali, onConferma, onRipristina, onChiudi }: {
  file: File;
  iniziali?: AngoliSchizzo;
  onConferma: (foto: File, angoli: AngoliSchizzo) => void;
  onRipristina: () => void;
  onChiudi: () => void;
}) {
  const immagine = useBlobRef<HTMLImageElement>(file, "src");
  const [punti, setPunti] = useState<Array<Punto | null>>(iniziali ? [...iniziali] : [null, null, null, null]);
  const [attivo, setAttivo] = useState(0);
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState("");
  const [a, b, c, d] = punti;
  const angoli: AngoliSchizzo | null = a && b && c && d ? [a, b, c, d] : null;
  const valido = angoli && proiezioneFoglio(angoli);

  function posiziona(p: Punto, avanza = false) {
    setPunti(old => old.map((prec, i) => i === attivo ? p : prec));
    setErrore("");
    if (avanza) setAttivo((attivo + 1) % 4);
  }

  function daTastiera(e: KeyboardEvent<HTMLButtonElement>) {
    const direzioni: Record<string, Punto> = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
    const direzione = direzioni[e.key];
    if (!direzione) return;
    e.preventDefault();
    const p = punti[attivo] ?? INIZIALI[attivo];
    const passo = e.shiftKey ? .01 : .001;
    const limita = (n: number) => Math.max(0, Math.min(1, n));
    posiziona({ x: limita(p.x + direzione.x * passo), y: limita(p.y + direzione.y * passo) });
  }

  async function conferma() {
    if (!angoli || !valido) return;
    setOccupato(true);
    setErrore("");
    try {
      onConferma(await raddrizzaSchizzo(file, angoli), angoli);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Impossibile raddrizzare il foglio.");
      setOccupato(false);
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !occupato) onChiudi(); }}>
    <DialogContent className="max-h-[95dvh] max-w-4xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Raddrizza la foto dello schizzo</DialogTitle>
        <DialogDescription>Scegli gli angoli del foglio in senso orario, a partire dall’alto a sinistra. Per rifinire un punto, selezionalo e usa le frecce sulla foto.</DialogDescription>
      </DialogHeader>
      <div role="group" aria-label="Angoli del foglio" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ANGOLI.map((nome, i) => <Button key={nome} type="button" size="sm" variant={i === attivo ? "secondary" : "outline"}
          disabled={occupato} aria-pressed={i === attivo} onClick={() => setAttivo(i)} className="h-auto min-h-8 whitespace-normal px-2 text-xs">
          {punti[i] ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span aria-hidden>{i + 1}</span>} {nome}
        </Button>)}
      </div>
      <div className="flex justify-center overflow-hidden rounded-lg bg-muted p-3">
        <button type="button" aria-label={"Seleziona angolo " + ANGOLI[attivo].toLocaleLowerCase("it")} disabled={occupato}
          onKeyDown={daTastiera} onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            posiziona(e.detail === 0 ? punti[attivo] ?? INIZIALI[attivo] : { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }, true);
          }} className="relative block max-w-full cursor-crosshair touch-manipulation rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <img ref={immagine} alt="Foto inclinata originale" className="block max-h-[57dvh] w-auto max-w-full select-none" draggable={false} />
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            {punti.map((p, i) => {
              const fine = punti[(i + 1) % 4];
              return p && fine && <line key={i} x1={p.x * 100} y1={p.y * 100} x2={fine.x * 100} y2={fine.y * 100}
                stroke={angoli && !valido ? "#e11d48" : "#38bdf8"} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
          {punti.map((p, i) => p && <span key={i} aria-hidden="true" style={{ left: (p.x * 100) + "%", top: (p.y * 100) + "%" }}
            className="pointer-events-none absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-sky-600 text-[10px] font-bold text-white shadow">{i + 1}</span>)}
        </button>
      </div>
      <p role="status" className="text-xs text-muted-foreground">{angoli ? valido ? "Quattro angoli posizionati." : "Ricontrolla l’ordine e la posizione degli angoli." : punti.filter(Boolean).length + " di 4 angoli posizionati."}</p>
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      <DialogFooter className="flex-wrap gap-2">
        <Button type="button" variant="ghost" disabled={occupato} onClick={() => { setPunti([null, null, null, null]); setAttivo(0); setErrore(""); }}><RotateCcw className="h-4 w-4" /> Riparti</Button>
        {iniziali && <Button type="button" variant="outline" disabled={occupato} onClick={onRipristina}>Usa foto originale</Button>}
        <Button type="button" variant="outline" disabled={occupato} onClick={onChiudi}>Annulla</Button>
        <Button type="button" disabled={!valido || occupato} onClick={() => void conferma()}><ScanLine className="h-4 w-4" />{occupato ? "Raddrizzo…" : "Applica correzione"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
