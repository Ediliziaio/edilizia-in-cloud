/**
 * Firma col dito, piccola (26/11/2026): un riquadro bianco, «Cancella» e «Conferma». Restituisce un PNG ridotto
 * (al massimo 360×140) come data URL, abbastanza leggero da stare dentro una riga del database.
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function FirmaDito({ onConferma, onAnnulla }: { onConferma: (png: string) => void; onAnnulla: () => void }) {
  const t = useT();
  const tela = useRef<HTMLCanvasElement>(null);
  const disegno = useRef(false);
  const [vuota, setVuota] = useState(true);

  useEffect(() => {
    const c = tela.current; const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = 360; c.height = 140;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0f172a";
  }, []);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = tela.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const giu = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault(); const ctx = tela.current?.getContext("2d"); if (!ctx) return;
    const p = punto(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); disegno.current = true;
    tela.current?.setPointerCapture(e.pointerId);
  };
  const muovi = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!disegno.current) return; const ctx = tela.current?.getContext("2d"); if (!ctx) return;
    const p = punto(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setVuota(false);
  };
  const su = () => { disegno.current = false; };
  const cancella = () => {
    const c = tela.current; const ctx = c?.getContext("2d"); if (!c || !ctx) return;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); setVuota(true);
  };

  return (
    <div className="space-y-2">
      <canvas ref={tela} aria-label={t("Firma qui col dito")} onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su}
        className="h-[140px] w-full touch-none rounded-xl border bg-white" />
      <div className="flex gap-2">
        <button type="button" onClick={onAnnulla} className="min-h-11 flex-1 rounded-xl border text-sm font-semibold">{t("Annulla")}</button>
        <button type="button" onClick={cancella} className="min-h-11 flex-1 rounded-xl border text-sm font-semibold">{t("Cancella")}</button>
        <button type="button" disabled={vuota} onClick={() => tela.current && onConferma(tela.current.toDataURL("image/png"))}
          className="min-h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{t("Conferma")}</button>
      </div>
    </div>
  );
}
