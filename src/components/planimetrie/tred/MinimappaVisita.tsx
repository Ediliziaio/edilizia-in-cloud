import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { muroPresente, type PiantaPer3D, type Vista3D } from "@/lib/planimetrie/tred";
import type { PassaggioVisita } from "@/lib/planimetrie/tred/visita";
import { eAmbienteInterno } from "../../../../shared/planimetrie/modello";

const W = 416, H = 248, MARGINE = 19;
type Posizione = { x: number; z: number; dx: number; dz: number };
export interface MinimappaVisitaHandle { aggiorna: (posizione: Posizione) => void }

interface Props {
  piano: { id: string; nome: string; quota: number; pianta: PiantaPer3D };
  vista: Vista3D;
  localeId?: string;
  esterno?: boolean;
  passaggi: PassaggioVisita[];
  leggiPosizione: () => Posizione | null;
  onVediInPianta?: () => void;
}

export const MinimappaVisita = forwardRef<MinimappaVisitaHandle, Props>(function MinimappaVisita({ piano, vista, localeId, esterno, passaggi, leggiPosizione, onVediInPianta }, ref) {
  const base = useRef<HTMLCanvasElement>(null);
  const indicatore = useRef<HTMLCanvasElement>(null);
  const { pianta } = piano;
  const piantaVisibile = useMemo(() => {
    const muri = pianta.muri.filter(m => muroPresente(m.stato, vista));
    const forme = [...(pianta.aree ?? []).map(a => ({ ...a, esterna: true })),
      ...pianta.locali.map(l => ({ ...l, esterna: !eAmbienteInterno(l) }))];
    const punti = [...muri.flatMap(m => [m.a, m.b]), ...forme.flatMap(f => f.contorno)];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of punti) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.y); z1 = Math.max(z1, p.y);
    }
    if (!punti.length) return null;
    const margine = esterno && Math.abs(piano.quota) <= .25 ? 400 : 100;
    const scala = Math.min((W - 2 * MARGINE) / (x1 - x0 + 2 * margine), (H - 2 * MARGINE) / (z1 - z0 + 2 * margine));
    const mX = (x0 + x1) / 2, mZ = (z0 + z1) / 2;
    return { muri, forme, scala, proietta: (x: number, z: number) => [W / 2 + (x - mX) * scala, H / 2 + (z - mZ) * scala] as const };
  }, [pianta, piano.quota, vista, esterno]);

  useEffect(() => {
    const ctx = base.current?.getContext("2d"), schema = piantaVisibile;
    if (!ctx) return;
    ctx.fillStyle = "#edf2f7";
    ctx.fillRect(0, 0, W, H);
    if (!schema) return;
    for (const f of schema.forme) {
      ctx.beginPath();
      f.contorno.forEach((p, i) => {
        const [x, z] = schema.proietta(p.x, p.y);
        if (i === 0) ctx.moveTo(x, z); else ctx.lineTo(x, z);
      });
      ctx.closePath();
      ctx.fillStyle = f.id === localeId ? "#b8d8ff" : f.esterna ? "#dcebdc" : "#fafcfe";
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = "#b8c8d8";
      ctx.stroke();
    }
    ctx.strokeStyle = "#435a72";
    ctx.lineCap = "round";
    for (const m of schema.muri) {
      ctx.beginPath();
      ctx.moveTo(...schema.proietta(m.a.x, m.a.y));
      ctx.lineTo(...schema.proietta(m.b.x, m.b.y));
      ctx.lineWidth = Math.max(1.7, m.spessore * schema.scala);
      ctx.stroke();
    }
    for (const p of passaggi) {
      if (p.da.pianoId !== piano.id || p.tipo === "entra") continue;
      const [x, , z] = p.da.piedi;
      ctx.beginPath();
      ctx.arc(...schema.proietta(x * 100, z * 100), 4, 0, Math.PI * 2);
      ctx.fillStyle = p.tipo === "esci" ? "#15735e" : "#555c94";
      ctx.fill();
    }
  }, [piano.id, piantaVisibile, localeId, passaggi]);

  const aggiorna = (p: Posizione) => {
    const ctx = indicatore.current?.getContext("2d");
    if (!ctx || !piantaVisibile) return;
    const [x, z] = piantaVisibile.proietta(p.x * 100, p.z * 100);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    // Su una rampa resta leggibile il punto anche in prossimità del bordo della mappa.
    ctx.translate(Math.min(W - 12, Math.max(12, x)), Math.min(H - 12, Math.max(12, z)));
    ctx.rotate(Math.atan2(p.dz, p.dx) + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(-19, -33); ctx.lineTo(19, -33); ctx.closePath();
    ctx.fillStyle = "#2675d83b"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 8); ctx.lineTo(0, 5); ctx.lineTo(-9, 8); ctx.closePath();
    ctx.fillStyle = "#135fc2"; ctx.fill();
    ctx.lineJoin = "round"; ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.restore();
  };
  useImperativeHandle(ref, () => ({ aggiorna }));
  useEffect(() => {
    const p = leggiPosizione();
    if (p) aggiorna(p);
  });

  return <div id="minimappa-visita" className="pointer-events-auto absolute right-3 top-[4.5rem] z-10 w-[clamp(138px,37%,208px)] overflow-hidden rounded-xl border bg-card shadow-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-150">
    <figure className="relative border-b bg-[#edf2f7]">
      <canvas ref={base} role="img" aria-label={`Minimappa 2D, ${piano.nome}. La freccia indica posizione e direzione della visita.`}
        width={W} height={H} className="block h-auto w-full"/>
      <canvas ref={indicatore} aria-hidden="true" width={W} height={H} className="pointer-events-none absolute inset-0 h-full w-full"/>
    </figure>
    {onVediInPianta && <Button type="button" size="sm" variant="ghost" className="h-9 w-full justify-between gap-1 rounded-none px-2.5 text-xs"
      onClick={onVediInPianta}>Mostra sulla pianta<ArrowUpRight className="size-3.5 shrink-0"/></Button>}
  </div>;
});
