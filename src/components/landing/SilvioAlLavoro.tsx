/**
 * Due scene animate della sezione AI in home, al posto di blocchi pieni di testo:
 *
 * - SegnaliCantiere: il telefono dell'operaio mostra i 4 passaggi uno alla volta
 *   (nota vocale → Silvio legge la foto → rapportino scritto → avvisi partiti); a
 *   fianco solo i titoli, coi numeri che contano da soli.
 * - AiProduceLavoro: sei riquadri compatti; uno alla volta si accende e sotto Silvio
 *   "lavora" (barra che avanza) e consegna il risultato.
 *
 * I passaggi avanzano da soli; passando col mouse o toccando se ne sceglie uno e il
 * giro si ferma per qualche secondo. Rispetta prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Brain, Camera, CheckCircle2, FileText, MessageSquare, Mic } from "lucide-react";

// Un passo che avanza da solo, e si ferma un po' quando l'utente sceglie.
function useGiro(n: number, ms: number) {
  const [i, setI] = useState(0);
  const pausaFino = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (Date.now() < pausaFino.current) return;
      setI((v) => (v + 1) % n);
    }, ms);
    return () => window.clearInterval(id);
  }, [n, ms]);
  const scegli = (k: number) => {
    pausaFino.current = Date.now() + 9000;
    setI(k);
  };
  return [i, scegli] as const;
}

function useContaSu(target: number, attivo: boolean) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!attivo) return;
    let raf = 0;
    const t0 = performance.now();
    const passo = (now: number) => {
      const k = Math.min(1, (now - t0) / 1400);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [target, attivo]);
  return v;
}

const CSS = `
@keyframes sal-wave { 0%,100% { transform: scaleY(0.35) } 50% { transform: scaleY(1) } }
.sal-wave span { animation: sal-wave 0.9s ease-in-out infinite; transform-origin: center; }
@keyframes sal-scan { from { top: -15% } to { top: 100% } }
.sal-scan { animation: sal-scan 1.8s cubic-bezier(0.45,0,0.3,1) infinite; }
@keyframes sal-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
.sal-in { animation: sal-in 500ms cubic-bezier(0.22,1,0.36,1) backwards; }
@keyframes sal-bar { from { width: 0 } to { width: 100% } }
.sal-bar { animation: sal-bar var(--sal-dur, 3s) linear forwards; }
@media (prefers-reduced-motion: reduce) { .sal-wave span, .sal-scan, .sal-in, .sal-bar { animation: none !important; } }
`;

// ───────────────────────── Segnali del cantiere ─────────────────────────
const PASSI = [
  { icon: Camera, title: "L'operaio manda foto e nota", short: "Dal telefono, in cantiere." },
  { icon: Brain, title: "Silvio capisce cosa succede", short: "Collega tutto alla commessa giusta." },
  { icon: FileText, title: "Scrive il rapportino", short: "Diario lavori aggiornato da solo." },
  { icon: MessageSquare, title: "Avvisa chi deve fare", short: "Ufficio e squadra sanno cosa manca." },
];
const DUR_PASSO = 3200;

function SchermoTelefono({ passo }: { passo: number }) {
  return (
    <div className="relative h-[330px] overflow-hidden rounded-[22px] bg-[#f8fafc] p-3 text-[#111111]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">App campo</p>
          <p className="text-sm font-black">Via Roma 15</p>
        </div>
        <span className="rounded-full bg-orange-100 px-2 py-1 text-[9px] font-black text-eic-orange-dark">{passo + 1} / 4</span>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-2xl bg-slate-200">
        <img src="/images/ai-edilizia/squadra-cantiere-ai-540.jpg" alt="Squadra in cantiere" className="h-28 w-full object-cover" loading="lazy" decoding="async" />
        {passo === 1 && (
          <>
            <div className="sal-scan absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-orange-400/45 to-transparent" />
            <span className="sal-in absolute left-2 top-2 rounded-full bg-eic-orange px-2 py-0.5 text-[9px] font-black uppercase text-white">Silvio legge…</span>
          </>
        )}
      </div>

      <div key={passo} className="mt-3 space-y-2">
        {passo === 0 && (
          <div className="sal-in rounded-xl bg-white p-2.5 shadow-sm">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400"><Mic className="h-3 w-3" /> Nota vocale</p>
            <div className="sal-wave mt-1.5 flex h-5 items-center gap-[3px]">
              {Array.from({ length: 22 }, (_, k) => (
                <span key={k} className="block w-[3px] rounded-full bg-eic-orange" style={{ height: `${30 + ((k * 37) % 70)}%`, animationDelay: `${(k % 6) * 0.1}s` }} />
              ))}
            </div>
            <p className="mt-1 text-xs font-bold">«Manca il bancale delle persiane, lato cortile.»</p>
          </div>
        )}
        {passo === 1 &&
          ["Commessa: Via Roma 15", "Materiale: persiane", "Problema: consegna mancante"].map((t, k) => (
            <p key={t} className="sal-in rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold shadow-sm" style={{ animationDelay: `${0.4 + k * 0.45}s` }}>
              <span className="mr-1.5 text-eic-orange">●</span>
              {t}
            </p>
          ))}
        {passo === 2 && (
          <div className="sal-in rounded-xl bg-white p-2.5 shadow-sm">
            <p className="text-[10px] font-black uppercase text-slate-400">Rapportino di oggi</p>
            {["3 operai · 8 ore", "3 foto allegate", "Persiane lato cortile: materiale mancante"].map((t, k) => (
              <p key={t} className="sal-in mt-1 text-xs font-bold" style={{ animationDelay: `${0.3 + k * 0.5}s` }}>
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />
                {t}
              </p>
            ))}
          </div>
        )}
        {passo === 3 &&
          [
            { chi: "Ufficio", cosa: "Ordinare il bancale di persiane" },
            { chi: "Capocantiere", cosa: "Lato cortile in pausa fino alla consegna" },
          ].map((m, k) => (
            <div key={m.chi} className="sal-in rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2" style={{ animationDelay: `${0.3 + k * 0.6}s` }}>
              <p className="text-[10px] font-black uppercase text-emerald-700">Avviso a {m.chi}</p>
              <p className="text-xs font-bold">{m.cosa}</p>
            </div>
          ))}
      </div>
    </div>
  );
}

function Contatore({ n, label, attivo }: { n: number; label: string; attivo: boolean }) {
  const v = useContaSu(n, attivo);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center">
      <p className="text-3xl font-black tabular-nums text-orange-300">{v}</p>
      <p className="mt-0.5 text-[11px] font-semibold leading-tight text-white/60">{label}</p>
    </div>
  );
}

export function SegnaliCantiere() {
  const [passo, scegli] = useGiro(PASSI.length, DUR_PASSO);
  const ref = useRef<HTMLDivElement>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisto(true), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-ai-reveal className="mt-12 overflow-hidden rounded-[26px] border border-gray-200 bg-[#0b1220] p-4 text-white shadow-2xl md:mt-16 md:rounded-[32px] md:p-7">
      <style>{CSS}</style>
      <div className="grid gap-6 lg:grid-cols-[230px_1fr_0.95fr] lg:items-center">
        <div className="mx-auto w-full max-w-[230px] rounded-[28px] border border-white/15 bg-black/30 p-2.5 shadow-2xl">
          <SchermoTelefono passo={passo} />
        </div>

        <ol className="space-y-2">
          {PASSI.map((p, i) => {
            const on = i === passo;
            const Icon = p.icon;
            return (
              <li key={p.title}>
                <button
                  type="button"
                  onPointerEnter={(e) => e.pointerType === "mouse" && scegli(i)}
                  onClick={() => scegli(i)}
                  className={`relative w-full overflow-hidden rounded-2xl border p-3 text-left transition-all duration-300 ${on ? "border-orange-300/50 bg-white/[0.1]" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"}`}
                >
                  <span className="flex items-center gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${on ? "bg-eic-orange text-white" : "bg-white/10 text-orange-300"}`}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span>
                      <span className="block text-sm font-black">{i + 1}. {p.title}</span>
                      <span className={`block overflow-hidden text-xs text-white/60 transition-all duration-300 ${on ? "mt-0.5 max-h-6 opacity-100" : "max-h-0 opacity-0"}`}>{p.short}</span>
                    </span>
                  </span>
                  {on && <span key={`b${passo}`} className="sal-bar absolute bottom-0 left-0 h-[3px] bg-eic-orange" style={{ ["--sal-dur" as string]: `${DUR_PASSO}ms` }} />}
                </button>
              </li>
            );
          })}
        </ol>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300 md:text-sm">Dalla foto alla decisione</p>
          <h3 className="mt-2 text-[1.9rem] font-black leading-[1.05] md:text-[2.2rem]">Ogni segnale del cantiere entra nella memoria operativa.</h3>
          <p className="mt-3 text-sm leading-6 text-white/65">Foto, note e materiali arrivano dal campo: Silvio li mette sulla commessa giusta e avvisa chi deve fare.</p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Contatore n={12} label="foto lette oggi" attivo={visto} />
            <Contatore n={4} label="DDT collegati" attivo={visto} />
            <Contatore n={3} label="squadre attive" attivo={visto} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── AI che produce lavoro ─────────────────────────
export type Strumento = { title: string; text: string; icon: LucideIcon; tag: string };
const DUR_STRUMENTO = 3400;

export function AiProduceLavoro({ tools }: { tools: Strumento[] }) {
  const [attivo, scegli] = useGiro(tools.length, DUR_STRUMENTO);
  const t = tools[attivo];
  const Icon = t.icon;
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-[#0b1220] p-3 text-white md:rounded-[28px] md:p-5">
      <style>{CSS}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(249,116,21,.25),transparent_26%),radial-gradient(circle_at_80%_75%,rgba(59,130,246,.2),transparent_30%)]" />
      <div className="relative grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tools.map((tool, i) => {
          const on = i === attivo;
          const TIcon = tool.icon;
          return (
            <button
              key={tool.title}
              type="button"
              onPointerEnter={(e) => e.pointerType === "mouse" && scegli(i)}
              onClick={() => scegli(i)}
              className={`rounded-2xl border p-3 text-left transition-all duration-300 ${on ? "-translate-y-0.5 border-orange-300/60 bg-white/[0.12] shadow-[0_10px_30px_-12px_rgba(249,116,21,0.6)]" : "border-white/10 bg-white/[0.05] hover:bg-white/[0.08]"}`}
            >
              <span className="flex items-center justify-between">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${on ? "bg-eic-orange text-white" : "bg-orange-400/15 text-orange-300"}`}>
                  <TIcon className="h-[18px] w-[18px]" />
                </span>
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider text-white/55">{tool.tag}</span>
              </span>
              <span className="mt-2 block text-[13px] font-black leading-tight">{tool.title}</span>
            </button>
          );
        })}
      </div>

      {/* Silvio al lavoro sullo strumento acceso */}
      <div key={attivo} className="sal-in relative mt-3 rounded-2xl border border-white/10 bg-white/[0.07] p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-eic-orange text-white"><Icon className="h-4 w-4" /></span>
          <p className="text-sm font-black">{t.title}</p>
        </div>
        <p className="mt-2 text-xs leading-5 text-white/65 md:text-sm md:leading-6">{t.text}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="sal-bar h-full rounded-full bg-gradient-to-r from-eic-orange to-amber-300" style={{ ["--sal-dur" as string]: `${DUR_STRUMENTO * 0.7}ms` }} />
        </div>
        <p className="sal-in mt-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-300" style={{ animationDelay: `${DUR_STRUMENTO * 0.7}ms` }}>
          <CheckCircle2 className="h-4 w-4" /> Pronto dentro la commessa
        </p>
      </div>
    </div>
  );
}

