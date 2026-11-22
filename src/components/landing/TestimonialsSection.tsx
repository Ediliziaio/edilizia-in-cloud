import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Star, ArrowRight, Quote } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Recensioni in home. Una alla volta, grande, che cambia da sola: le stelle si
 * accendono una dopo l'altra, la frase entra, il «prima» resta fermo e il «dopo»
 * arriva per ultimo. A fianco (su telefono: sopra, in fila da scorrere) le aziende:
 * quella accesa ha la barra che avanza; toccandone una il giro si ferma per un po'.
 * Le aziende dell'elenco SONO quelle delle recensioni: un solo elenco, niente doppioni.
 */
const testimonials = [
  {
    company: "Costruzioni Rossi S.r.l.",
    city: "Roma",
    sector: "Ristrutturazioni residenziali",
    revenue: "1.2M €",
    person: "Marco Rossi",
    role: "Titolare",
    initials: "MR",
    gradient: "from-eic-orange to-[#0a7a65]",
    quote: "In 8 mesi abbiamo scoperto che 3 cantieri su 10 erano in perdita. Ora ogni commessa è sotto controllo e i margini sono finalmente quelli che avevo immaginato.",
    before: "80.000 € utile (6.7%)",
    after: "360.000 € utile (30%)",
  },
  {
    company: "Edil Progetti S.r.l.",
    city: "Milano",
    sector: "Impiantistica e manutenzioni",
    revenue: "800K €",
    person: "Laura Bianchi",
    role: "Amministratrice",
    initials: "LB",
    gradient: "from-[#111111] to-[#243566]",
    quote: "Prima rincorrevamo i pagamenti ogni giorno. Ora il forecast ci dice esattamente quando e quanto incasseremo. La cassa è sempre positiva.",
    before: "Incassi a 90 giorni",
    after: "Incassi a 35 giorni, cassa positiva",
  },
  {
    company: "Fratelli Conti Costruzioni",
    city: "Napoli",
    sector: "Edilizia civile e appalti pubblici",
    revenue: "3.5M €",
    person: "Giuseppe Conti",
    role: "Direttore Tecnico",
    initials: "GC",
    gradient: "from-[#0d8f79] to-eic-orange",
    quote: "Ho eliminato Excel dalla mia vita. Dashboard, margini, stato cantieri: tutto in un click. 12 ore a settimana risparmiate solo sui report.",
    before: "2 giorni/settimana su Excel",
    after: "Report automatici, 12h/sett risparmiate",
  },
  {
    company: "GreenBuild Italia",
    city: "Torino",
    sector: "Costruzioni sostenibili",
    revenue: "600K €",
    person: "Alessia Verde",
    role: "Co-fondatrice",
    initials: "AV",
    gradient: "from-[#111111] to-eic-orange",
    quote: "Come startup non potevamo permetterci errori. Edilizia in Cloud ci ha dato il controllo dal giorno uno. Ora cresciamo con numeri veri.",
    before: "Margine stimato \"a occhio\"",
    after: "+22% redditività in 6 mesi",
  },
];

const DURATA = 6500;
const adesso = () => Date.now();

const CSS = `
@keyframes tst-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
.tst-in { animation: tst-in 600ms cubic-bezier(0.22,1,0.36,1) backwards; }
@keyframes tst-star { 0% { opacity: 0; transform: scale(0.3) rotate(-30deg) } 70% { transform: scale(1.25) } 100% { opacity: 1; transform: none } }
.tst-star { animation: tst-star 420ms cubic-bezier(0.22,1,0.36,1) backwards; }
@keyframes tst-dopo { from { opacity: 0; transform: translateX(-14px) scale(0.96) } to { opacity: 1; transform: none } }
.tst-dopo { animation: tst-dopo 650ms cubic-bezier(0.22,1,0.36,1) 900ms backwards; }
@keyframes tst-freccia { 0%,100% { transform: translateX(-3px) } 50% { transform: translateX(3px) } }
.tst-freccia { animation: tst-freccia 1.4s ease-in-out infinite; }
@keyframes tst-bar { from { transform: scaleX(0) } to { transform: scaleX(1) } }
.tst-bar { transform-origin: left; animation: tst-bar var(--tst-dur) linear forwards; }
@media (prefers-reduced-motion: reduce) { .tst-in, .tst-star, .tst-dopo, .tst-freccia, .tst-bar { animation: none !important; } }
`;

