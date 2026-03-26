import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Wrench, BarChart3, TrendingUp } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Wrench,
    title: "Imposta il tuo gestionale",
    description:
      "In 48 ore il nostro team configura tutto in base alla tua impresa: cantieri, dipendenti, fornitori, listini. Nessuna competenza tecnica richiesta.",
    badge: "Setup in 48 ore garantito",
    badgeColor: "#0fa68c",
  },
  {
    number: "02",
    icon: BarChart3,
    title: "Controlla in tempo reale",
    description:
      "Dashboard live con margini, cassa, avanzamento cantieri e scadenze. Sempre aggiornata, sempre accessibile — da PC, tablet o smartphone in cantiere.",
    badge: null,
    badgeColor: null,
  },
  {
    number: "03",
    icon: TrendingUp,
    title: "Aumenta i margini",
    description:
      "Il tuo Consulente del Controllo dedicato analizza i dati con te ogni mese. Individua sprechi, opportunità, e ti aiuta a prendere decisioni migliori.",
    badge: null,
    badgeColor: null,
  },
];

export default function HowItWorksSection() {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1 });

  return (
    <section className="py-24 md:py-32 relative overflow-hidden">
      {/* Background image with heavy overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1920&q=80')",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "rgba(255,255,255,0.96)" }}
      />

      <div ref={ref} className="max-w-6xl mx-auto px-6 relative z-10">
        {/* Header */}
        <div
          className="text-center mb-16 md:mb-20 transition-all duration-700"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <p
            className="inline-block mb-4 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest"
            style={{
              color: "#0fa68c",
              backgroundColor: "rgba(15, 166, 140, 0.08)",
              border: "1px solid rgba(15, 166, 140, 0.2)",
            }}
          >
            Come Funziona
          </p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1a2744] mb-4">
            Tre passi per <span style={{ color: "#0fa68c" }}>controllare tutto</span>
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Semplice da iniziare. Potente da usare. Risultati concreti in settimane, non anni.
          </p>
        </div>

        {/* Steps: horizontal on desktop, vertical on mobile */}
        <div className="relative">
          {/* Horizontal connector line (desktop only) — animated */}
          <div
            className="hidden md:block absolute top-[52px] left-[calc(16.67%+8px)] right-[calc(16.67%+8px)] h-0.5"
            style={{ backgroundColor: "rgba(15, 166, 140, 0.15)" }}
          />
          {/* Animated fill layer */}
          <div
            className="hidden md:block absolute top-[52px] left-[calc(16.67%+8px)] right-[calc(16.67%+8px)] h-0.5 origin-left"
            style={{
              backgroundColor: "#0fa68c",
              transform: isVisible ? "scaleX(1)" : "scaleX(0)",
              transformOrigin: "left center",
              transition: "transform 1.2s ease-out",
              transitionDelay: isVisible ? "400ms" : "0ms",
            }}
          />

          <div className="grid md:grid-cols-3 gap-8 md:gap-6 relative z-10">
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex flex-col items-center md:items-center text-center transition-all duration-700"
                style={{
                  transitionDelay: isVisible ? `${i * 200}ms` : "0ms",
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? "translateY(0)" : "translateY(28px)",
                }}
              >
                {/* Vertical connector (mobile only) */}
                {i < steps.length - 1 && (
                  <div
                    className="md:hidden w-0.5 h-8 my-4 order-last"
                    style={{ backgroundColor: "rgba(15, 166, 140, 0.2)" }}
                  />
                )}

                {/* Step circle — animated number */}
                <div
                  className="relative w-[68px] h-[68px] rounded-full flex items-center justify-center mb-6 flex-shrink-0 transition-all duration-500"
                  style={{
                    backgroundColor: "white",
                    border: "2.5px solid #0fa68c",
                    boxShadow: isVisible
                      ? "0 4px 20px rgba(15, 166, 140, 0.25)"
                      : "none",
                    transform: isVisible ? "scale(1)" : "scale(0.7)",
                    transitionDelay: isVisible ? `${i * 200}ms` : "0ms",
                  }}
                >
                  {/* Number badge */}
                  <span
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500"
                    style={{
                      backgroundColor: "#0fa68c",
                      transform: isVisible ? "scale(1) rotate(0deg)" : "scale(0) rotate(-90deg)",
                      transitionDelay: isVisible ? `${100 + i * 200}ms` : "0ms",
                    }}
                  >
                    {i + 1}
                  </span>
                  <step.icon size={26} color="#0fa68c" />
                </div>

                {/* Card */}
                <div
                  className="w-full bg-white rounded-2xl p-6 flex-1 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                  style={{
                    boxShadow: "0 4px 24px rgba(26, 39, 68, 0.07)",
                    border: "1px solid rgba(26, 39, 68, 0.06)",
                  }}
                >
                  <h3 className="text-[#1a2744] font-bold text-xl mb-3">{step.title}</h3>
                  <p className="text-gray-500 text-sm md:text-base leading-relaxed mb-4">
                    {step.description}
                  </p>

                  {/* Badge */}
                  {step.badge && (
                    <div
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: "rgba(15, 166, 140, 0.1)",
                        color: "#0fa68c",
                        border: "1px solid rgba(15, 166, 140, 0.2)",
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: "#0fa68c" }}
                      />
                      {step.badge}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA nudge */}
        <div
          className="text-center mt-14 md:mt-16 transition-all duration-700"
          style={{
            transitionDelay: isVisible ? "750ms" : "0ms",
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(16px)",
          }}
        >
          <a
            href="#cta-finale"
            onClick={(e) => {
              e.preventDefault();
              document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-bold text-white text-base transition-all duration-200 hover:scale-105 hover:shadow-xl"
            style={{
              backgroundColor: "#0fa68c",
              boxShadow: "0 8px 24px rgba(15, 166, 140, 0.3)",
            }}
          >
            Inizia ora — Setup in 48 ore
          </a>
          <p className="text-gray-400 text-sm mt-3">Nessuna competenza tecnica richiesta</p>
        </div>
      </div>
    </section>
  );
}
