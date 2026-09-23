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

/**
 * AiBrainMap — costellazione orbitante del "Cervello AI", come dentro l'app
 * (AIBrainGraph): i reparti AI ruotano a 360° attorno a Silvio (mascotte
 * ufficiale al centro), i puntini interni sono le memorie aziendali.
 * Il dettaglio del reparto attivo vive in UN solo pannello in basso —
 * niente card sovrapposte. La rotazione si ferma quando il mouse entra.
 */
const MEMORY_DOTS = [
  { angle: 8, scale: 1, color: "#F97415" },
  { angle: 44, scale: 0.7, color: "#3b82f6" },
  { angle: 86, scale: 0.85, color: "#22c55e" },
  { angle: 120, scale: 0.6, color: "#f59e0b" },
  { angle: 158, scale: 1, color: "#8b5cf6" },
  { angle: 196, scale: 0.75, color: "#F97415" },
  { angle: 232, scale: 0.9, color: "#22c55e" },
  { angle: 268, scale: 0.65, color: "#3b82f6" },
  { angle: 304, scale: 0.8, color: "#F97415" },
  { angle: 340, scale: 0.7, color: "#f59e0b" },
];

// Posizioni dei 5 nodi reparto in unità viewBox (raggio 100), angoli -90°+i·72°.
// Stesse coordinate dei nodi CSS: la mesh SVG scala col var(--orbit-r).
const NODE_POS = [0, 1, 2, 3, 4].map((i) => {
  const rad = ((-90 + i * 72) * Math.PI) / 180;
  return { x: Math.cos(rad) * 100, y: Math.sin(rad) * 100 };
});

// Pentagono (vicini) + pentagramma (trasversali): ogni reparto è collegato
// a tutti gli altri, come i cross-persona edges del Brain Graph nell'app.
const AREA_LINKS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 0],
  [0, 2], [1, 3], [2, 4], [3, 0], [4, 1],
];

// Pausa sincronizzata di ruota e contro-rotazioni: se si fermasse solo la
// ruota, i nodi continuerebbero a contro-ruotare e si inclinerebbero.
const ORBIT_PAUSE_ON_HOVER =
  "group-hover/brain:[animation-play-state:paused] group-focus-within/brain:[animation-play-state:paused]";

