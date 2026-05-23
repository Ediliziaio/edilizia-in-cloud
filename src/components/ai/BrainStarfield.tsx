/**
 * BrainStarfield — sfondo animato a stelle per AIBrainGraph.
 *
 * Disegna ~50 puntini luminosi su canvas che pulsano lentamente +
 * 3-4 "stelle cadenti" che attraversano lo schermo. Effetto "spazio
 * profondo / cervello cosmico" senza dipendenze esterne.
 *
 * Performance: target 30fps con canvas 2D leggero.
 * Si stoppa automaticamente quando il componente esce dal viewport
 * via IntersectionObserver.
 */

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  phase: number;       // fase pulsazione
  speed: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;        // 0..1
  maxLife: number;
}

const STAR_COUNT = 50;             // ridotto da 80 → 50 (meno calcoli/frame)
const SHOOTING_INTERVAL_MS = 6000; // ridotta frequenza comete
const TARGET_FPS = 30;             // 30fps invece di 60 → ~50% meno CPU
const FRAME_INTERVAL = 1000 / TARGET_FPS;

export function BrainStarfield() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const lastShootRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  useEffect(() => {
    // Rispetta preferenza utente per ridurre animazioni (iOS Reduce Motion)
    const reduceMotion = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = canvas.offsetWidth;
    let height = canvas.offsetHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Init stars
    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.5 + 0.3,
      baseAlpha: Math.random() * 0.5 + 0.2,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.5 + 0.3,
    }));

    const shooting: ShootingStar[] = [];

    // Pause when off-screen
    let visible = true;
    const io = new IntersectionObserver(
      ([entry]) => { visible = entry.isIntersecting; },
      { threshold: 0 },
    );
    io.observe(canvas);

    // Resize handler
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (t: number) => {
      animRef.current = requestAnimationFrame(draw);
      if (!visible) return;
      // Throttle a 30fps — skip i frame "extra"
      if (t - lastFrameRef.current < FRAME_INTERVAL) return;
      lastFrameRef.current = t;

      ctx.clearRect(0, 0, width, height);

      // Background subtle vignette
      const grad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
      grad.addColorStop(0, "rgba(20, 25, 50, 0.4)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0.7)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Draw stars
      for (const s of stars) {
        const pulse = Math.sin(t * 0.001 * s.speed + s.phase) * 0.4 + 0.6;
        const alpha = s.baseAlpha * pulse;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 200, 255, ${alpha})`;
        ctx.fill();

        // Glow halo
        if (s.size > 1) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180, 200, 255, ${alpha * 0.08})`;
          ctx.fill();
        }
      }

      // Maybe spawn shooting star
      if (t - lastShootRef.current > SHOOTING_INTERVAL_MS) {
        lastShootRef.current = t;
        const startEdge = Math.random();
        const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.3; // diagonal-ish
        const speed = 0.8 + Math.random() * 0.4;
        const sx = startEdge < 0.5 ? Math.random() * width * 0.5 : -50;
        const sy = startEdge < 0.5 ? -50 : Math.random() * height * 0.5;
        shooting.push({
          x: sx,
          y: sy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 1,
        });
      }

      // Update + draw shooting stars
      for (let i = shooting.length - 1; i >= 0; i--) {
        const ss = shooting[i];
        ss.x += ss.vx * 4;
        ss.y += ss.vy * 4;
        ss.life += 0.008;
        if (ss.life >= ss.maxLife || ss.x > width + 100 || ss.y > height + 100) {
          shooting.splice(i, 1);
          continue;
        }
        // Comet trail
        const tailLen = 60;
        const tailX = ss.x - ss.vx * tailLen;
        const tailY = ss.y - ss.vy * tailLen;
        const lineGrad = ctx.createLinearGradient(tailX, tailY, ss.x, ss.y);
        lineGrad.addColorStop(0, "rgba(255, 200, 100, 0)");
        lineGrad.addColorStop(1, `rgba(255, 200, 100, ${0.7 * (1 - ss.life)})`);
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(ss.x, ss.y);
        ctx.stroke();
        // Head
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 220, 150, ${1 - ss.life})`;
        ctx.fill();
      }
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden
    />
  );
}
