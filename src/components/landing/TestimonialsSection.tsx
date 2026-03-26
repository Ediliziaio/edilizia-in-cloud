import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Star, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import FloatingEdiliziaIcons from "./FloatingEdiliziaIcons";
import { useRef, useState } from "react";

const clientBadges = [
  { initials: "RC", name: "Rossi Costruzioni Srl", city: "Roma", months: 14, gradient: "from-[#F97415] to-[#0d8f79]" },
  { initials: "EL", name: "Edil Lombardi", city: "Milano", months: 9, gradient: "from-[#111111] to-[#243566]" },
  { initials: "CF", name: "Costruzioni Ferretti", city: "Napoli", months: 22, gradient: "from-[#F97415] to-[#0a7a65]" },
  { initials: "GB", name: "GreenBuild Italia", city: "Torino", months: 7, gradient: "from-[#111111] to-[#F97415]" },
];

const testimonials = [
  {
    company: "Costruzioni Rossi S.r.l.",
    city: "Roma",
    sector: "Ristrutturazioni residenziali",
    revenue: "1.2M €",
    person: "Marco Rossi",
    role: "Titolare",
    initials: "MR",
    gradient: "from-[#F97415] to-[#0a7a65]",
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
    gradient: "from-[#0d8f79] to-[#F97415]",
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
    gradient: "from-[#111111] to-[#F97415]",
    quote: "Come startup non potevamo permetterci errori. Edilizia in Cloud ci ha dato il controllo dal giorno uno. Ora cresciamo con numeri veri.",
    before: "Margine stimato \"a occhio\"",
    after: "+22% redditività in 6 mesi",
  },
];

export default function TestimonialsSection() {
  const { ref, isVisible } = useScrollAnimation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollTo = (index: number) => {
    const clamped = Math.max(0, Math.min(index, testimonials.length - 1));
    setActiveIndex(clamped);
    if (scrollRef.current) {
      const cards = scrollRef.current.querySelectorAll<HTMLElement>(".testimonial-card");
      if (cards[clamped]) {
        cards[clamped].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, offsetWidth } = scrollRef.current;
    const cardWidth = offsetWidth;
    const newIndex = Math.round(scrollLeft / (cardWidth / 1.2));
    setActiveIndex(Math.max(0, Math.min(newIndex, testimonials.length - 1)));
  };

  return (
    <section className="py-14 md:py-32 bg-[#111111] overflow-hidden relative">
      {/* Background glow */}
      {/* Luminous top border */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.7) 30%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.7) 70%, transparent 100%)" }} />
      {/* Glow orbs — intensificati */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full blur-[140px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse, rgba(249,116,21,0.18) 0%, transparent 65%)" }} />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full blur-[130px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(249,116,21,0.12) 0%, transparent 65%)" }} />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full blur-[130px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(249,116,21,0.12) 0%, transparent 65%)" }} />
      <FloatingEdiliziaIcons variant={4} />

      <div ref={ref} className="max-w-7xl mx-auto px-6 relative z-10">

        {/* Header */}
        <div className={`text-center mb-12 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <p className="inline-block mb-4 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest text-[#F97415] bg-[#F97415]/10 border border-[#F97415]/20">
            Casi Studio Reali
          </p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">
            Imprenditori Edili. Risultati{" "}
            <span className="text-[#F97415]">Reali.</span>
          </h2>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            Ecco cosa hanno ottenuto le imprese che hanno scelto Edilizia in Cloud. Numeri veri, nomi veri.
          </p>
        </div>

        {/* Client badge strip */}
        <div
          className={`grid grid-cols-2 md:grid-cols-4 gap-3 mb-14 transition-all duration-700 delay-200 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {clientBadges.map((badge, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-xl p-3 backdrop-blur"
            >
              <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${badge.gradient} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                {badge.initials}
              </div>
              <div className="min-w-0">
                <p className="text-white/90 font-semibold text-xs truncate">{badge.name}</p>
                <p className="text-white/40 text-[10px]">{badge.city} · Cliente da {badge.months} mesi</p>
              </div>
            </div>
          ))}
        </div>

        {/* Carousel */}
        <div className="relative">
          {/* Desktop nav arrows */}
          <button
            onClick={() => scrollTo(activeIndex - 1)}
            className="hidden md:flex absolute -left-5 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/10 border border-white/20 items-center justify-center text-white hover:bg-white/20 transition-all duration-200 hover:scale-110"
            aria-label="Testimonianza precedente"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => scrollTo(activeIndex + 1)}
            className="hidden md:flex absolute -right-5 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/10 border border-white/20 items-center justify-center text-white hover:bg-white/20 transition-all duration-200 hover:scale-110"
            aria-label="Testimonianza successiva"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Cards scroll container */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex gap-5 overflow-x-auto scrollbar-none pb-4"
            style={{ scrollSnapType: "x mandatory" }}
          >
            {testimonials.map((t, i) => (
              <div
                key={i}
                className={`testimonial-card flex-shrink-0 w-[85vw] md:w-[calc(33.333%-14px)] bg-white/[0.06] backdrop-blur border border-white/10 rounded-2xl p-7 flex flex-col transition-all duration-700 hover:border-white/20 hover:bg-white/[0.09] ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                }`}
                style={{
                  scrollSnapAlign: "center",
                  transitionDelay: isVisible ? `${300 + i * 150}ms` : "0ms",
                }}
              >
                {/* Avatar + info */}
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-lg`}>
                    {t.initials}
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">{t.company}</p>
                    <p className="text-white/40 text-xs mt-0.5">{t.city} · {t.sector}</p>
                    <p className="text-white/30 text-xs">Fatt. {t.revenue}</p>
                  </div>
                </div>

                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>

                {/* Quote */}
                <p className="text-white/80 italic text-lg leading-relaxed mb-6 flex-1">
                  "{t.quote}"
                </p>

                {/* Before / After */}
                <div className="flex items-stretch gap-2 rounded-xl overflow-hidden border border-white/10">
                  <div className="flex-1 bg-red-500/10 p-3 border-r border-white/10">
                    <p className="text-red-400 text-[10px] font-bold uppercase tracking-wide mb-1">Prima</p>
                    <p className="text-red-300 font-semibold text-xs leading-snug">{t.before}</p>
                  </div>
                  <div className="flex items-center px-1 text-white/30">
                    <ArrowRight className="w-4 h-4 flex-shrink-0" />
                  </div>
                  <div className="flex-1 bg-[#F97415]/10 p-3">
                    <p className="text-[#F97415] text-[10px] font-bold uppercase tracking-wide mb-1">Dopo</p>
                    <p className="text-[#4dd4be] font-semibold text-xs leading-snug">{t.after}</p>
                  </div>
                </div>

                {/* Person */}
                <p className="text-white/40 text-xs mt-4 text-right">
                  — {t.person}, {t.role}
                </p>
              </div>
            ))}
          </div>

          {/* Dot indicators */}
          <div className="flex justify-center gap-2 mt-6">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollTo(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === activeIndex
                    ? "w-6 h-2 bg-[#F97415]"
                    : "w-2 h-2 bg-white/20 hover:bg-white/40"
                }`}
                aria-label={`Vai alla testimonianza ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
