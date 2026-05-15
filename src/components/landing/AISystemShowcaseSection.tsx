import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Brain,
  BriefcaseBusiness,
  Camera,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Euro,
  FileText,
  HardHat,
  LineChart,
  MessageSquare,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

const agentGroups = [
  {
    area: "Direzione",
    agents: ["Silvio", "Assistente titolare", "Brain sistema"],
    icon: Brain,
    color: "#F97415",
  },
  {
    area: "Finanza",
    agents: ["CFO", "Controller", "Commercialista", "Amministrazione"],
    icon: Wallet,
    color: "#22c55e",
  },
  {
    area: "Cantieri",
    agents: ["PM cantiere", "Capocantiere", "Tecnico/RSPP", "Acquisti"],
    icon: HardHat,
    color: "#3b82f6",
  },
  {
    area: "Vendite",
    agents: ["Sales", "Direttore vendite", "Marketing", "Cliente tutor"],
    icon: BriefcaseBusiness,
    color: "#8b5cf6",
  },
  {
    area: "Regole",
    agents: ["HR", "Compliance", "Legale", "Assistente cliente"],
    icon: ShieldCheck,
    color: "#f59e0b",
  },
];

const painFlows = [
  {
    problem: "Non so se sto guadagnando",
    answer: "Silvio controlla margini, costi, ore e materiali, poi prepara azioni concrete: avvisi, report e prossime mosse.",
    icon: LineChart,
  },
  {
    problem: "I preventivi si raffreddano",
    answer: "Invia solleciti, prepara follow-up WhatsApp, ricorda al venditore chi richiamare e quando intervenire.",
    icon: MessageSquare,
  },
  {
    problem: "Magazzino e materiali sono confusi",
    answer: "Collega ordini, DDT, arrivi merce e uscita cantiere, così sa cosa manca prima che il lavoro si blocchi.",
    icon: PackageCheck,
  },
  {
    problem: "Il campo non aggiorna l'ufficio",
    answer: "Genera rapportini, aggiorna il diario lavori, raccoglie foto e ricorda a operai e collaboratori cosa fare.",
    icon: Camera,
  },
];

const aiProductionTools = [
  {
    title: "Analisi computo metrico",
    text: "Carichi il computo, Silvio legge voci, quantità, lavorazioni e segnala incoerenze prima del preventivo.",
    icon: ClipboardList,
    tag: "Computo",
  },
  {
    title: "Generatore preventivi",
    text: "Trasforma computi, listini e richieste cliente in preventivi chiari, completi e pronti da inviare.",
    icon: FileText,
    tag: "Preventivo",
  },
  {
    title: "Preventivi ad alta conversione",
    text: "Riscrive proposta, valore, garanzie, urgenza e follow-up per aiutare il cliente a decidere senza trattare solo sul prezzo.",
    icon: BriefcaseBusiness,
    tag: "Vendita",
  },
  {
    title: "Rapportini automatici",
    text: "Da foto, note vocali e attività di cantiere crea rapportini ordinati e aggiornamenti per ufficio e cliente.",
    icon: Camera,
    tag: "Cantiere",
  },
  {
    title: "Render e prima/dopo",
    text: "Genera visual dimostrativi per far vedere il risultato finale e allegarli alla trattativa o al preventivo.",
    icon: Sparkles,
    tag: "Render",
  },
  {
    title: "Azioni e solleciti",
    text: "Prepara messaggi, solleciti, promemoria e compiti per collaboratori, venditori, ufficio e squadre.",
    icon: MessageSquare,
    tag: "Operativo",
  },
];

const fieldSignals = [
  {
    title: "Foto dal cantiere",
    text: "Silvio collega immagini, note e rapportini alla commessa corretta.",
    metric: "12",
    label: "foto lette",
    icon: Camera,
  },
  {
    title: "Materiali e DDT",
    text: "Arrivi, uscite, lotti e consegne diventano segnali operativi.",
    metric: "4",
    label: "DDT collegati",
    icon: PackageCheck,
  },
  {
    title: "Squadre e tempi",
    text: "Presenze, attività e ritardi arrivano in direzione senza inseguire messaggi.",
    metric: "3",
    label: "squadre attive",
    icon: CalendarClock,
  },
];

