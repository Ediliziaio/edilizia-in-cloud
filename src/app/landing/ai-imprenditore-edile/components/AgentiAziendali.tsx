import {
  Banknote,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  Calculator,
  ClipboardCheck,
  FileSearch,
  Gavel,
  HardHat,
  Megaphone,
  ReceiptText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useRef, useState, type ComponentType } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";
import { companyAgents } from "../content";
import { FadeUp } from "./FadeUp";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const iconByGroup: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  Direzione: BrainCircuit,
  Finanza: Banknote,
  Cantieri: HardHat,
  Vendite: BriefcaseBusiness,
  Clienti: Users,
  Crescita: Megaphone,
  Persone: Users,
  Regole: ShieldCheck,
};

const groupTone: Record<string, string> = {
  Direzione: "border-eic-orange/45 bg-eic-orange/16 text-eic-orange",
  Finanza: "border-emerald-300/35 bg-emerald-400/12 text-emerald-200",
  Cantieri: "border-sky-300/35 bg-sky-400/12 text-sky-200",
  Vendite: "border-amber-300/35 bg-amber-400/12 text-amber-200",
  Clienti: "border-violet-300/35 bg-violet-400/12 text-violet-200",
  Crescita: "border-pink-300/35 bg-pink-400/12 text-pink-200",
  Persone: "border-cyan-300/35 bg-cyan-400/12 text-cyan-200",
  Regole: "border-rose-300/35 bg-rose-400/12 text-rose-200",
};

const detailIcons = [Calculator, ReceiptText, Building2, FileSearch, Gavel, ClipboardCheck];

function getPosition(index: number, total: number) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  const radiusX = index % 2 === 0 ? 39 : 32;
  const radiusY = index % 2 === 0 ? 39 : 31;
  return {
    x: 50 + Math.cos(angle) * radiusX,
    y: 50 + Math.sin(angle) * radiusY,
  };
}

