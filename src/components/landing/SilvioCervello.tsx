/**
 * SilvioCervello — il "cervello" della home, su fondo bianco.
 *
 * Una rete di palline colorate a forma di cervello: ogni area è un reparto AI
 * (Direzione, Finanza, Vendite, Cantieri, Regole) col suo colore, Silvio sta al
 * centro. Le palline ondeggiano piano, si scostano dal cursore, e degli impulsi
 * di luce corrono da una all'altra lungo i collegamenti, come neuroni che sparano.
 * L'area attiva si accende (passando col mouse o toccando un'etichetta; senza
 * interazione le aree si alternano da sole) e il pannello sotto mostra le sue
 * persone AI.
 *
 * Il movimento è un solo requestAnimationFrame che aggiorna gli attributi SVG
 * direttamente (niente re-render React a ogni frame). Si ferma fuori schermo,
 * a scheda nascosta e con prefers-reduced-motion.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export type RegiaArea = {
  area: string;
  agents: string[];
  icon: LucideIcon;
  color: string;
};

// ───────────────────────── La forma del cervello ─────────────────────────
const W = 1000;
const H = 720;
const SILVIO: [number, number] = [505, 330];
const SILVIO_FREE = 92; // raggio libero attorno a Silvio

// Ogni lobo è un'ellisse; insieme disegnano un cervello visto di lato.
type Lobo = { area: string; cx: number; cy: number; rx: number; ry: number; n: number; chip: { x: number; y: number } };
const LOBI: Lobo[] = [
  { area: "Direzione", cx: 300, cy: 300, rx: 175, ry: 150, n: 30, chip: { x: 14, y: 30 } },
  { area: "Finanza", cx: 545, cy: 185, rx: 205, ry: 115, n: 30, chip: { x: 55, y: 6 } },
  { area: "Vendite", cx: 745, cy: 300, rx: 150, ry: 150, n: 26, chip: { x: 86, y: 30 } },
  { area: "Cantieri", cx: 470, cy: 470, rx: 225, ry: 100, n: 30, chip: { x: 22, y: 82 } },
  { area: "Regole", cx: 740, cy: 505, rx: 120, ry: 78, n: 18, chip: { x: 84, y: 84 } },
];

// Generatore pseudo-casuale con seme: stessi punti a ogni render (e nel prerender).
const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Nodo = { x: number; y: number; lobo: number; r: number; amp: number; sp: number; ph: number };

const buildNetwork = () => {
  const rand = rng(20261121);
  const nodi: Nodo[] = [];
  LOBI.forEach((l, li) => {
    let placed = 0;
    let tries = 0;
    while (placed < l.n && tries < 4000) {
      tries++;
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand());
      const x = l.cx + Math.cos(a) * l.rx * d;
      const y = l.cy + Math.sin(a) * l.ry * d;
      if (Math.hypot(x - SILVIO[0], y - SILVIO[1]) < SILVIO_FREE) continue;
      if (nodi.some((p) => Math.hypot(p.x - x, p.y - y) < 34)) continue;
      nodi.push({
        x,
        y,
        lobo: li,
        r: 3.2 + rand() * 3.4,
        amp: 3 + rand() * 6,
        sp: 0.35 + rand() * 0.55,
        ph: rand() * Math.PI * 2,
      });
      placed++;
    }
  });

  // Ogni pallina si collega alle 3 più vicine.
  const keys = new Set<string>();
  const links: [number, number][] = [];
  nodi.forEach((p, i) => {
    nodi
      .map((q, j) => ({ j, d: Math.hypot(p.x - q.x, p.y - q.y) }))
      .filter((o) => o.j !== i && o.d < 120)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .forEach(({ j }) => {
        const k = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!keys.has(k)) {
          keys.add(k);
          links.push(i < j ? [i, j] : [j, i]);
        }
      });
  });

  // Da Silvio partono due collegamenti verso ogni lobo (le "vie maestre").
  const spine: number[][] = LOBI.map((_, li): number[] =>
    nodi
      .map((p, j) => ({ j, li: p.lobo, d: Math.hypot(p.x - SILVIO[0], p.y - SILVIO[1]) }))
      .filter((o) => o.li === li)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .map((o) => o.j),
  );

  const adj: number[][] = nodi.map((): number[] => []);
  links.forEach(([a, b], k) => {
    adj[a].push(k);
    adj[b].push(k);
  });

  return { nodi, links, spine, adj };
};

const NET = buildNetwork();
const SPINE_LIST = NET.spine.flatMap((js, li) => js.map((j) => ({ j, li })));

// Solchi: qualche curva leggera che fa leggere la forma del cervello.
const SOLCHI = [
  "M180 280 C 240 220, 300 330, 380 250",
  "M390 140 C 450 210, 520 120, 600 180",
  "M640 210 C 700 260, 760 200, 840 260",
  "M300 430 C 380 400, 450 470, 560 420",
  "M600 400 C 650 360, 720 420, 800 380",
];

const CSS = `
@keyframes cervello-halo { 0%,100% { transform: scale(1); opacity: .5 } 50% { transform: scale(1.18); opacity: .18 } }
@keyframes cervello-ring { to { transform: rotate(360deg) } }
.cervello-chip { transition: border-color 250ms ease, box-shadow 250ms ease, transform 250ms ease; }
@media (prefers-reduced-motion: reduce) { .cervello-anim { animation: none !important; } }
`;

type Pulse = { link: number; from: number; t: number; speed: number };

export default function SilvioCervello({ groups }: { groups: RegiaArea[] }) {
  const byName = (name: string) => groups.find((g) => g.area === name) ?? groups[0];
  const [active, setActive] = useState("Direzione");
  const [picked, setPicked] = useState(false);
  const activeGroup = byName(active);
  const activeLobo = LOBI.findIndex((l) => l.area === active);

  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef<(SVGCircleElement | null)[]>([]);
  const linkRefs = useRef<(SVGLineElement | null)[]>([]);
  const spineRefs = useRef<(SVGLineElement | null)[]>([]);
  const pulseRefs = useRef<(SVGGElement | null)[]>([]);
  const tendrilRefs = useRef<(SVGLineElement | null)[]>([]);
  const cursorRef = useRef<SVGGElement>(null);
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef(activeLobo);
  useEffect(() => {
    activeRef.current = activeLobo;
  }, [activeLobo]);

  const colors = useMemo(() => LOBI.map((l) => byName(l.area).color), [groups]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tour delle aree finché l'utente non ne sceglie una.
  useEffect(() => {
    if (picked) return;
    const id = window.setInterval(() => {
      setActive((prev) => LOBI[(LOBI.findIndex((l) => l.area === prev) + 1) % LOBI.length].area);
    }, 3600);
    return () => window.clearInterval(id);
  }, [picked]);

  // Il movimento: palline che ondeggiano, si scostano dal cursore, impulsi che corrono.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { nodi, links, spine, adj } = NET;
    const pos = nodi.map((n) => ({ x: n.x, y: n.y }));
    const flash = nodi.map(() => 0);
    // spostamento dal cursore, smorzato: le palline si scansano morbide e poi tornano
    const ox = nodi.map(() => 0);
    const oy = nodi.map(() => 0);
    const nearArr = nodi.map(() => 0);
    let lastSpawn: { x: number; y: number } | null = null;
    let spawnIdx = 0;
    const spineList = SPINE_LIST;
    const rand = rng(7);

    const newPulse = (): Pulse => {
      // Metà degli impulsi partono da Silvio verso l'area attiva, gli altri girano nella rete.
      if (rand() < 0.45) {
        const js = spine[activeRef.current] ?? spine[0];
        const j = js[Math.floor(rand() * js.length)];
        return { link: -1 - j, from: -1, t: 0, speed: 0.9 + rand() * 0.6 };
      }
      const k = Math.floor(rand() * links.length);
      return { link: k, from: rand() < 0.5 ? links[k][0] : links[k][1], t: 0, speed: 0.7 + rand() * 0.8 };
    };
    const pulses: Pulse[] = Array.from({ length: 16 }, () => ({ ...newPulse(), t: rand() }));

    let raf = 0;
    let last = performance.now();
    let running = false;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const m = mouse.current;

      // posizioni
      const ease = Math.min(1, dt * 7);
      const near3: { i: number; d: number }[] = [];
      for (let i = 0; i < nodi.length; i++) {
        const n = nodi[i];
        const bx = n.x + Math.sin(t * n.sp + n.ph) * n.amp;
        const by = n.y + Math.cos(t * n.sp * 0.8 + n.ph) * n.amp;
        let tx = 0;
        let ty = 0;
        let near = 0;
        if (m) {
          const dx = bx - m.x;
          const dy = by - m.y;
          const d = Math.hypot(dx, dy);
          if (d < 200 && d > 0.1) {
            const f = Math.pow(1 - d / 200, 1.4);
            tx = (dx / d) * f * 52;
            ty = (dy / d) * f * 52;
            near = Math.max(0, 1 - d / 170);
          }
          if (near3.length < 3 || d < near3[2].d) {
            near3.push({ i, d });
            near3.sort((a, b) => a.d - b.d);
            if (near3.length > 3) near3.pop();
          }
        }
        ox[i] += (tx - ox[i]) * ease;
        oy[i] += (ty - oy[i]) * ease;
        const x = bx + ox[i];
        const y = by + oy[i];
        nearArr[i] = near;
        pos[i].x = x;
        pos[i].y = y;
        flash[i] = Math.max(0, flash[i] - dt * 2.2);
        const el = nodeRefs.current[i];
        if (el) {
          el.setAttribute("cx", x.toFixed(1));
          el.setAttribute("cy", y.toFixed(1));
          el.setAttribute("r", (n.r * (n.lobo === activeRef.current ? 1.35 : 1) * (1 + nearArr[i] * 0.9) + flash[i] * 5).toFixed(2));
        }
      }
      for (let k = 0; k < links.length; k++) {
        const el = linkRefs.current[k];
        if (!el) continue;
        const [a, b] = links[k];
        el.setAttribute("x1", pos[a].x.toFixed(1));
        el.setAttribute("y1", pos[a].y.toFixed(1));
        el.setAttribute("x2", pos[b].x.toFixed(1));
        el.setAttribute("y2", pos[b].y.toFixed(1));
      }
      spineList.forEach(({ j }, s) => {
        const el = spineRefs.current[s];
        if (!el) return;
        el.setAttribute("x2", pos[j].x.toFixed(1));
        el.setAttribute("y2", pos[j].y.toFixed(1));
      });

      // il cursore: alone e tre fili verso le palline più vicine
      const glow = cursorRef.current;
      if (glow) {
        if (m) {
          glow.setAttribute("transform", `translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})`);
          glow.setAttribute("opacity", "1");
        } else glow.setAttribute("opacity", "0");
      }
      for (let k = 0; k < 3; k++) {
        const el = tendrilRefs.current[k];
        if (!el) continue;
        const nn = near3[k];
        if (m && nn && nn.d < 230) {
          el.setAttribute("x1", m.x.toFixed(1));
          el.setAttribute("y1", m.y.toFixed(1));
          el.setAttribute("x2", pos[nn.i].x.toFixed(1));
          el.setAttribute("y2", pos[nn.i].y.toFixed(1));
          el.setAttribute("stroke", colors[nodi[nn.i].lobo]);
          el.setAttribute("opacity", (1 - nn.d / 230).toFixed(2));
        } else el.setAttribute("opacity", "0");
      }
      // muovendo il mouse si accendono impulsi dalla pallina più vicina
      if (m && near3[0] && near3[0].d < 120) {
        if (!lastSpawn || Math.hypot(m.x - lastSpawn.x, m.y - lastSpawn.y) > 45) {
          lastSpawn = { x: m.x, y: m.y };
          const from = near3[0].i;
          flash[from] = 1;
          const next = adj[from];
          if (next.length) {
            const k = next[Math.floor(rand() * next.length)];
            pulses[spawnIdx % pulses.length] = { link: k, from, t: 0, speed: 1.2 + rand() * 0.6 };
            spawnIdx++;
          }
        }
      } else if (!m) lastSpawn = null;

      // impulsi
      pulses.forEach((p, idx) => {
        p.t += dt * p.speed;
        let ax: number, ay: number, bx: number, by: number, to: number;
        if (p.link < 0) {
          to = -1 - p.link;
          ax = SILVIO[0];
          ay = SILVIO[1];
          bx = pos[to].x;
          by = pos[to].y;
        } else {
          const [a, b] = links[p.link];
          to = p.from === a ? b : a;
          ax = pos[p.from].x;
          ay = pos[p.from].y;
          bx = pos[to].x;
          by = pos[to].y;
        }
        if (p.t >= 1) {
          flash[to] = 1;
          // prosegue su un collegamento vicino, ogni tanto ricomincia da capo
          const next = adj[to];
          if (next.length && rand() < 0.82) {
            const k = next[Math.floor(rand() * next.length)];
            pulses[idx] = { link: k, from: to, t: 0, speed: 0.7 + rand() * 0.8 };
          } else {
            pulses[idx] = newPulse();
          }
          return;
        }
        const el = pulseRefs.current[idx];
        if (!el) return;
        const x = ax + (bx - ax) * p.t;
        const y = ay + (by - ay) * p.t;
        el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        el.setAttribute("opacity", Math.sin(Math.PI * Math.min(1, p.t)).toFixed(2));
        const lobo = nodi[to].lobo;
        el.setAttribute("color", colors[lobo]);
      });

      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    });
    if (rootRef.current) io.observe(rootRef.current);
    const onVis = () => (document.hidden || !visible ? stop() : start());
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [colors]);

  const toSvg = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const loboAt = (x: number, y: number) => {
    let best = -1;
    let bestD = Infinity;
    LOBI.forEach((l, i) => {
      const d = Math.hypot((x - l.cx) / l.rx, (y - l.cy) / l.ry);
      if (d < 1.15 && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  };

  const pick = (area: string) => {
    setPicked(true);
    setActive(area);
  };

  return (
    <div
      ref={rootRef}
      className="relative overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-xl"
      style={{ containerType: "inline-size" }}
    >
      <style>{CSS}</style>

      {/* Badge superiori */}
      <div className="absolute inset-x-4 top-4 z-20 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-eic-orange-dark sm:px-3 sm:text-[10px]">
          Memoria aziendale
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700 sm:px-3 sm:text-[10px]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          Live azienda
        </span>
      </div>

      {/* Il cervello */}
      <div className="relative mt-10 aspect-[10/8] w-full sm:mt-8 sm:aspect-[10/7.4]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 size-full"
          role="img"
          aria-label="Un cervello fatto di collegamenti: ogni area è un reparto AI, Silvio al centro coordina tutto"
          onPointerMove={(e) => {
            const p = toSvg(e);
            if (!p) return;
            if (e.pointerType === "mouse") mouse.current = p;
            const li = loboAt(p.x, p.y);
            if (li >= 0 && e.pointerType === "mouse" && LOBI[li].area !== active) pick(LOBI[li].area);
          }}
          onPointerLeave={() => {
            mouse.current = null;
          }}
          onClick={(e) => {
            const p = toSvg(e as unknown as React.PointerEvent);
            if (!p) return;
            const li = loboAt(p.x, p.y);
            if (li >= 0) pick(LOBI[li].area);
          }}
        >
          <defs>
            <filter id="cervello-soft" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="28" />
            </filter>
            <radialGradient id="cervello-pulse">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.55" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* sagoma del cervello: contorno dell'unione dei lobi, interno pulito */}
          <g>
            {LOBI.map((l) => (
              <ellipse key={`o-${l.area}`} cx={l.cx} cy={l.cy} rx={l.rx + 34} ry={l.ry + 34} fill="none" stroke="#e2e8f0" strokeWidth="5" />
            ))}
            {LOBI.map((l) => (
              <ellipse key={`f-${l.area}`} cx={l.cx} cy={l.cy} rx={l.rx + 32} ry={l.ry + 32} fill="#ffffff" />
            ))}
          </g>

          {/* le aree, come macchie di colore morbide */}
          <g filter="url(#cervello-soft)">
            {LOBI.map((l, i) => (
              <ellipse
                key={l.area}
                cx={l.cx}
                cy={l.cy}
                rx={l.rx * 0.95}
                ry={l.ry * 0.95}
                fill={colors[i]}
                opacity={i === activeLobo ? 0.22 : 0.08}
                style={{ transition: "opacity 500ms ease" }}
              />
            ))}
          </g>

          {/* solchi */}
          <g fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" opacity="0.55">
            {SOLCHI.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>

          {/* collegamenti */}
          <g strokeLinecap="round">
            {NET.links.map(([a, b], k) => {
              const la = NET.nodi[a].lobo;
              const lb = NET.nodi[b].lobo;
              const on = la === activeLobo && lb === activeLobo;
              return (
                <line
                  key={k}
                  ref={(el) => {
                    linkRefs.current[k] = el;
                  }}
                  x1={NET.nodi[a].x}
                  y1={NET.nodi[a].y}
                  x2={NET.nodi[b].x}
                  y2={NET.nodi[b].y}
                  stroke={on ? colors[la] : "#94a3b8"}
                  strokeOpacity={on ? 0.75 : 0.28}
                  strokeWidth={on ? 1.8 : 1.1}
                />
              );
            })}
          </g>

          {/* vie maestre da Silvio */}
          <g strokeLinecap="round" strokeDasharray="5 6">
            {SPINE_LIST.map(({ j, li }, s) => (
              <line
                key={`${li}-${j}`}
                ref={(el) => {
                  spineRefs.current[s] = el;
                }}
                x1={SILVIO[0]}
                y1={SILVIO[1]}
                x2={NET.nodi[j].x}
                y2={NET.nodi[j].y}
                stroke={li === activeLobo ? colors[li] : "#F97415"}
                strokeOpacity={li === activeLobo ? 0.9 : 0.35}
                strokeWidth={li === activeLobo ? 2.2 : 1.4}
              >
                <animate attributeName="stroke-dashoffset" values="0;-22" dur="1s" repeatCount="indefinite" />
              </line>
            ))}
          </g>

          {/* palline */}
          <g>
            {NET.nodi.map((n, i) => (
              <circle
                key={i}
                ref={(el) => {
                    nodeRefs.current[i] = el;
                  }}
                cx={n.x}
                cy={n.y}
                r={n.r}
                fill={colors[n.lobo]}
                fillOpacity={n.lobo === activeLobo ? 1 : 0.55}
                stroke="#fff"
                strokeWidth="1.5"
                style={{ transition: "fill-opacity 400ms ease" }}
              />
            ))}
          </g>

          {/* il cursore */}
          <g strokeLinecap="round">
            {[0, 1, 2].map((k) => (
              <line
                key={k}
                ref={(el) => {
                  tendrilRefs.current[k] = el;
                }}
                strokeWidth="2"
                strokeDasharray="2 5"
                opacity="0"
              />
            ))}
          </g>
          <g ref={cursorRef} opacity="0" style={{ transition: "opacity 300ms ease" }} pointerEvents="none">
            <circle r="70" fill="#F97415" opacity="0.08" />
            <circle r="26" fill="none" stroke="#F97415" strokeOpacity="0.5" strokeWidth="1.5">
              <animate attributeName="r" values="18;34;18" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle r="4" fill="#F97415" />
          </g>

          {/* impulsi */}
          <g>
            {Array.from({ length: 16 }, (_, i) => (
              <g key={i} ref={(el) => {
                    pulseRefs.current[i] = el;
                  }} opacity="0" color="#F97415">
                <circle r="13" fill="url(#cervello-pulse)" />
                <circle r="3.6" fill="currentColor" />
                <circle r="1.6" fill="#fff" />
              </g>
            ))}
          </g>
        </svg>

        {/* Silvio al centro */}
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(SILVIO[0] / W) * 100}%`, top: `${(SILVIO[1] / H) * 100}%` }}
        >
          <span
            className="cervello-anim absolute left-1/2 top-1/2 block h-[clamp(88px,22cqw,150px)] w-[clamp(88px,22cqw,150px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-400/40 blur-md"
            style={{ animation: "cervello-halo 3.4s ease-in-out infinite" }}
          />
          <span
            className="cervello-anim absolute left-1/2 top-1/2 -ml-[calc(clamp(80px,19cqw,128px)/2)] -mt-[calc(clamp(80px,19cqw,128px)/2)] block h-[clamp(80px,19cqw,128px)] w-[clamp(80px,19cqw,128px)] rounded-full border-2 border-dashed border-orange-300"
            style={{ animation: "cervello-ring 18s linear infinite" }}
          />
          <span className="relative block h-[clamp(72px,17cqw,118px)] w-[clamp(72px,17cqw,118px)] overflow-hidden rounded-full bg-white shadow-[0_10px_30px_rgba(249,116,21,0.35)] ring-4 ring-orange-200">
            <img
              src="/images/silvio/silvio-busto.png"
              alt="Silvio, la regia AI di Edilizia in Cloud"
              width={360}
              height={360}
              loading="lazy"
              decoding="async"
              className="absolute left-1/2 top-[6%] block h-[112%] w-[112%] max-w-none -translate-x-1/2"
            />
          </span>
          <span className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-orange-200 bg-white px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-eic-orange-dark shadow-sm sm:text-[10px]">
            Silvio · Regia AI
          </span>
        </div>

        {/* Etichette delle aree */}
        <div className="absolute inset-0 text-[clamp(9px,1.9cqw,12px)]">
          {LOBI.map((l) => {
            const g = byName(l.area);
            const on = active === l.area;
            return (
              <button
                key={l.area}
                type="button"
                onPointerEnter={(e) => e.pointerType === "mouse" && pick(l.area)}
                onFocus={() => pick(l.area)}
                onClick={() => pick(l.area)}
                className="cervello-chip absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-[0.5em] rounded-full border bg-white/95 py-[0.35em] pl-[0.4em] pr-[0.9em] shadow-sm backdrop-blur"
                style={{
                  left: `${l.chip.x}%`,
                  top: `${l.chip.y}%`,
                  borderColor: on ? g.color : "#e5e7eb",
                  boxShadow: on ? `0 8px 24px ${g.color}40` : undefined,
                  transform: `translate(-50%, -50%) scale(${on ? 1.06 : 1})`,
                }}
              >
                <span className="flex h-[1.9em] w-[1.9em] items-center justify-center rounded-full" style={{ backgroundColor: `${g.color}1f`, color: g.color }}>
                  <g.icon className="h-[1.1em] w-[1.1em]" />
                </span>
                <span className="whitespace-nowrap font-black text-[#111111]">{g.area}</span>
                <span className="hidden whitespace-nowrap text-[0.8em] font-bold uppercase tracking-widest sm:inline" style={{ color: on ? g.color : "#9ca3af" }}>
                  {g.agents.length} AI
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pannello: le persone AI dell'area attiva */}
      <div className="m-3 rounded-2xl border border-gray-200 bg-slate-50 p-3 sm:m-4 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${activeGroup.color}1f`, color: activeGroup.color }}>
              <activeGroup.icon className="h-4 w-4" />
            </span>
            <p className="text-sm font-black text-[#111111]">{activeGroup.area}</p>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{activeGroup.agents.length} persone AI</span>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Attivo
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {activeGroup.agents.map((agent) => (
            <span key={agent} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-700 sm:text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: activeGroup.color }} />
              {agent}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-4 text-gray-500 sm:text-[11px]">
          Silvio legge i dati e attiva il reparto giusto — passa sul cervello o tocca un reparto per vedere le sue persone AI.
        </p>
      </div>
    </div>
  );
}