function openContactModal() {
  import("@/components/landing/QuickContactModal").then((module) => module.openContactModal());
}

function useGsapSection() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function run() {
      if (!ref.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);

      gsap.registerPlugin(ScrollTrigger);

      const ctx = gsap.context(() => {
        gsap.from("[data-ai-reveal]", {
          opacity: 0,
          y: 28,
          duration: 0.75,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: {
            trigger: ref.current,
            start: "top 72%",
          },
        });

        gsap.to("[data-ai-orbit]", {
          rotate: 360,
          duration: 38,
          repeat: -1,
          ease: "none",
          transformOrigin: "center center",
        });

        gsap.to("[data-ai-line]", {
          strokeDashoffset: -48,
          duration: 2.8,
          repeat: -1,
          ease: "none",
          stagger: 0.12,
        });

        // Skip se nessun target nel DOM (altrimenti GSAP logga warning a
        // ogni mount). data-ai-float è opzionale nel template — se non
        // c'è, salta semplicemente l'animazione.
        if (document.querySelectorAll("[data-ai-float]").length > 0) {
          gsap.to("[data-ai-float]", {
            y: -10,
            duration: 2.4,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            stagger: 0.18,
          });
        }

        gsap.fromTo(
          "[data-ai-scan]",
          { yPercent: -120, opacity: 0 },
          {
            yPercent: 130,
            opacity: 1,
            duration: 2.2,
            repeat: -1,
            ease: "power1.inOut",
            stagger: 0.4,
          }
        );
      }, ref);

      cleanup = () => ctx.revert();
    }

    run();
    return () => cleanup?.();
  }, []);

  return ref;
}

