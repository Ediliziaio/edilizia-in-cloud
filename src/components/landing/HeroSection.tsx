import { useScrollAnimation } from "@/hooks/useScrollAnimation";

export default function HeroSection() {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1 });

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at 50% 0%, #1a2a1a 0%, #0a0a0a 60%)",
      }}
    >
      {/* Subtle grid overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <div
          className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
        >
          <span className="inline-block mb-6 px-4 py-2 rounded-full border border-[#c8ee44]/30 bg-[#c8ee44]/10 text-[#c8ee44] text-xs font-semibold uppercase tracking-widest">
            Il #1 Software in Italia per Imprenditori Edili
          </span>
        </div>

        <h1
          className={`text-4xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight mb-6 transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Smetti di Fatturare al Buio.
          <br />
          <span className="text-[#c8ee44]">Inizia a Guadagnare con i Numeri.</span>
        </h1>

        <p
          className={`text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Il primo software gestionale progettato da imprenditori edili, per imprenditori edili.
          Controlla margini, cassa e commesse in tempo reale — senza fogli Excel, senza sorprese.
        </p>

        <div
          className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-500 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <a
            href="#cta-finale"
            onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }}
            className="px-8 py-4 rounded-lg bg-[#c8ee44] text-[#0a0a0a] font-bold text-lg hover:bg-[#d4f55a] hover:scale-105 transition-all duration-200 shadow-[0_0_30px_rgba(200,238,68,0.3)]"
          >
            Richiedi Demo Gratuita
          </a>
          <a
            href="#moduli"
            onClick={(e) => { e.preventDefault(); document.querySelector("#moduli")?.scrollIntoView({ behavior: "smooth" }); }}
            className="px-8 py-4 rounded-lg border border-white/20 text-white font-semibold hover:bg-white/5 hover:border-white/40 transition-all duration-200"
          >
            Scopri le Funzionalità
          </a>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
    </section>
  );
}
