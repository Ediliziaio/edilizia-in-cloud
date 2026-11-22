/**
 * HeroRete — la rete di palline viva sopra la foto dell'apertura della home.
 *
 * Palline arancioni e bianche che ondeggiano, si collegano quando sono vicine e si
 * scostano dal cursore; vicino al mouse i collegamenti si accendono. È la stessa idea
 * del cervello di Silvio più in basso, qui come sfondo leggero.
 *
 * Canvas, non SVG: 70 palline e i loro collegamenti ridisegnati a ogni frame costano
 * poco su canvas. Si ferma fuori schermo, a scheda nascosta e con prefers-reduced-motion
 * (in quel caso disegna una volta sola, ferma). Non intercetta il mouse: lo legge dalla
 * finestra, così pulsanti e link dell'apertura restano cliccabili.
 */
import { useEffect, useRef } from "react";

type Pallina = { x: number; y: number; vx: number; vy: number; r: number; arancio: boolean; ox: number; oy: number };

export default function HeroRete({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ridotto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Su telefono si ridisegna un frame sì e uno no (a velocità doppia, così il
    // moto resta uguale): metà lavoro mentre la pagina sta ancora partendo.
    const leggero = window.matchMedia("(pointer: coarse)").matches;
    const passo = leggero ? 2 : 1;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let palline: Pallina[] = [];
    const mouse = { x: -9999, y: -9999, attivo: false };

    const crea = () => {
      const n = Math.round(Math.min(80, Math.max(28, (w * h) / 16000)));
      let seed = 7;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      palline = Array.from({ length: n }, () => ({
        x: rand() * w,
        y: rand() * h,
        vx: (rand() - 0.5) * 0.25,
        vy: (rand() - 0.5) * 0.25,
        r: 1.2 + rand() * 2.2,
        arancio: rand() < 0.45,
        ox: 0,
        oy: 0,
      }));
    };

    const misura = () => {
      const box = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = box.width;
      h = box.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      crea();
    };

    const DIST = 130;
    const disegna = () => {
      ctx.clearRect(0, 0, w, h);
      // posizioni
      for (const p of palline) {
        if (!ridotto) {
          p.x += p.vx * passo;
          p.y += p.vy * passo;
          if (p.x < -20) p.x = w + 20;
          if (p.x > w + 20) p.x = -20;
          if (p.y < -20) p.y = h + 20;
          if (p.y > h + 20) p.y = -20;
        }
        let tx = 0;
        let ty = 0;
        if (mouse.attivo) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d = Math.hypot(dx, dy);
          if (d < 170 && d > 0.1) {
            const f = Math.pow(1 - d / 170, 1.5) * 40;
            tx = (dx / d) * f;
            ty = (dy / d) * f;
          }
        }
        p.ox += (tx - p.ox) * 0.12;
        p.oy += (ty - p.oy) * 0.12;
      }
      // collegamenti
      for (let i = 0; i < palline.length; i++) {
        const a = palline[i];
        const ax = a.x + a.ox;
        const ay = a.y + a.oy;
        for (let j = i + 1; j < palline.length; j++) {
          const b = palline[j];
          const bx = b.x + b.ox;
          const by = b.y + b.oy;
          const d = Math.hypot(ax - bx, ay - by);
          if (d > DIST) continue;
          const vicinoMouse = mouse.attivo && Math.hypot((ax + bx) / 2 - mouse.x, (ay + by) / 2 - mouse.y) < 160;
          const alpha = (1 - d / DIST) * (vicinoMouse ? 0.7 : 0.22);
          ctx.strokeStyle = vicinoMouse ? `rgba(249,116,21,${alpha})` : `rgba(255,255,255,${alpha})`;
          ctx.lineWidth = vicinoMouse ? 1.2 : 0.8;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
        // filo verso il cursore
        if (mouse.attivo) {
          const d = Math.hypot(ax - mouse.x, ay - mouse.y);
          if (d < 190) {
            ctx.strokeStyle = `rgba(249,116,21,${(1 - d / 190) * 0.55})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }
      // palline
      for (const p of palline) {
        const x = p.x + p.ox;
        const y = p.y + p.oy;
        const vicino = mouse.attivo ? Math.max(0, 1 - Math.hypot(x - mouse.x, y - mouse.y) / 170) : 0;
        ctx.fillStyle = p.arancio ? `rgba(249,116,21,${0.55 + vicino * 0.45})` : `rgba(255,255,255,${0.35 + vicino * 0.5})`;
        ctx.beginPath();
        ctx.arc(x, y, p.r * (1 + vicino * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let raf = 0;
    let attiva = false;
    let salta = false;
    const giro = () => {
      salta = leggero && !salta;
      if (!salta) disegna();
      raf = requestAnimationFrame(giro);
    };
    const avvia = () => {
      if (attiva || ridotto) return;
      attiva = true;
      raf = requestAnimationFrame(giro);
    };
    const ferma = () => {
      attiva = false;
      cancelAnimationFrame(raf);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const box = canvas.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      mouse.attivo = x >= 0 && y >= 0 && x <= box.width && y <= box.height;
      mouse.x = x;
      mouse.y = y;
    };

    misura();
    disegna();
    const ro = new ResizeObserver(() => {
      misura();
      disegna();
    });
    ro.observe(canvas);
    let visibile = false;
    const io = new IntersectionObserver(([e]) => {
      visibile = e.isIntersecting;
      if (visibile && !document.hidden) avvia();
      else ferma();
    });
    io.observe(canvas);
    const onVis = () => (document.hidden || !visibile ? ferma() : avvia());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      ferma();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
