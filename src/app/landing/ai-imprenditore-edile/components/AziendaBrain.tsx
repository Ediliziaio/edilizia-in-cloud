import {
  Banknote,
  Bot,
  BrainCircuit,
  Building2,
  CalendarCheck,
  FileText,
  PackageCheck,
  ReceiptText,
  Users,
} from "lucide-react";
import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";
import { FadeUp } from "./FadeUp";

const graphNodes = [
  { id: "silvio", label: "Silvio AI", detail: "Cervello aziendale", icon: BrainCircuit, x: 50, y: 47, size: "core" },
  { id: "crm", label: "CRM", detail: "lead, clienti, storico", icon: Users, x: 17, y: 18, size: "medium" },
  { id: "preventivi", label: "Preventivi", detail: "offerte, aperture, margini", icon: FileText, x: 22, y: 44, size: "medium" },
  { id: "commesse", label: "Commesse", detail: "stato lavori e SAL", icon: Building2, x: 23, y: 70, size: "medium" },
  { id: "cantieri", label: "Cantieri", detail: "foto, ore, rapportini", icon: CalendarCheck, x: 52, y: 18, size: "medium" },
  { id: "magazzino", label: "Magazzino", detail: "DDT, lotti, materiali", icon: PackageCheck, x: 78, y: 24, size: "medium" },
  { id: "fatture", label: "Fatture", detail: "SDI, scadenze, documenti", icon: ReceiptText, x: 80, y: 52, size: "medium" },
  { id: "cassa", label: "Cassa", detail: "incassi 30/60/90 giorni", icon: Banknote, x: 72, y: 76, size: "medium" },
  { id: "fornitori", label: "Fornitori", detail: "prezzi e consegne", icon: PackageCheck, x: 61, y: 34, size: "small" },
  { id: "squadre", label: "Squadre", detail: "ore, presenze, posa", icon: Users, x: 39, y: 31, size: "small" },
  { id: "margini", label: "Margini", detail: "preventivo vs consuntivo", icon: Banknote, x: 38, y: 63, size: "small" },
  { id: "documenti", label: "Documenti", detail: "contratti, foto, DDT", icon: FileText, x: 64, y: 61, size: "small" },
  { id: "alert", label: "Alert", detail: "priorità automatiche", icon: Bot, x: 50, y: 82, size: "small" },
];

const connections = [
  ["silvio", "crm"],
  ["silvio", "preventivi"],
  ["silvio", "commesse"],
  ["silvio", "cantieri"],
  ["silvio", "magazzino"],
  ["silvio", "fatture"],
  ["silvio", "cassa"],
  ["preventivi", "crm"],
  ["preventivi", "margini"],
  ["preventivi", "commesse"],
  ["commesse", "cantieri"],
  ["commesse", "margini"],
  ["commesse", "documenti"],
  ["cantieri", "squadre"],
  ["cantieri", "documenti"],
  ["magazzino", "fornitori"],
  ["magazzino", "cantieri"],
  ["fatture", "documenti"],
  ["fatture", "cassa"],
  ["cassa", "alert"],
  ["margini", "alert"],
  ["documenti", "alert"],
];

const mobileGraphNodes = [
  { id: "silvio", x: 50, y: 48, size: "core" },
  { id: "crm", x: 20, y: 18, size: "medium" },
  { id: "preventivi", x: 25, y: 38, size: "medium" },
  { id: "commesse", x: 24, y: 68, size: "medium" },
  { id: "cantieri", x: 74, y: 18, size: "medium" },
  { id: "magazzino", x: 78, y: 43, size: "medium" },
  { id: "fatture", x: 76, y: 66, size: "medium" },
  { id: "cassa", x: 50, y: 83, size: "medium" },
];

const mobileGraphConnections = [
  ["silvio", "crm"],
  ["silvio", "preventivi"],
  ["silvio", "commesse"],
  ["silvio", "cantieri"],
  ["silvio", "magazzino"],
  ["silvio", "fatture"],
  ["silvio", "cassa"],
  ["preventivi", "crm"],
  ["preventivi", "commesse"],
  ["commesse", "cantieri"],
  ["magazzino", "cantieri"],
  ["fatture", "cassa"],
];