export default function TestimonialsSection() {
  const { ref, isVisible } = useScrollAnimation();
  const [attiva, setAttiva] = useState(0);
  const pausaFino = useRef(0);
  const fila = useRef<HTMLDivElement>(null);

  // il giro parte solo quando la sezione è a schermo
  useEffect(() => {
    if (!isVisible || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (Date.now() < pausaFino.current || document.hidden) return;
      setAttiva((v) => (v + 1) % testimonials.length);
    }, DURATA);
    return () => window.clearInterval(id);
  }, [isVisible]);

  // su telefono la fila delle aziende segue quella accesa (si muove la fila, non la pagina)
  useEffect(() => {
    const el = fila.current;
    if (!el || el.scrollWidth <= el.clientWidth + 4) return;
    const figlio = el.children[attiva] as HTMLElement | undefined;
    if (!figlio) return;
    const left = figlio.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft - 24;
    el.scrollTo({ left, behavior: "smooth" });
  }, [attiva]);

  const scegli = (i: number) => {
    pausaFino.current = adesso() + 12000;
    setAttiva(i);
  };

  const t = testimonials[attiva];

  return (
    <section className="py-14 md:py-28 bg-[#f8fafc] overflow-hidden relative">
      <style>{CSS}</style>
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div className="pointer-events-none absolute top-0 left-1/2 h-[420px] w-[800px] -translate-x-1/2 rounded-full blur-[140px]" style={{ background: "radial-gradient(ellipse, rgba(249,116,21,0.12) 0%, transparent 65%)" }} />

      <div ref={ref} className="max-w-6xl mx-auto px-6 relative z-10">
        {/* Header */}
        <div className={`text-center mb-8 md:mb-12 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <p className="inline-block mb-4 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest text-eic-orange bg-eic-orange/10 border border-eic-orange/20">
            Casi Studio Reali
          </p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#111111] mb-3">
            Imprenditori Edili. Risultati{" "}
            <span className="text-eic-orange">Reali.</span>
          </h2>
          <p className="text-gray-600 text-base md:text-lg max-w-2xl mx-auto">
            Ecco cosa ottengono le imprese edili che passano a Edilizia in Cloud.
          </p>
        </div>

        <div className={`grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:items-stretch transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          {/* Le aziende: su telefono fila da scorrere sopra la recensione, da computer colonna a destra */}
          <div
            ref={fila}
            onTouchStart={() => { pausaFino.current = adesso() + 12000; }}
            className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-1 scrollbar-none lg:order-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
          >
            {testimonials.map((c, i) => {
              const on = i === attiva;
              return (
                <button
                  key={c.company}
                  type="button"
                  onClick={() => scegli(i)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && scegli(i)}
                  aria-pressed={on}
                  className={`relative flex w-[210px] shrink-0 items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition-all duration-500 lg:w-auto lg:flex-1 lg:p-4 ${on ? "border-eic-orange/50 bg-white shadow-lg shadow-orange-900/10" : "border-gray-200 bg-white/60 hover:border-gray-300"}`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${c.gradient} text-xs font-bold text-white transition-transform duration-500 ${on ? "scale-110" : ""}`}>
                    {c.initials}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-[#111111]">{c.company}</span>
                    <span className="block truncate text-xs text-gray-500">{c.city} · {c.sector}</span>
                  </span>
                  {on && <span key={attiva} className="tst-bar absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-eic-orange to-amber-300" style={{ ["--tst-dur" as string]: `${DURATA}ms` }} />}
                </button>
              );
            })}
          </div>

          {/* La recensione accesa */}
          <figure className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-xl shadow-slate-900/5 md:p-10 lg:order-1">
            <Quote aria-hidden className="pointer-events-none absolute -right-3 -top-3 h-28 w-28 text-eic-orange/[0.07] md:h-40 md:w-40" />
            <div key={attiva} className="relative flex h-full flex-col">
              <div className="flex gap-1" aria-label="5 stelle su 5">
                {[0, 1, 2, 3, 4].map((s) => (
                  <Star key={s} className="tst-star h-5 w-5 fill-amber-400 text-amber-400" style={{ animationDelay: `${s * 90}ms` }} />
                ))}
              </div>

              <blockquote className="tst-in mt-5 flex-1 text-lg font-medium leading-relaxed text-[#111111] md:text-2xl md:leading-snug" style={{ animationDelay: "150ms" }}>
                «{t.quote}»
              </blockquote>

              {/* Prima → Dopo */}
              <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 md:gap-3">
                <div className="tst-in rounded-2xl border border-red-100 bg-red-50 p-3 md:p-4" style={{ animationDelay: "400ms" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">Prima</p>
                  <p className="mt-1 text-xs font-semibold leading-snug text-red-800 md:text-sm">{t.before}</p>
                </div>
                <div className="flex items-center text-eic-orange">
                  <ArrowRight className="tst-freccia h-5 w-5" />
                </div>
                <div className="tst-dopo rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-[0_0_0_4px_rgba(16,185,129,0.08)] md:p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Dopo</p>
                  <p className="mt-1 text-xs font-bold leading-snug text-emerald-900 md:text-sm">{t.after}</p>
                </div>
              </div>

              <figcaption className="tst-in mt-6 flex items-center gap-3 border-t border-gray-100 pt-5" style={{ animationDelay: "550ms" }}>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${t.gradient} text-sm font-bold text-white shadow-lg`}>
                  {t.initials}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[#111111]">{t.person} · {t.role}</span>
                  <span className="block text-xs text-gray-500">{t.company}, {t.city} · Fatt. {t.revenue}</span>
                </span>
              </figcaption>
            </div>
          </figure>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Le esperienze riportate sono individuali: non rappresentano una media né un risultato economico garantito.
        </p>
      </div>
    </section>
  );
}