function AiBrainMap() {
  const [activeArea, setActiveArea] = useState(agentGroups[0]);
  const mapRef = useRef<HTMLDivElement>(null);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }

  return (
    <div
      ref={mapRef}
      onPointerMove={handlePointerMove}
      className="group/brain relative min-h-[560px] overflow-hidden rounded-[32px] border border-white/10 bg-[#0a1222] p-5 shadow-2xl max-[520px]:min-h-0 max-[520px]:rounded-[24px] max-[520px]:p-4 lg:min-h-[640px]"
      style={{
        ["--spot-x" as string]: "50%",
        ["--spot-y" as string]: "50%",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(249,116,21,0.22),transparent_32%),radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_78%_72%,rgba(34,197,94,0.14),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover/brain:opacity-100" style={{
        background: "radial-gradient(220px circle at var(--spot-x) var(--spot-y), rgba(249,116,21,.22), transparent 65%)",
      }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)",
        backgroundSize: "42px 42px",
      }} />

      <div data-ai-orbit className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/12 max-[520px]:hidden md:h-[460px] md:w-[460px]" />
      <div data-ai-orbit className="pointer-events-none absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-orange-300/16 max-[520px]:hidden md:h-[330px] md:w-[330px]" />

      <div className="absolute left-1/2 top-1/2 z-10 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-orange-300/40 bg-[#F97415] text-white shadow-[0_0_60px_rgba(249,116,21,0.45)] max-[520px]:hidden md:h-40 md:w-40">
        <Brain className="h-8 w-8 md:h-10 md:w-10" />
        <p className="mt-2 text-xl font-black md:text-2xl">Silvio</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-orange-100">Regia AI</p>
      </div>

      <div className="relative z-10 mb-4 hidden max-[520px]:block">
        <div className="relative h-[330px] overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04] p-3">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(249,116,21,.26),transparent_34%),radial-gradient(circle_at_18%_18%,rgba(59,130,246,.18),transparent_28%),radial-gradient(circle_at_82%_80%,rgba(34,197,94,.16),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.16]" style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }} />
          <div data-ai-orbit className="pointer-events-none absolute left-1/2 top-[46%] h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/15" />
          <div data-ai-orbit className="pointer-events-none absolute left-1/2 top-[46%] h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-orange-300/20" />

          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-55" aria-hidden="true">
            {[
              [22, 23],
              [76, 24],
              [80, 62],
              [50, 80],
              [20, 63],
            ].map(([x, y], index) => (
              <line
                key={`${x}-${y}`}
                x1="50%"
                y1="46%"
                x2={`${x}%`}
                y2={`${y}%`}
                stroke={agentGroups[index].color}
                strokeWidth="1.3"
                data-ai-line
                strokeDasharray="7 7"
              />
            ))}
          </svg>

          <div className="absolute left-1/2 top-[46%] z-20 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-orange-200/45 bg-[#F97415] text-white shadow-[0_0_48px_rgba(249,116,21,.55)]">
            <Brain className="h-7 w-7" />
            <p className="mt-1 text-lg font-black">Silvio</p>
            <p className="text-[9px] font-black uppercase tracking-wider text-orange-100">regia</p>
          </div>

          {agentGroups.map((group, index) => {
            const positions = [
              "left-[5%] top-[12%]",
              "right-[4%] top-[14%]",
              "right-[3%] bottom-[24%]",
              "left-1/2 bottom-[8%] -translate-x-1/2",
              "left-[4%] bottom-[25%]",
            ][index];
            return (
              <button
                key={group.area}
                type="button"
                onClick={() => setActiveArea(group)}
                className={`absolute ${positions} z-10 flex max-w-[116px] items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.09] px-2.5 py-2 text-left text-white shadow-lg backdrop-blur transition active:scale-95`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${group.color}24`, color: group.color }}>
                  <group.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[11px] font-black leading-none">{group.area}</span>
                  <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wide text-white/45">{group.agents.length} AI</span>
                </span>
              </button>
            );
          })}

          <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl border border-white/10 bg-[#08111f]/80 p-3 text-white shadow-xl backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.95)]" />
              <p className="text-xs font-black">{activeArea.area}: {activeArea.agents.join(", ")}</p>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-white/58">Tocca i reparti: Silvio collega dati, documenti e prossime azioni.</p>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-orange-300/20 bg-orange-500/15 p-4 text-white shadow-[0_0_40px_rgba(249,116,21,.18)]">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F97415] text-white shadow-[0_0_32px_rgba(249,116,21,.45)]">
              <Brain className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-black">Silvio coordina tutto</p>
              <p className="text-xs font-semibold leading-5 text-white/65">19 persone AI che leggono, decidono e fanno partire azioni.</p>
            </div>
          </div>
        </div>
      </div>

      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-45 max-[520px]:hidden" aria-hidden="true">
        {agentGroups.map((group, index) => {
          const positions = [
            [22, 23],
            [75, 22],
            [82, 62],
            [50, 84],
            [18, 66],
          ][index];
          return (
            <line
              key={group.area}
              x1="50%"
              y1="50%"
              x2={`${positions[0]}%`}
              y2={`${positions[1]}%`}
              stroke={group.color}
              strokeWidth="1.5"
              data-ai-line
              strokeDasharray="8 8"
            />
          );
        })}
      </svg>

      {agentGroups.map((group, index) => {
        const positions = [
          "left-[5%] top-[9%]",
          "right-[4%] top-[10%]",
          "right-[4%] bottom-[18%]",
          "left-1/2 bottom-[5%] -translate-x-1/2",
          "left-[4%] bottom-[20%]",
        ][index];
        return (
          <div
            key={group.area}
            onMouseEnter={() => setActiveArea(group)}
            onFocus={() => setActiveArea(group)}
            tabIndex={0}
            className={`absolute ${positions} w-[210px] rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-white shadow-xl backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.12] focus:outline-none focus:ring-2 focus:ring-orange-400/70 max-[520px]:static max-[520px]:mb-2.5 max-[520px]:w-full max-[520px]:translate-x-0 max-[520px]:rounded-xl max-[520px]:p-3`}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${group.color}26`, color: group.color }}>
                <group.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-black">{group.area}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">{group.agents.length} persone AI</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 max-[520px]:mt-2">
              {group.agents.map((agent) => (
                <span key={agent} className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/75 max-[520px]:text-[9px]">
                  {agent}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      <div className="absolute bottom-5 right-5 z-20 hidden max-w-[260px] rounded-2xl border border-white/10 bg-white/[0.08] p-4 text-white shadow-2xl backdrop-blur md:block">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${activeArea.color}2b`, color: activeArea.color }}>
            <activeArea.icon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-black">{activeArea.area}</p>
            <p className="text-[11px] text-white/55">Silvio legge i dati e attiva il reparto giusto</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          {activeArea.agents.slice(0, 3).map((agent) => (
            <div key={agent} className="flex items-center justify-between rounded-xl bg-white/8 px-3 py-2 text-xs font-semibold text-white/75">
              <span>{agent}</span>
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.9)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldIntelligenceVisual() {
  return (
    <div data-ai-reveal className="mt-12 overflow-hidden rounded-[26px] border border-gray-200 bg-[#0b1220] p-3 text-white shadow-2xl md:mt-16 md:rounded-[32px] md:p-6">
      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
        <div className="relative min-h-[520px] overflow-hidden rounded-[22px] bg-[#07111f] p-4 sm:min-h-[420px] md:rounded-[26px] md:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(249,116,21,.26),transparent_28%),radial-gradient(circle_at_82%_70%,rgba(34,197,94,.16),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.13]" style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }} />
          <div data-ai-scan className="absolute left-0 top-0 h-24 w-full bg-gradient-to-b from-transparent via-orange-400/25 to-transparent blur-sm" />

          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="rounded-full border border-orange-300/30 bg-orange-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-orange-100 backdrop-blur sm:text-xs">
              Campo in tempo reale
            </div>
            <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200">
              Live
            </div>
          </div>

          <div className="relative z-10 mt-6 grid gap-4 md:grid-cols-[0.86fr_1.14fr] md:items-center">
            <div className="mx-auto w-full max-w-[230px] rounded-[28px] border border-white/15 bg-black/30 p-3 shadow-2xl backdrop-blur">
              <div className="rounded-[22px] bg-[#f8fafc] p-3 text-[#111111]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">App campo</p>
                    <p className="text-sm font-black">Via Roma 15</p>
                  </div>
                  <span className="rounded-full bg-orange-100 px-2 py-1 text-[9px] font-black text-[#D95E0B]">Nuovo</span>
                </div>
                <div className="mt-3 overflow-hidden rounded-2xl bg-slate-200">
                  <img
                    src="/images/ai-edilizia/squadra-cantiere-ai.jpg"
                    alt="Squadra edile che aggiorna il lavoro dal cantiere"
                    className="h-28 w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="mt-3 space-y-2">
                  <div className="rounded-xl bg-slate-100 p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Nota vocale</p>
                    <p className="text-xs font-bold">Manca bancale persiane lato cortile.</p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-2">
                    <p className="text-[10px] font-black uppercase text-slate-400">Foto</p>
                    <p className="text-xs font-bold">3 immagini allegate al rapportino.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { icon: Camera, title: "1. Operaio carica foto e nota", text: "Da telefono: immagini, vocale, materiali usati e problema visto in cantiere." },
                { icon: Brain, title: "2. Silvio capisce cosa succede", text: "Collega tutto alla commessa, legge il contesto e prepara il riepilogo operativo." },
                { icon: FileText, title: "3. Genera rapportino e diario", text: "Crea il rapportino lavori, aggiorna il diario e archivia foto/documenti." },
                { icon: MessageSquare, title: "4. Avvisa chi deve fare", text: "Promemoria a ufficio, collaboratori o squadra: materiale mancante, attività e prossima azione." },
              ].map((step, index) => (
                <div key={step.title} className="group rounded-2xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur transition hover:border-orange-300/35 hover:bg-white/[0.1]">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-400/15 text-orange-300">
                      <step.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black">{step.title}</p>
                      <p className="mt-1 text-xs leading-5 text-white/62">{step.text}</p>
                    </div>
                  </div>
                  {index < 3 && <div className="ml-5 mt-2 h-5 w-px bg-gradient-to-b from-orange-300/60 to-transparent" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-[22px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur md:rounded-[26px] md:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300 md:text-sm md:tracking-[0.2em]">Dalla foto alla decisione</p>
            <h3 className="mt-3 text-[2rem] font-black leading-[1.05] tracking-tight md:text-4xl">
              Ogni segnale del cantiere entra nella memoria operativa.
            </h3>
            <p className="mt-4 text-sm leading-7 text-white/70 md:text-base md:leading-8">
              La squadra carica foto, rapportino, materiali e note. Silvio genera il riepilogo,
              aggiorna il diario lavori, prepara promemoria e avvisa chi deve intervenire.
            </p>
          </div>

          <div className="mt-6 space-y-3 md:mt-8">
            {fieldSignals.map((signal) => (
              <div key={signal.title} className="group flex gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 transition hover:border-orange-300/40 hover:bg-white/[0.09] md:gap-4 md:p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-400/15 text-orange-300 transition group-hover:scale-105 md:h-11 md:w-11">
                  <signal.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-black">{signal.title}</p>
                  <p className="mt-1 text-sm leading-6 text-white/60">{signal.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 md:mt-8">
            <img
              src="/images/ai-edilizia/squadra-cantiere-ai.jpg"
              alt="Squadra edile in cantiere con flusso digitale e AI"
              className="h-36 w-full object-cover opacity-85 transition duration-700 hover:scale-105 md:h-44"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AISystemShowcaseSection() {
  const sectionRef = useGsapSection();

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-[#f8fafc] py-14 pb-28 md:py-28">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#F97415] to-transparent" />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div data-ai-reveal className="mx-auto max-w-3xl text-center">
          <div className="inline-flex max-w-full items-center justify-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-center text-[10px] font-black uppercase tracking-[0.14em] text-[#D95E0B] sm:text-xs sm:tracking-[0.18em]">
            <Sparkles className="h-3.5 w-3.5" />
            Il sistema operativo AI dell'impresa edile
          </div>
          <h2 className="mt-4 text-[1.9rem] font-black leading-[1.08] tracking-tight text-[#111111] sm:text-4xl md:text-5xl">
            Non solo moduli. Una regia centrale che legge l'azienda e fa partire il lavoro.
          </h2>
          <p className="mt-5 hidden text-lg leading-8 text-gray-600 lg:block">
            Silvio coordina 18 persone AI specialistiche: crea bozze di fatture, manda solleciti,
            genera rapportini, ricorda ai collaboratori cosa fare e segnala dove intervenire.
          </p>
        </div>

        <div className="mt-6 lg:hidden">
          <AiBrainMap />
        </div>

        <p className="mx-auto mt-5 max-w-3xl text-center text-sm leading-7 text-gray-600 sm:text-base lg:hidden">
          Silvio coordina 18 persone AI specialistiche: crea bozze di fatture, manda solleciti,
          genera rapportini, ricorda ai collaboratori cosa fare e segnala dove intervenire.
        </p>

        <div className="mt-8 grid gap-5 md:mt-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="hidden lg:block">
            <AiBrainMap />
          </div>

          <div className="space-y-3 md:space-y-4" data-ai-reveal>
            {[
              { icon: Euro, title: "Margini e cassa", text: "Controlla incassi, prepara solleciti, segnala commesse sotto target e ti mostra quali costi stanno mangiando margine." },
              { icon: ClipboardList, title: "Cantieri e campo", text: "Genera rapportini, aggiorna il diario lavori, legge foto e note dal campo e ricorda alle squadre le attività aperte." },
              { icon: FileText, title: "Documenti e DDT", text: "Prepara bozze di fatture, collega DDT, ordini e documenti alla commessa giusta, senza inseguire cartelle e chat." },
              { icon: Users, title: "Clienti e vendite", text: "Avvisa chi richiamare, prepara follow-up WhatsApp, spinge preventivi caldi e tiene viva la pipeline commerciale." },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg md:p-5">
                <div className="flex gap-3 md:gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#D95E0B] md:h-11 md:w-11">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[#111111] md:text-lg">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-gray-600 md:leading-7">{item.text}</p>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={openContactModal}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#F97415] px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-orange-900/20 transition hover:bg-[#D95E0B] sm:w-auto md:px-6 md:py-4 md:text-base"
            >
              Fai lavorare Silvio sulla tua impresa
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        <FieldIntelligenceVisual />

        <div data-ai-reveal className="mt-12 overflow-hidden rounded-[26px] border border-gray-200 bg-white p-4 shadow-xl md:mt-16 md:rounded-[32px] md:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B] md:text-sm md:tracking-[0.2em]">AI che produce lavoro</p>
              <h2 className="mt-3 text-[2rem] font-black leading-[1.05] tracking-tight text-[#111111] md:text-4xl">
                Dal computo metrico al preventivo, dal cantiere al rapportino.
              </h2>
              <p className="mt-4 text-sm leading-7 text-gray-600 md:text-base md:leading-8">
                Silvio non si limita a mostrare dati: legge documenti, genera bozze operative,
                prepara preventivi più forti, produce rapportini e crea render quando servono alla vendita.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/funzionalita/preventivi-edilizia"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#111111] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#222]"
                >
                  Vedi preventivi AI
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/funzionalita"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 px-5 py-3 text-sm font-extrabold text-[#111111] transition hover:border-[#F97415] hover:text-[#D95E0B]"
                >
                  Tutti i moduli AI
                </Link>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-[#0b1220] p-3 text-white md:rounded-[28px] md:p-5">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(249,116,21,.25),transparent_26%),radial-gradient(circle_at_80%_75%,rgba(59,130,246,.2),transparent_30%)]" />
              <div className="relative grid gap-2 sm:grid-cols-2 md:gap-3">
                {aiProductionTools.map((tool) => (
                  <div key={tool.title} className="group rounded-2xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur transition hover:-translate-y-1 hover:border-orange-300/35 hover:bg-white/[0.1] md:p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-400/15 text-orange-300">
                        <tool.icon className="h-5 w-5" />
                      </div>
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/55">
                        {tool.tag}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-black md:text-base">{tool.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-white/62 md:text-sm md:leading-6">{tool.text}</p>
                    <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      Pronto dentro la commessa
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div data-ai-reveal className="mt-12 md:mt-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B] md:text-sm md:tracking-[0.2em]">Per problemi reali, non per menu software</p>
            <h2 className="mt-3 text-[2rem] font-black leading-[1.05] tracking-tight text-[#111111] md:text-4xl">
              L'imprenditore non cerca moduli. Cerca risposte.
            </h2>
          </div>
          <div className="mt-8 grid gap-3 md:mt-10 md:grid-cols-2 md:gap-5 lg:grid-cols-4">
            {painFlows.map((flow) => (
              <div key={flow.problem} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-xl md:p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F97415]/10 text-[#D95E0B] md:h-12 md:w-12">
                  <flow.icon className="h-5 w-5 md:h-6 md:w-6" />
                </div>
                <h3 className="mt-4 text-base font-black text-[#111111] md:mt-5 md:text-lg">{flow.problem}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600 md:mt-3 md:leading-7">{flow.answer}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={openContactModal}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#F97415] px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-900/20 transition hover:bg-[#D95E0B]"
            >
              Scopri dove perdi margine
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