// ───────────────────────── Passi animati (come funziona) ─────────────────────────
export type Passo = { title: string; text: string; icon: LucideIcon };
const DUR_PASSO_ANIMATO = 2600;

/**
 * Tre (o più) passi collegati da una linea che si riempie: un impulso arancione corre
 * da un passo all'altro e il passo raggiunto si accende. Avanza da solo; col mouse o
 * col tocco si sceglie un passo. Usato nel «Come funziona» delle pagine funzionalità.
 */
export function PassiAnimati({ steps }: { steps: Passo[] }) {
  const [attivo, scegli] = useGiro(steps.length, DUR_PASSO_ANIMATO);
  const n = steps.length;
  const quota = n > 1 ? attivo / (n - 1) : 1;
  return (
    <div className="relative mt-12">
      <style>{CSS}</style>
      {/* la linea che collega i passi (da tablet in su) */}
      <div aria-hidden className="pointer-events-none absolute left-[16%] right-[16%] top-[22px] hidden h-1 rounded-full bg-orange-100 sm:block">
        <div className="h-full rounded-full bg-eic-orange transition-all duration-700 ease-out" style={{ width: `${quota * 100}%` }} />
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-eic-orange shadow-[0_0_0_6px_rgba(249,116,21,0.18)] transition-all duration-700 ease-out" style={{ left: `${quota * 100}%` }} />
      </div>
      <ol className="relative grid gap-5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))` }}>
        {steps.map((s, i) => {
          const on = i === attivo;
          const fatto = i < attivo;
          const Icon = s.icon;
          return (
            <li key={s.title} id={`step-${i + 1}`}>
              <button
                type="button"
                onPointerEnter={(e) => e.pointerType === "mouse" && scegli(i)}
                onClick={() => scegli(i)}
                className="group flex w-full flex-col items-center text-center"
              >
                <span
                  className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm font-black transition-all duration-500 ${on ? "scale-110 border-eic-orange bg-eic-orange text-white shadow-[0_0_0_8px_rgba(249,116,21,0.15)]" : fatto ? "border-eic-orange bg-orange-50 text-eic-orange" : "border-slate-200 bg-white text-slate-400"}`}
                >
                  {fatto ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                </span>
                <span
                  className={`mt-4 block w-full rounded-2xl border p-5 text-left transition-all duration-500 ${on ? "-translate-y-1 border-eic-orange/50 bg-white shadow-xl shadow-orange-900/10" : "border-slate-200 bg-gradient-to-br from-white to-slate-50"}`}
                >
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${on ? "bg-eic-orange text-white" : "bg-orange-100 text-eic-orange"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="mt-3 block text-base font-bold text-[#111111]">{s.title}</span>
                  <span className="mt-2 block text-sm leading-relaxed text-slate-600">{s.text}</span>
                  {on && <span key={`b${attivo}`} className="sal-bar mt-4 block h-1 rounded-full bg-gradient-to-r from-eic-orange to-amber-300" style={{ ["--sal-dur" as string]: `${DUR_PASSO_ANIMATO}ms` }} />}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ───────────────────────── Prima/dopo: schede che girano ─────────────────────────
export type AreaPrimaDopo = { title: string; before: string; after: string };

/**
 * Ogni area è una scheda: davanti il «prima» (rosso), dietro il «dopo» (arancione).
 * Girano da sole una alla volta; col mouse o col tocco le giri tu. Pensata per il
 * fondo scuro della sezione prima/dopo delle pagine funzionalità.
 */
export function CartePrimaDopo({ areas }: { areas: AreaPrimaDopo[] }) {
  const [giro, scegli] = useGiro(areas.length * 2, 2600);
  // a turno: giro pari gira la scheda giro/2, giro dispari la tiene girata
  const girataAuto = Math.floor(giro / 2);
  const [mano, setMano] = useState<Record<number, boolean>>({});
  return (
    <div className="mt-12 grid gap-5 sm:grid-cols-2">
      <style>{`
        .cpd { perspective: 1400px; }
        .cpd-inner { display: grid; transition: transform 750ms cubic-bezier(0.22, 1, 0.36, 1); transform-style: preserve-3d; }
        .cpd-face { grid-area: 1 / 1; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .cpd-back { transform: rotateY(180deg); }
        .cpd[data-girata] .cpd-inner { transform: rotateY(180deg); }
        @media (prefers-reduced-motion: reduce) { .cpd-inner { transition: none; } }
      `}</style>
      {areas.map((a, i) => {
        const girata = mano[i] ?? (girataAuto === i);
        return (
          <button
            key={a.title}
            type="button"
            data-girata={girata ? "" : undefined}
            className="cpd block w-full text-left"
            onPointerEnter={(e) => {
              if (e.pointerType !== "mouse") return;
              scegli(i * 2);
              setMano((m) => ({ ...m, [i]: true }));
            }}
            onPointerLeave={() => setMano((m) => ({ ...m, [i]: false }))}
            onClick={() => setMano((m) => ({ ...m, [i]: !girata }))}
          >
            <span className="cpd-inner">
              <span className="cpd-face flex flex-col rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <span className="text-base font-bold text-white">{a.title}</span>
                <span className="mt-4 inline-flex w-fit items-center rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-red-300">Prima</span>
                <span className="mt-2 text-sm leading-relaxed text-white/70">{a.before}</span>
                <span className="mt-auto pt-4 text-[11px] font-semibold text-white/40">Passa sopra per vedere il dopo →</span>
              </span>
              <span className="cpd-face cpd-back flex flex-col rounded-2xl border border-orange-400/40 bg-gradient-to-br from-orange-500/25 to-amber-400/10 p-6 shadow-[0_20px_50px_-20px_rgba(249,116,21,0.6)]">
                <span className="text-base font-bold text-white">{a.title}</span>
                <span className="mt-4 inline-flex w-fit items-center gap-1 rounded-full bg-eic-orange px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
                  <CheckCircle2 className="h-3 w-3" /> Dopo
                </span>
                <span className="mt-2 text-sm font-medium leading-relaxed text-white/90">{a.after}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────── Funzioni del mestiere: righe che si aprono ─────────────────────────
export type FunzioneMestiere = { icon: LucideIcon; problem: string; solution: string; economicBenefit: string; benefitLabel: string };

/**
 * Le funzioni di un mestiere come righe compatte (problema + risparmio); la soluzione
 * si apre solo sulla riga accesa, che avanza da sola o si sceglie col mouse/tocco.
 */
export function FunzioniMestiere({ features }: { features: FunzioneMestiere[] }) {
  const [attiva, scegli] = useGiro(features.length, 4200);
  return (
    <div className="space-y-3">
      <style>{CSS}</style>
      {features.map((f, i) => {
        const on = i === attiva;
        const Icon = f.icon;
        return (
          <button
            key={i}
            type="button"
            onPointerEnter={(e) => e.pointerType === "mouse" && scegli(i)}
            onClick={() => scegli(i)}
            className={`relative block w-full overflow-hidden rounded-2xl border text-left transition-all duration-500 ${on ? "border-eic-orange/40 bg-white shadow-xl shadow-orange-900/5" : "border-gray-200 bg-[#f8f9fa] hover:bg-white"}`}
          >
            <span className="flex items-center gap-4 p-5">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${on ? "bg-eic-orange text-white" : "bg-eic-orange/10 text-eic-orange"}`}>
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-extrabold uppercase leading-snug tracking-wide text-[#111111]">{f.problem}</span>
              <span className="hidden shrink-0 text-right sm:block">
                <span className={`block text-xl font-extrabold transition-colors md:text-2xl ${on ? "text-eic-orange" : "text-gray-400"}`}>{f.economicBenefit}</span>
                <span className="block text-[10px] uppercase tracking-widest text-gray-500">{f.benefitLabel}</span>
              </span>
            </span>
            <span className={`grid transition-all duration-500 ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <span className="overflow-hidden">
                <span className="block px-5 pb-5 text-sm leading-relaxed text-gray-600 sm:pl-[84px] md:text-base">
                  {f.solution}
                  <span className="mt-2 block text-sm font-bold text-eic-orange sm:hidden">{f.economicBenefit} · {f.benefitLabel}</span>
                </span>
              </span>
            </span>
            {on && <span key={`b${attiva}`} className="sal-bar absolute bottom-0 left-0 h-[3px] bg-eic-orange" style={{ ["--sal-dur" as string]: "4200ms" }} />}
          </button>
        );
      })}
    </div>
  );
}
