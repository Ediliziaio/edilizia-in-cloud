import { useRef, useState, type PointerEvent } from "react";
import { Pencil, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Punto = { x: number; y: number };
const LARGHEZZA = 960;
const ALTEZZA = 624;

export function SchizzoSopralluogo({ onChiudi, onUsa }: { onChiudi: () => void; onUsa: (file: File) => void }) {
  const t = useT();
  const tela = useRef<HTMLCanvasElement>(null);
  const tratti = useRef<Punto[][]>([]);
  const attivo = useRef<number | null>(null);
  const [quanti, setQuanti] = useState(0);
  const [generando, setGenerando] = useState(false);
  const [errore, setErrore] = useState("");

  const penna = () => {
    const ctx = tela.current?.getContext("2d");
    if (!ctx) return null;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#152339";
    return ctx;
  };
  const ridisegna = () => {
    const ctx = penna();
    if (!ctx) return;
    ctx.clearRect(0, 0, LARGHEZZA, ALTEZZA);
    for (const [primo, ...punti] of tratti.current) {
      ctx.beginPath();
      ctx.moveTo(primo.x, primo.y);
      for (const p of punti) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  };

  const punto = (evento: PointerEvent<HTMLCanvasElement>) => {
    const r = evento.currentTarget.getBoundingClientRect();
    return { x: (evento.clientX - r.left) * LARGHEZZA / r.width, y: (evento.clientY - r.top) * ALTEZZA / r.height };
  };
  const inizia = (evento: PointerEvent<HTMLCanvasElement>) => {
    if (evento.button !== 0 || attivo.current !== null || generando) return;
    attivo.current = evento.pointerId;
    evento.currentTarget.setPointerCapture(evento.pointerId);
    tratti.current.push([punto(evento)]);
  };
  const continua = (evento: PointerEvent<HTMLCanvasElement>) => {
    if (attivo.current !== evento.pointerId) return;
    const tratto = tratti.current.at(-1);
    const ultimo = tratto?.at(-1);
    const ctx = penna();
    if (!tratto || !ultimo || !ctx) return;
    const nuovo = punto(evento);
    ctx.beginPath();
    ctx.moveTo(ultimo.x, ultimo.y);
    ctx.lineTo(nuovo.x, nuovo.y);
    ctx.stroke();
    tratto.push(nuovo);
  };
  const finisci = (evento: PointerEvent<HTMLCanvasElement>) => {
    if (attivo.current !== evento.pointerId) return;
    attivo.current = null;
    if (tratti.current.at(-1)?.length === 1) tratti.current.pop();
    setQuanti(tratti.current.length);
  };
  const annulla = () => { tratti.current.pop(); setQuanti(tratti.current.length); ridisegna(); };
  const usa = async () => {
    if (!tela.current || !quanti || generando) return;
    setGenerando(true);
    setErrore("");
    try {
      const immagine = document.createElement("canvas");
      immagine.width = LARGHEZZA;
      immagine.height = ALTEZZA;
      const ctx = immagine.getContext("2d");
      if (!ctx) throw new Error(t("Il browser non riesce a preparare lo schizzo."));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, LARGHEZZA, ALTEZZA);
      ctx.drawImage(tela.current, 0, 0);
      const png = await new Promise<Blob | null>((risolvi) => immagine.toBlob(risolvi, "image/png"));
      if (!png) throw new Error(t("Schizzo non disponibile. Riprova."));
      onUsa(new File([png], "Schizzo del sopralluogo.png", { type: png.type }));
    } catch (e) { setErrore(e instanceof Error ? e.message : t("Impossibile usare lo schizzo.")); }
    finally { setGenerando(false); }
  };

  return <Dialog open onOpenChange={(aperto) => { if (!aperto && !generando) onChiudi(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4 text-primary" />{t("Disegna uno schizzo")}</DialogTitle>
        <DialogDescription>{t("Traccia muri e ambienti con il dito o il mouse. Imposterai la scala nell’editor.")}</DialogDescription>
      </DialogHeader>
      <div className="overflow-hidden rounded-lg border bg-white">
        <canvas ref={tela} width={LARGHEZZA} height={ALTEZZA} aria-label={t("Foglio per disegnare lo schizzo")} className="block h-auto w-full touch-none cursor-crosshair bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]"
          onPointerDown={inizia} onPointerMove={continua} onPointerUp={finisci} onPointerCancel={finisci} onLostPointerCapture={finisci} />
      </div>
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="outline" disabled={!quanti || generando} onClick={annulla}><Undo2 className="mr-2 h-4 w-4" />{t("Annulla ultimo tratto")}</Button>
        <Button type="button" disabled={!quanti || generando} onClick={() => void usa()}>{generando ? t("Preparo lo schizzo…") : t("Usa lo schizzo")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