export function AgentiAziendali() {
  const sectionRef = useRef<HTMLElement>(null);
  const agents = companyAgents.agents;
  const [activeAgentKey, setActiveAgentKey] = useState("silvio");
  const activeAgent = agents.find((agent) => agent.key === activeAgentKey) ?? agents[0];

  useGSAP(() => {
    const motion = gsap.matchMedia();

    motion.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(".agents-shell, .agents-core, .agent-persona-node, .agent-persona-line, .agent-orbit", {
        opacity: 1,
        scale: 1,
        x: 0,
        y: 0,
        clearProps: "transform",
      });
    });

    motion.add("(prefers-reduced-motion: no-preference)", () => {
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: ".agents-shell",
          start: "top 82%",
          once: true,
        },
        defaults: { ease: "power3.out" },
      });

      timeline
        .from(".agents-core", { opacity: 0, scale: 0.78, duration: 0.55 }, 0.05)
        .from(".agent-persona-line", { opacity: 0, strokeDashoffset: 180, duration: 0.8, stagger: 0.012 }, 0.22)
        .from(".agent-persona-node", {
          opacity: 0,
          scale: 0.72,
          y: 12,
          duration: 0.42,
          stagger: { each: 0.022, from: "center" },
        }, 0.28);

      gsap.to(".agent-persona-line", {
        strokeDashoffset: "-=180",
        duration: 7.8,
        repeat: -1,
        ease: "none",
      });

      gsap.to(".agent-orbit", {
        rotate: 360,
        transformOrigin: "50% 50%",
        duration: 42,
        repeat: -1,
        ease: "none",
      });

      gsap.to(".agent-persona-node", {
        y: (index) => (index % 2 === 0 ? -4 : 4),
        duration: 3.4,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.045,
      });
    });

    return () => motion.revert();
  }, { scope: sectionRef });

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-[#07182a] px-5 py-20 text-white md:px-8 lg:py-28">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.11) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.11) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="pointer-events-none absolute -right-24 top-20 h-[440px] w-[440px] rounded-full bg-sky-400/12 blur-3xl" />
      <div className="pointer-events-none absolute -left-28 bottom-10 h-[420px] w-[420px] rounded-full bg-eic-orange/14 blur-3xl" />

      <div className="relative mx-auto max-w-6xl">
        <FadeUp className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-eic-orange">{companyAgents.eyebrow}</p>
            <h2 className="mt-5 max-w-4xl text-[clamp(2.2rem,4.5vw,4.8rem)] font-black leading-[1.02]">
              {companyAgents.title}
            </h2>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/70">{companyAgents.subtitle}</p>
          </div>
          <div className="rounded-md border border-white/12 bg-white/[0.055] p-5 shadow-xl shadow-black/18 backdrop-blur">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-eic-orange text-2xl font-black text-white shadow-lg shadow-eic-orange/20">
                19
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-eic-orange">persone AI</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-white/74">{companyAgents.proof}</p>
              </div>
            </div>
          </div>
        </FadeUp>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
          <div className="agents-shell relative min-h-[620px] overflow-hidden rounded-md border border-white/12 bg-[#0c1726]/92 p-5 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(249,115,22,.18),transparent_24%),radial-gradient(circle_at_24%_30%,rgba(56,189,248,.12),transparent_26%),radial-gradient(circle_at_80%_70%,rgba(16,185,129,.10),transparent_24%)]" />

            <div className="relative hidden min-h-[570px] md:block">
              <svg className="pointer-events-none absolute inset-0 h-full w-full agent-orbit" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(255,255,255,.08)" strokeDasharray="1 4" />
                <circle cx="50" cy="50" r="39" fill="none" stroke="rgba(249,115,22,.18)" strokeDasharray="1.5 5" />
              </svg>

              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {agents.map((agent, index) => {
                  const { x, y } = getPosition(index, agents.length);
                  const active = agent.key === activeAgentKey;
                  const related = active || agent.group === activeAgent.group || agent.key === "silvio";
                  return (
                    <line
                      key={`line-${agent.key}`}
                      className="agent-persona-line transition-all duration-300"
                      x1="50"
                      y1="50"
                      x2={x}
                      y2={y}
                      stroke={active ? "rgba(249,115,22,.96)" : related ? "rgba(255,255,255,.32)" : "rgba(255,255,255,.08)"}
                      strokeWidth={active ? 0.52 : related ? 0.3 : 0.16}
                      strokeDasharray={active ? "3 2" : "2 3"}
                    />
                  );
                })}
              </svg>

              <div className="agents-core absolute left-1/2 top-1/2 z-[4] flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-eic-orange/45 bg-eic-navy text-center shadow-[0_0_70px_rgba(249,115,22,.25)]">
                <BrainCircuit className="h-10 w-10 text-eic-orange" strokeWidth={1.5} />
                <strong className="mt-2 text-xl">{companyAgents.center.label}</strong>
                <span className="px-5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">{companyAgents.center.role}</span>
              </div>

              {agents.map((agent, index) => {
                const { x, y } = getPosition(index, agents.length);
                const Icon = iconByGroup[agent.group] ?? Bot;
                const tone = groupTone[agent.group] ?? "border-white/18 bg-white/10 text-white";
                const core = agent.key === "silvio";
                const active = agent.key === activeAgentKey;
                const related = active || agent.group === activeAgent.group || agent.key === "silvio";
                return (
                  <button
                    key={agent.key}
                    type="button"
                    onPointerEnter={() => setActiveAgentKey(agent.key)}
                    onFocus={() => setActiveAgentKey(agent.key)}
                    onClick={() => setActiveAgentKey(agent.key)}
                    className={[
                      "agent-persona-node absolute z-[5] -translate-x-1/2 -translate-y-1/2 rounded-md border px-3 py-2 text-left shadow-xl backdrop-blur transition-all duration-300 hover:z-10 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eic-orange",
                      core ? "border-eic-orange bg-eic-orange text-white" : tone,
                      active && "z-10 scale-110 shadow-eic-orange/25 ring-2 ring-eic-orange/70",
                      !related && "opacity-35 blur-[0.3px]",
                    ].join(" ")}
                    style={{ left: `${x}%`, top: `${y}%` }}
                    aria-label={`${agent.name}: ${agent.role}. ${agent.detail}`}
                  >
                    <div className="flex w-[146px] items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/18">
                        <Icon className="h-4 w-4" strokeWidth={1.6} />
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate text-xs text-white">{agent.name}</strong>
                        <span className="block truncate text-[10px] text-white/64">{agent.role}</span>
                      </span>
                    </div>
                  </button>
                );
              })}

              <div className="absolute bottom-4 left-4 z-[6] max-w-[390px] rounded-md border border-white/12 bg-black/34 p-4 text-sm leading-6 text-white/76 backdrop-blur">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-eic-orange text-white">
                    <Bot className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <div>
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-eic-orange">{activeAgent.group}</span>
                    <strong className="mt-1 block text-white">{activeAgent.name}</strong>
                    <p className="mt-1">{activeAgent.detail}</p>
                  </div>
                </div>
              </div>

              <div className="absolute right-4 top-4 z-[6] rounded-full border border-white/12 bg-white/[0.08] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-white/60 backdrop-blur">
                Passa sui nodi
              </div>
            </div>

            <div className="relative z-[3] grid gap-3 md:hidden">
              {companyAgents.groups.map((group, index) => {
                const Icon = detailIcons[index % detailIcons.length];
                return (
                  <div key={group.label} className="rounded-md border border-white/12 bg-white/[0.055] p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-eic-orange text-white">
                        <Icon className="h-5 w-5" strokeWidth={1.5} />
                      </span>
                      <div>
                        <h3 className="font-black text-white">{group.label}</h3>
                        <p className="mt-1 text-sm text-white/58">{group.summary}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {group.agents.map((agent) => (
                        <span key={agent} className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs font-bold text-white/72">
                          {agent}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <FadeUp>
              <div className="rounded-md border border-white/12 bg-white/[0.055] p-6 text-white shadow-xl shadow-black/18">
                <div className="rounded-md border border-eic-orange/24 bg-eic-orange/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-eic-orange">Nodo selezionato</p>
                  <div className="mt-3 flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-eic-orange text-white">
                      <Bot className="h-5 w-5" strokeWidth={1.5} />
                    </span>
                    <div>
                      <h3 className="text-xl font-black">{activeAgent.name}</h3>
                      <p className="text-sm font-semibold text-white/62">{activeAgent.role}</p>
                      <p className="mt-3 text-sm leading-6 text-white/72">{activeAgent.detail}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-eic-orange">Perché cambia il lavoro</p>
                  <h3 className="mt-2 text-2xl font-black">Una regia sola, reparti specializzati.</h3>
                  <div>
                  </div>
                </div>
                <div className="mt-6 grid gap-3">
                  {companyAgents.bullets.map((item) => (
                    <div key={item} className="flex gap-3 rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold leading-6 text-white/74">
                      <span className="text-eic-orange">✓</span>
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid gap-3">
                  {companyAgents.flow.map((step, index) => (
                    <div key={step.label} className="grid grid-cols-[44px_1fr] gap-3 rounded-md border border-eic-orange/18 bg-eic-orange/8 p-4">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-eic-orange text-sm font-black text-white">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                      <p className="font-black text-white">{step.label}</p>
                      <p className="mt-1 text-sm leading-6 text-white/58">{step.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </FadeUp>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {companyAgents.groups.map((group, index) => {
            const Icon = detailIcons[index % detailIcons.length];
            const activeGroup = group.label === activeAgent.group || group.agents.includes(activeAgent.name);
            return (
              <FadeUp key={group.label} transition={{ delay: 0.03 * index }}>
                <article className={cn(
                  "h-full rounded-md border p-4 shadow-lg shadow-black/10 backdrop-blur transition-colors duration-300",
                  activeGroup ? "border-eic-orange/35 bg-eic-orange/10" : "border-white/12 bg-white/[0.045]",
                )}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-eic-orange">
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <h3 className="mt-4 text-base font-black text-white">{group.label}</h3>
                  <p className="mt-1 min-h-[48px] text-sm leading-6 text-white/56">{group.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {group.agents.map((agent) => (
                      <span key={agent} className="rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1 text-[11px] font-bold text-white/72">
                        {agent}
                      </span>
                    ))}
                  </div>
                </article>
              </FadeUp>
            );
          })}
        </div>
      </div>
    </section>
  );
}