function AiBrainMap() {
  const [activeArea, setActiveArea] = useState(agentGroups[0]);
  // Tour automatico delle aree: cicla i reparti finché l'utente non ne
  // sceglie uno — così anche chi non interagisce vede tutte le squadre AI.
  const [userPicked, setUserPicked] = useState(false);

  useEffect(() => {
    if (userPicked) return;
    const id = window.setInterval(() => {
      setActiveArea((prev) => {
        const idx = agentGroups.findIndex((g) => g.area === prev.area);
        return agentGroups[(idx + 1) % agentGroups.length];
      });
    }, 4000);
    return () => window.clearInterval(id);
  }, [userPicked]);

  const activeIdx = agentGroups.findIndex((g) => g.area === activeArea.area);

  function selectArea(group: (typeof agentGroups)[number]) {
    setUserPicked(true);
    setActiveArea(group);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }

  return (
    <div
      onPointerMove={handlePointerMove}
      className="group/brain relative h-[560px] overflow-hidden rounded-[28px] border border-white/10 bg-[#0a1222] shadow-2xl sm:h-[600px] lg:h-[640px] [--orbit-r:118px] sm:[--orbit-r:168px] lg:[--orbit-r:200px] [--silvio-size:88px] sm:[--silvio-size:104px] lg:[--silvio-size:116px] [--silvio-etichetta:-9px] sm:[--silvio-etichetta:10px]"
      style={{
        ["--spot-x" as string]: "50%",
        ["--spot-y" as string]: "50%",
      }}
    >
      <style>{`
        @keyframes eic-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes eic-orbit-rev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes eic-halo { 0%, 100% { opacity: .3; transform: scale(1); } 50% { opacity: .62; transform: scale(1.1); } }
        @keyframes eic-dash { to { stroke-dashoffset: -22; } }
        @media (prefers-reduced-motion: reduce) { [data-eic-orbit] { animation: none !important; } }
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(249,116,21,0.22),transparent_34%),radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_78%_72%,rgba(34,197,94,0.12),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover/brain:opacity-100" style={{
        background: "radial-gradient(220px circle at var(--spot-x) var(--spot-y), rgba(249,116,21,.2), transparent 65%)",
      }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)",
        backgroundSize: "42px 42px",
      }} />

      {/* Badge superiori */}
      <div className="absolute inset-x-4 top-4 z-20 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-300/30 bg-orange-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-orange-200 backdrop-blur sm:px-3 sm:text-[10px]">
          <Brain className="h-3 w-3" />
          Memoria aziendale
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-200 backdrop-blur sm:px-3 sm:text-[10px]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.95)]" />
          Live azienda
        </span>
      </div>

      {/* Costellazione: origine al centro dell'orbita */}
      <div className="absolute left-1/2 top-[42%]">
        {/* Anelli guida statici */}
        <div className="pointer-events-none absolute rounded-full border border-dashed border-white/12" style={{
          width: "calc(var(--orbit-r) * 2)",
          height: "calc(var(--orbit-r) * 2)",
          left: "calc(var(--orbit-r) * -1)",
          top: "calc(var(--orbit-r) * -1)",
        }} />
        <div className="pointer-events-none absolute rounded-full border border-dashed border-orange-300/20" style={{
          width: "calc(var(--orbit-r) * 1.1)",
          height: "calc(var(--orbit-r) * 1.1)",
          left: "calc(var(--orbit-r) * -0.55)",
          top: "calc(var(--orbit-r) * -0.55)",
        }} />

        {/* Memorie: puntini sull'anello interno, rotazione inversa */}
        <div data-eic-orbit className={ORBIT_PAUSE_ON_HOVER} style={{ animation: "eic-orbit-rev 44s linear infinite" }}>
          {MEMORY_DOTS.map((dot) => (
            <span
              key={dot.angle}
              className="pointer-events-none absolute left-0 top-0 block rounded-full"
              style={{
                width: 7 * dot.scale,
                height: 7 * dot.scale,
                backgroundColor: dot.color,
                boxShadow: `0 0 ${Math.round(10 * dot.scale)}px ${dot.color}`,
                transform: `rotate(${dot.angle}deg) translateX(calc(var(--orbit-r) * 0.55))`,
                opacity: 0.85,
              }}
            />
          ))}
        </div>

        {/* Ruota reparti: mesh di collegamenti + raggi + nodi che orbitano a 360° */}
        <div data-eic-orbit className={ORBIT_PAUSE_ON_HOVER} style={{ animation: "eic-orbit 60s linear infinite" }}>
          {/* Collegamenti reparto↔reparto: le aree si parlano tra loro.
              Quelli del reparto attivo si accendono col suo colore. */}
          <svg
            className="pointer-events-none absolute"
            viewBox="-100 -100 200 200"
            aria-hidden="true"
            style={{
              width: "calc(var(--orbit-r) * 2)",
              height: "calc(var(--orbit-r) * 2)",
              left: "calc(var(--orbit-r) * -1)",
              top: "calc(var(--orbit-r) * -1)",
            }}
          >
            {AREA_LINKS.map(([a, b]) => {
              const isActiveLink = activeIdx === a || activeIdx === b;
              const p1 = NODE_POS[a];
              const p2 = NODE_POS[b];
              // Curva tirata verso il centro: le trasversali passano "sotto"
              // Silvio — ogni collegamento è mediato dalla regia.
              const cx = ((p1.x + p2.x) / 2) * 0.55;
              const cy = ((p1.y + p2.y) / 2) * 0.55;
              return (
                <path
                  key={`${a}-${b}`}
                  data-eic-orbit
                  d={`M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`}
                  fill="none"
                  stroke={isActiveLink ? activeArea.color : "#ffffff"}
                  strokeWidth={isActiveLink ? 1.6 : 1}
                  strokeOpacity={isActiveLink ? 0.75 : 0.13}
                  strokeDasharray="4 7"
                  strokeLinecap="round"
                  style={isActiveLink ? { animation: "eic-dash 1.4s linear infinite" } : undefined}
                />
              );
            })}
          </svg>
          {agentGroups.map((group, index) => {
            const angle = -90 + index * 72;
            const isActive = activeArea.area === group.area;
            return (
              <div key={group.area}>
                {/* Raggio centro→nodo (ruota insieme alla costellazione) */}
                <span
                  className="pointer-events-none absolute left-0 top-0 block origin-left"
                  style={{
                    width: "var(--orbit-r)",
                    height: 1.5,
                    transform: `rotate(${angle}deg)`,
                    background: `repeating-linear-gradient(90deg, transparent 0 5px, ${group.color}66 5px 11px)`,
                    opacity: isActive ? 0.95 : 0.5,
                  }}
                />
                {/* Nodo: contro-rotazione sincronizzata → resta sempre dritto */}
                <div className="absolute left-0 top-0" style={{ transform: `rotate(${angle}deg) translateX(var(--orbit-r))` }}>
                  <div style={{ transform: `rotate(${-angle}deg)` }}>
                    <div data-eic-orbit className={ORBIT_PAUSE_ON_HOVER} style={{ animation: "eic-orbit-rev 60s linear infinite" }}>
                      <button
                        type="button"
                        aria-pressed={isActive}
                        onMouseEnter={() => selectArea(group)}
                        onFocus={() => selectArea(group)}
                        onClick={() => selectArea(group)}
                        className="absolute flex w-[86px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 text-center focus:outline-none sm:w-[96px]"
                      >
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur transition-all duration-300 sm:h-12 sm:w-12 lg:h-14 lg:w-14"
                          style={{
                            backgroundColor: `${group.color}26`,
                            borderColor: isActive ? group.color : `${group.color}44`,
                            color: group.color,
                            boxShadow: isActive ? `0 0 26px ${group.color}66` : `0 0 14px ${group.color}30`,
                          }}
                        >
                          <group.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                        </span>
                        <span className={`text-[10px] font-black leading-none sm:text-[11px] ${isActive ? "text-white" : "text-white/75"}`}>
                          {group.area}
                        </span>
                        <span className={`text-[8px] font-bold uppercase tracking-widest sm:text-[9px] ${isActive ? "text-orange-300" : "text-white/40"}`}>
                          {group.agents.length} AI
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Centro: Silvio (mascotte ufficiale) con alone pulsante */}
        <div className="pointer-events-none absolute left-0 top-0 z-10">
          <span className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2">
            <span
              data-eic-orbit
              className="block rounded-full bg-orange-400/35"
              style={{
                width: "calc(var(--silvio-size) + 30px)",
                height: "calc(var(--silvio-size) + 30px)",
                animation: "eic-halo 3.8s ease-in-out infinite",
                filter: "blur(2px)",
              }}
            />
          </span>
          <img
            src="/silvio-avatar-orange.png"
            alt="Silvio, la regia AI di Edilizia in Cloud"
            width={116}
            height={116}
            loading="lazy"
            decoding="async"
            // max-w-none: il preflight Tailwind (max-width:100%) clamperebbe la
            // larghezza a 0 perché il parent è un punto 0×0 di ancoraggio.
            className="absolute left-0 top-0 max-w-none -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-orange-200/70 shadow-[0_0_60px_rgba(249,116,21,0.55)]"
            style={{ width: "var(--silvio-size)", height: "var(--silvio-size)" }}
          />
          {/* Su telefono l'orbita è stretta (raggio 118 px) e i reparti, girando,
              passavano sopra l'etichetta: lì è corta e appoggiata sul bordo
              dell'avatar, dentro l'anello dove i reparti non arrivano. */}
          <div
            className="absolute left-0 top-0 -translate-x-1/2 whitespace-nowrap rounded-full border border-orange-300/40 bg-[#0a1222]/90 px-2 py-0.5 backdrop-blur sm:px-3 sm:py-1"
            style={{ marginTop: "calc(var(--silvio-size) / 2 + var(--silvio-etichetta))" }}
          >
            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-orange-200 sm:text-[10px] sm:tracking-[0.18em]"><span className="hidden sm:inline">Silvio · </span>Regia AI</span>
          </div>
        </div>
      </div>

      {/* Pannello unico: dettaglio del reparto attivo */}
      <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl border border-white/10 bg-[#08111f]/85 p-3 shadow-xl backdrop-blur sm:inset-x-4 sm:bottom-4 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${activeArea.color}26`, color: activeArea.color }}>
              <activeArea.icon className="h-4 w-4" />
            </span>
            <p className="text-sm font-black text-white">{activeArea.area}</p>
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{activeArea.agents.length} persone AI</span>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.9)]" />
            Attivo
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {activeArea.agents.map((agent) => (
            <span key={agent} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/80 sm:text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
              {agent}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-4 text-white/40 sm:text-[11px]">
          Silvio legge i dati e attiva il reparto giusto — tocca un reparto per vedere le sue persone AI.
        </p>
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
                <div key={step.title} className="group relative rounded-2xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur transition hover:border-orange-300/35 hover:bg-white/[0.1]">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-400/15 text-orange-300">
                      <step.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black">{step.title}</p>
                      <p className="mt-1 text-xs leading-5 text-white/62">{step.text}</p>
                    </div>
                  </div>
                  {/* Il filo che unisce i passaggi sta nello spazio FRA le schede,
                      sotto il centro dell'icona: dentro la scheda sembrava un
                      trattino dimenticato. */}
                  {index < 3 && <div aria-hidden="true" className="pointer-events-none absolute left-[32px] top-full h-3 w-px bg-orange-300/50" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-[22px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur md:rounded-[26px] md:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300 md:text-sm md:tracking-[0.2em]">Dalla foto alla decisione</p>
            <h3 className="mt-3 text-[2rem] font-black leading-[1.05] tracking-normal md:tracking-tight md:text-4xl">
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
              srcSet="/images/ai-edilizia/squadra-cantiere-ai-540.jpg 540w, /images/ai-edilizia/squadra-cantiere-ai.jpg 800w"
              sizes="(max-width: 768px) 100vw, 50vw"
              alt="Squadra edile in cantiere con flusso digitale e AI"
              className="h-36 w-full object-cover opacity-85 transition duration-700 hover:scale-105 md:h-44"
              loading="lazy"
              decoding="async"
              width={800}
              height={450}
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
          <h2 className="mt-4 text-[1.9rem] font-black leading-[1.08] tracking-normal md:tracking-tight text-[#111111] sm:text-4xl md:text-5xl">
            Non solo moduli. Una regia centrale che legge l'azienda e fa partire il lavoro.
          </h2>
          <p className="mt-5 hidden text-lg leading-8 text-gray-600 lg:block">
            Silvio coordina 19 persone AI specialistiche: crea bozze di fatture, manda solleciti,
            genera rapportini, ricorda ai collaboratori cosa fare e segnala dove intervenire.
          </p>
        </div>

        <div className="mt-6 lg:hidden">
          <AiBrainMap />
        </div>

        <p className="mx-auto mt-5 max-w-3xl text-center text-sm leading-7 text-gray-600 sm:text-base lg:hidden">
          Silvio coordina 19 persone AI specialistiche: crea bozze di fatture, manda solleciti,
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
              <h2 className="mt-3 text-[2rem] font-black leading-[1.05] tracking-normal md:tracking-tight text-[#111111] md:text-4xl">
                Dal computo metrico al preventivo, dal cantiere al rapportino.
              </h2>
              <p className="mt-4 text-sm leading-7 text-gray-600 md:text-base md:leading-8">
                Silvio non si limita a mostrare dati: legge documenti, genera bozze operative,
                prepara preventivi più forti, produce rapportini e crea render quando servono alla vendita.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/funzionalita/preventivi-edilizia/"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#111111] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#222]"
                >
                  Vedi preventivi AI
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/funzionalita/"
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
            <h2 className="mt-3 text-[2rem] font-black leading-[1.05] tracking-normal md:tracking-tight text-[#111111] md:text-4xl">
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