gsap.registerPlugin(useGSAP, ScrollTrigger);

function relatedTo(activeId: string, nodeId: string) {
  if (activeId === nodeId || activeId === "silvio" || nodeId === "silvio") return true;
  return connections.some(([a, b]) => (a === activeId && b === nodeId) || (b === activeId && a === nodeId));
}

export function AziendaBrain() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeNodeId, setActiveNodeId] = useState("silvio");
  const activeNode = graphNodes.find((node) => node.id === activeNodeId) ?? graphNodes[0];

  useGSAP(() => {
    const motion = gsap.matchMedia();

    motion.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(".brain-shell, .brain-graph-node, .brain-path, .brain-synapse, .brain-mobile-node, .brain-mobile-path, .brain-mobile-pulse", {
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
          trigger: ".brain-shell",
          start: "top 92%",
          once: true,
        },
        defaults: { ease: "power3.out" },
      });

      timeline
        .from(".brain-shell", { opacity: 0, y: 38, scale: 0.98, duration: 0.72 })
        .from(".brain-path", { strokeDashoffset: 220, duration: 1, stagger: 0.025 }, 0.2)
        .from(".brain-synapse", { scale: 0.2, transformOrigin: "center", duration: 0.32, stagger: 0.02 }, 0.44)
        .from(".brain-mobile-path", { strokeDashoffset: 180, duration: 0.9, stagger: 0.04 }, 0.18)
        .from(".brain-mobile-node", { scale: 0.9, y: 8, duration: 0.38, stagger: 0.035 }, 0.26);

      gsap.to(".brain-path, .brain-mobile-path", {
        strokeDashoffset: "-=220",
        duration: 7.4,
        repeat: -1,
        ease: "none",
      });

      gsap.to(".brain-synapse", {
        scale: 1.6,
        opacity: 0.22,
        transformOrigin: "center",
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: { each: 0.08, from: "random" },
      });

      gsap.to(".brain-synapse", {
        y: (index) => (index % 2 === 0 ? -3 : 3),
        duration: 4.2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.07,
      });

      gsap.to(".brain-mobile-node", {
        y: (index) => (index % 2 === 0 ? -3 : 3),
        duration: 3.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.08,
      });
    });

    return () => motion.revert();
  }, { scope: sectionRef });

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-eic-navy px-5 py-20 text-white md:px-8 lg:py-28">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-24 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-eic-orange/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl">
        <FadeUp className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">Il cervello operativo</p>
          <h2 className="mt-5 text-[clamp(2.05rem,10vw,5.4rem)] font-black leading-[1.01] tracking-[-0.045em] md:tracking-[-0.055em]">
            Tutte le informazioni della tua azienda dentro una sola mente operativa.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/68">
            Passa sopra i nodi: Silvio evidenzia relazioni, documenti, commesse, cassa, magazzino e cantieri come una
            mappa viva della tua impresa.
          </p>
          <div className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {["Dati collegati", "Zoom sulle relazioni", "Priorità automatiche", "Controllo da titolare"].map((item) => (
              <div key={item} className="rounded-md border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-bold text-white/78">
                <span className="mr-2 text-eic-orange">✓</span>
                {item}
              </div>
            ))}
          </div>
        </FadeUp>

        <FadeUp transition={{ delay: 0.1 }} className="mt-10">
          <div
            className="brain-shell relative overflow-hidden rounded-md border border-white/12 bg-[#111827]/90 p-4 shadow-2xl shadow-black/25 backdrop-blur md:min-h-[680px] md:p-6"
          >
            <div
              className="absolute inset-0 opacity-70"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 44%, rgba(249,115,22,.20), transparent 20%), radial-gradient(circle at 78% 26%, rgba(56,189,248,.16), transparent 24%), radial-gradient(circle at 22% 72%, rgba(16,185,129,.13), transparent 25%)",
              }}
            />

            <div className="relative z-[3] md:hidden">
              <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.055] px-3 py-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-eic-orange">Tocca i nodi</span>
                <span className="rounded-full bg-emerald-400/14 px-2.5 py-1 text-[11px] font-black text-emerald-100">Live</span>
              </div>

              <div className="relative h-[440px] overflow-hidden rounded-md border border-white/12 bg-[#07131f]/88 shadow-2xl shadow-black/25">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(249,115,22,.18),transparent_25%),radial-gradient(circle_at_18%_72%,rgba(16,185,129,.14),transparent_24%),radial-gradient(circle_at_78%_26%,rgba(56,189,248,.12),transparent_28%)]" />
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {mobileGraphConnections.map(([from, to]) => {
                    const a = mobileGraphNodes.find((node) => node.id === from);
                    const b = mobileGraphNodes.find((node) => node.id === to);
                    if (!a || !b) return null;
                    const highlighted = activeNodeId === "silvio" || from === activeNodeId || to === activeNodeId;
                    return (
                      <line
                        key={`mobile-${from}-${to}`}
                        className="brain-mobile-path transition-all duration-300"
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={highlighted ? "rgba(249,115,22,.9)" : "rgba(255,255,255,.16)"}
                        strokeWidth={highlighted ? 0.52 : 0.26}
                        strokeDasharray={highlighted ? "3 2.5" : "1.5 3.5"}
                      />
                    );
                  })}
                  {mobileGraphNodes
                    .filter((node) => node.id !== "silvio")
                    .map((node) => (
                      <circle
                        key={`pulse-${node.id}`}
                        className="brain-mobile-pulse"
                        cx={node.x}
                        cy={node.y}
                        r={activeNodeId === node.id ? 2.4 : 1.35}
                        fill={activeNodeId === node.id ? "rgba(249,115,22,.35)" : "rgba(255,255,255,.12)"}
                      />
                    ))}
                </svg>

                {mobileGraphNodes.map((mobileNode) => {
                  const node = graphNodes.find((item) => item.id === mobileNode.id) ?? graphNodes[0];
                  const Icon = node.icon;
                  const active = activeNodeId === node.id;
                  const core = mobileNode.id === "silvio";
                  const related = relatedTo(activeNodeId, node.id);
                  return (
                    <button
                      key={mobileNode.id}
                      type="button"
                      onClick={() => setActiveNodeId(node.id)}
                      className={cn(
                        "brain-mobile-node absolute z-[4] -translate-x-1/2 -translate-y-1/2 border text-left shadow-xl backdrop-blur transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eic-orange",
                        core
                          ? "flex h-24 w-24 flex-col items-center justify-center rounded-full border-eic-orange/55 bg-eic-navy text-center text-eic-orange shadow-[0_0_42px_rgba(249,115,22,.28)]"
                          : "w-[112px] rounded-md border-white/14 bg-white/[0.92] px-2.5 py-2 text-eic-navy",
                        active && !core && "z-[6] scale-105 border-eic-orange bg-white shadow-eic-orange/25",
                        active && core && "scale-105",
                        !related && "opacity-55",
                      )}
                      style={{ left: `${mobileNode.x}%`, top: `${mobileNode.y}%` }}
                      aria-label={`${node.label}: ${node.detail}`}
                    >
                      {core ? (
                        <>
                          <Icon className="h-8 w-8" strokeWidth={1.5} />
                          <strong className="mt-1 text-sm text-white">{node.label}</strong>
                          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">{node.detail}</span>
                        </>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-eic-orange text-white">
                            <Icon className="h-4 w-4" strokeWidth={1.5} />
                          </span>
                          <span className="min-w-0">
                            <strong className="block truncate text-xs text-eic-navy">{node.label}</strong>
                            <span className="block truncate text-[10px] text-eic-navy/58">{node.detail}</span>
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}

              </div>

              <div className="mt-3 rounded-md border border-emerald-300/18 bg-emerald-400/10 p-3 text-sm leading-6 text-emerald-50">
                <strong className="text-white">{activeNode.label}</strong> collega {activeNode.detail} agli altri dati aziendali.
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {["DDT", "Cassa", "SAL", "Commesse"].map((label) => (
                  <div key={label} className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-2 text-center text-xs font-black uppercase tracking-[0.14em] text-white/62">
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative hidden min-h-[580px] md:block">
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <filter id="graph-line-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="0.9" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {connections.map(([from, to]) => {
                  const a = graphNodes.find((node) => node.id === from);
                  const b = graphNodes.find((node) => node.id === to);
                  if (!a || !b) return null;
                  const highlighted = activeNodeId === "silvio" || from === activeNodeId || to === activeNodeId;
                  return (
                    <line
                      key={`${from}-${to}`}
                      className="brain-path transition-all duration-300"
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={highlighted ? "rgba(249,115,22,0.78)" : "rgba(255,255,255,0.14)"}
                      strokeWidth={highlighted ? 0.42 : 0.2}
                      strokeDasharray={highlighted ? "2 2.8" : "1 3.2"}
                      filter={highlighted ? "url(#graph-line-glow)" : undefined}
                    />
                  );
                })}
                {graphNodes
                  .filter((node) => node.size === "small")
                  .map((node) => (
                    <circle
                      key={`synapse-${node.id}`}
                      className="brain-synapse transition-opacity duration-300"
                      cx={node.x}
                      cy={node.y}
                      r={activeNodeId === node.id ? 1.2 : 0.72}
                      fill={relatedTo(activeNodeId, node.id) ? "#F97316" : "rgba(255,255,255,0.45)"}
                    />
                  ))}
              </svg>

              {graphNodes.map((node) => {
                const Icon = node.icon;
                const active = activeNodeId === node.id;
                const related = relatedTo(activeNodeId, node.id);
                const core = node.size === "core";

                return (
                  <button
                    key={node.id}
                    type="button"
                    data-node-id={node.id}
                    onPointerEnter={() => setActiveNodeId(node.id)}
                    onMouseOver={() => setActiveNodeId(node.id)}
                    onMouseEnter={() => setActiveNodeId(node.id)}
                    onFocus={() => setActiveNodeId(node.id)}
                    className={cn(
                      "brain-graph-node absolute z-[3] -translate-x-1/2 -translate-y-1/2 border text-left shadow-2xl backdrop-blur transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eic-orange",
                      core
                        ? "flex h-24 w-24 items-center justify-center rounded-full border-eic-orange/45 bg-eic-navy text-eic-orange"
                        : "w-[128px] rounded-md border-white/20 bg-white/82 px-3 py-2 text-eic-navy",
                      active && !core && "z-[5] w-[168px] scale-110 border-eic-orange bg-white shadow-eic-orange/25",
                      active && core && "scale-110 shadow-eic-orange/30",
                      !related && "opacity-25 blur-[0.5px]",
                    )}
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    aria-label={`${node.label}: ${node.detail}`}
                  >
                    {core ? (
                      <>
                        <span className="flex h-full w-full items-center justify-center">
                          <Icon className="h-11 w-11" strokeWidth={1.45} />
                        </span>
                        <span className="pointer-events-none absolute left-1/2 top-full mt-2 w-max -translate-x-1/2 rounded-md border border-white/12 bg-black/72 px-3 py-2 text-center text-[11px] leading-4 text-white shadow-xl">
                          <strong className="block text-xs text-white">{node.label}</strong>
                          <span className="text-white/58">{node.detail}</span>
                        </span>
                      </>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-eic-orange text-white shadow-lg shadow-eic-orange/20">
                          <Icon className="h-4 w-4" strokeWidth={1.5} />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs text-eic-navy">{node.label}</strong>
                          <span className="block truncate text-[10px] text-eic-navy/55">{node.detail}</span>
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}

              <div className="absolute bottom-4 left-4 z-[4] max-w-[300px] rounded-md border border-emerald-300/18 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-50 backdrop-blur">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-400/16 text-emerald-200">
                    <Bot className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <p>
                    <strong className="text-white">{activeNode.label}:</strong> {activeNode.detail}. Silvio mostra solo le connessioni che contano.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </FadeUp>
      </div>
    </section>
  );
}
