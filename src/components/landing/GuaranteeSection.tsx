import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Shield, TrendingUp, Headphones, Zap, ArrowRight } from "lucide-react";

const guaranteeItems = [
  {
    icon: Shield,
    text: "31 giorni soddisfatti o rimborsati",
  },
  {
    icon: TrendingUp,
    text: "Se non aumenti i margini, paghi solo l'abbonamento base",
  },
  {
    icon: Headphones,
    text: "Supporto dedicato incluso nel prezzo",
  },
  {
    icon: Zap,
    text: "Setup e migrazione dati inclusi gratuitamente",
  },
];

export default function GuaranteeSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section
      id="garanzie"
      className="py-24 md:py-32 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #F97415 0%, #e8650e 100%)" }}
    >
      {/* Decorative background shapes */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/[0.04] rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-white/[0.03] rounded-full translate-y-1/2 -translate-x-1/3 pointer-events-none" />

      <div ref={ref} className="max-w-6xl mx-auto px-6 relative z-10">
        <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">

          {/* LEFT — Text + guarantee list */}
          <div
            className={`transition-all duration-700 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
            }`}
          >
            <p className="inline-block mb-5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#F97415] bg-white/20 border border-white/30">
              La nostra promessa
            </p>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-6 leading-tight">
              Se non ti fa guadagnare più di quanto spendi, è{" "}
              <span className="underline decoration-white/40 underline-offset-4">gratis.</span>
            </h2>

            <p className="text-white/80 text-lg leading-relaxed mb-10">
              Non ti chiediamo di fidarti sulla parola. Ti chiediamo di provare per 31 giorni. Se non vedi un miglioramento concreto nei tuoi margini, rimborsiamo ogni centesimo. Senza domande, senza burocrazia.
            </p>

            <ul className="space-y-4 mb-10">
              {guaranteeItems.map((item, i) => {
                const Icon = item.icon;
                return (
                  <li
                    key={i}
                    className={`flex items-center gap-4 transition-all duration-500 ${
                      isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6"
                    }`}
                    style={{ transitionDelay: isVisible ? `${300 + i * 120}ms` : "0ms" }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-white font-medium text-base">{item.text}</span>
                  </li>
                );
              })}
            </ul>

            {/* CTA */}
            <a
              href="#cta-finale"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-[#F97415] font-bold text-lg hover:bg-white/90 hover:scale-105 transition-all duration-300 shadow-2xl shadow-black/20 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{ transitionDelay: isVisible ? "750ms" : "0ms" }}
            >
              Inizia Adesso — Zero Rischi
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>

          {/* RIGHT — Big badge */}
          <div
            className={`flex justify-center transition-all duration-700 delay-300 ${
              isVisible ? "opacity-100 translate-x-0 scale-100" : "opacity-0 translate-x-10 scale-95"
            }`}
          >
            <div className="relative">
              {/* Outer ring — dashed */}
              <div
                className="w-72 h-72 md:w-80 md:h-80 rounded-full flex items-center justify-center"
                style={{
                  border: "2px dashed rgba(255,255,255,0.4)",
                  background: "rgba(255,255,255,0.08)",
                  backdropFilter: "blur(10px)",
                }}
              >
                {/* Inner content */}
                <div className="text-center px-8">
                  <p className="text-white/60 text-sm font-bold uppercase tracking-[0.2em] mb-2">
                    GARANZIA
                  </p>
                  <p className="text-white font-black leading-none mb-3" style={{ fontSize: "clamp(4rem, 12vw, 6rem)" }}>
                    100%
                  </p>
                  <p className="text-white/80 text-base font-semibold leading-snug">
                    Soddisfatti<br />o Rimborsati
                  </p>
                  <div className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/20 border border-white/30">
                    <Shield className="w-4 h-4 text-white" />
                    <span className="text-white text-xs font-bold tracking-wide">31 GIORNI</span>
                  </div>
                </div>
              </div>

              {/* Floating accent dots */}
              <div className="absolute -top-4 -right-4 w-8 h-8 rounded-full bg-white/20 animate-float" />
              <div className="absolute -bottom-6 -left-6 w-12 h-12 rounded-full bg-white/10 animate-float-slow" />
              <div className="absolute top-1/2 -right-10 w-5 h-5 rounded-full bg-white/30 animate-float delay-300" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
