import { Bot, BrainCircuit, Cable, Gauge, Megaphone, ReceiptText, Sparkles } from "lucide-react";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { infrastrutture } from "../content";
import { FadeUp } from "./FadeUp";
import { InfrastrutturaBlock } from "./InfrastrutturaBlock";

const moduleIcons = [BrainCircuit, Bot, ReceiptText, Gauge, Megaphone, Cable];
const modulePositions = [
  { x: 50, y: 13 },
  { x: 76, y: 29 },
  { x: 75, y: 66 },
  { x: 50, y: 84 },
  { x: 24, y: 66 },
  { x: 24, y: 29 },
];

gsap.registerPlugin(useGSAP, ScrollTrigger);

function ModuleConstellation() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const motion = gsap.matchMedia();

    motion.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(".module-orbit-node, .module-orbit-line, .module-orbit-core", { opacity: 1, scale: 1, clearProps: "transform" });
    });

    motion.add("(prefers-reduced-motion: no-preference)", () => {
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: ref.current,
          start: "top 82%",
          once: true,
        },
        defaults: { ease: "power3.out" },
      });

      timeline
        .from(".module-orbit-core", { opacity: 0, scale: 0.72, duration: 0.5 })
        .from(".module-orbit-line", { opacity: 0, strokeDashoffset: 180, duration: 0.8, stagger: 0.035 }, 0.16)
        .from(".module-orbit-node", { opacity: 0, scale: 0.55, duration: 0.42, stagger: { each: 0.05, from: "center" } }, 0.28);

      gsap.to(".module-orbit-line", {
        strokeDashoffset: "-=180",
        duration: 6,
        repeat: -1,
        ease: "none",
      });

      gsap.to(".module-orbit-node", {
        y: (index) => (index % 2 === 0 ? -7 : 7),
        duration: 3.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.1,
      });
    });

    return () => motion.revert();
  }, { scope: ref });

  return (
    <div ref={ref} className="relative mx-auto min-h-[360px] w-full max-w-[430px] overflow-hidden rounded-md border border-eic-navy/10 bg-eic-navy p-4 text-white shadow-2xl shadow-eic-navy/16">
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
        }}
      />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {modulePositions.map((node, index) => (
          <line
            key={`${node.x}-${node.y}`}
            className="module-orbit-line"
            x1="50"
            y1="50"
            x2={node.x}
            y2={node.y}
            stroke="rgba(249,115,22,0.62)"
            strokeWidth="0.45"
            strokeDasharray="2 3"
          />
        ))}
      </svg>

      <div className="module-orbit-core absolute left-1/2 top-1/2 z-[2] flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-eic-orange/40 bg-white text-eic-navy shadow-2xl shadow-eic-orange/20">
        <Sparkles className="h-7 w-7 text-eic-orange" strokeWidth={1.5} />
        <span className="mt-1 text-[11px] font-black uppercase tracking-[0.16em]">Regia</span>
      </div>

      {infrastrutture.blocks.map((block, index) => {
        const position = modulePositions[index] ?? modulePositions[0];
        const Icon = moduleIcons[index] ?? BrainCircuit;
        return (
          <div
            key={block.letter}
            className="module-orbit-node absolute z-[3] flex w-[126px] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-md border border-white/14 bg-white/10 px-3 py-2 text-left shadow-xl shadow-black/20 backdrop-blur"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-eic-orange text-white">
              <Icon className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-black text-white">{block.title}</span>
              <span className="block truncate text-[10px] text-white/52">{block.subtitle}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function InfrastruttureGrid() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(30,58,95,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(30,58,95,.055) 1px, transparent 1px)",
          backgroundSize: "58px 58px",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-5 py-24 md:px-8 lg:py-32">
        <FadeUp className="grid gap-8 rounded-md border border-eic-navy/10 bg-white/85 p-6 shadow-2xl shadow-eic-navy/6 backdrop-blur md:p-10 lg:grid-cols-[1fr_0.78fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">{infrastrutture.eyebrow}</p>
            <h2 className="mt-5 max-w-4xl text-display-lg font-black text-eic-ink">{infrastrutture.title}</h2>
            <div className="mt-7 max-w-3xl space-y-4 text-lg leading-8 text-eic-ink/68">
              {infrastrutture.subtitle.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-8 grid max-w-3xl gap-2 text-sm font-bold text-eic-navy/70 sm:grid-cols-3">
              {["Vendite", "Cantieri", "Cassa"].map((item) => (
                <span key={item} className="rounded-full border border-eic-navy/10 bg-eic-cream px-4 py-2 text-center">
                  {item} collegati
                </span>
              ))}
            </div>
          </div>
          <div>
            <ModuleConstellation />
          </div>
        </FadeUp>
      </div>
      {infrastrutture.blocks.map((block, index) => (
        <InfrastrutturaBlock key={block.letter} block={block} index={index} />
      ))}
    </section>
  );
}
