import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ArrowRight, Shield, Check } from "lucide-react";
import { Link } from "react-router-dom";

export default function PricingSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="prezzi" className="py-24 md:py-32 bg-[#111111] relative overflow-hidden">
      {/* Glow */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.8) 60%, transparent 100%)" }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(249,116,21,0.10) 0%, transparent 100%)" }} />

      <div ref={ref} className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        {/* Label */}
        <div className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <span className="inline-block mb-5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#F97415] bg-[#F97415]/10 border border-[#F97415]/20">
            Pronto a partire?
          </span>
        </div>

        {/* Hero claim — niente prezzo, focus su prova + consulenza */}
        <div className={`transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h2 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-4">
            Provalo <span className="text-[#F97415]">gratis</span>.<br className="hidden sm:block" /> Il piano lo costruiamo su di te.
          </h2>
          <p className="text-white/50 text-base md:text-lg max-w-2xl mx-auto mb-2">
            Inizia senza carta con il piano Scopri. Quando vuoi crescere, definiamo insieme il piano giusto
            in una <span className="text-white/80 font-semibold">consulenza gratuita</span> — paghi solo per ciò che ti serve davvero.
          </p>
          <p className="text-white/30 text-sm mb-8">
            Gestionale · Professionista · Impresa AI — su misura per la tua impresa
          </p>
        </div>

        {/* 3 quick features */}
        <div className={`flex flex-wrap items-center justify-center gap-4 mb-10 transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          {[
            "Margini cantieri in tempo reale",
            "Fatturazione elettronica",
            "App mobile cantiere",
          ].map((f, i) => (
            <span key={i} className="flex items-center gap-2 text-white/60 text-sm">
              <Check className="w-4 h-4 text-[#F97415] flex-shrink-0" />
              {f}
            </span>
          ))}
        </div>

        {/* Free trial badge */}
        <div className={`inline-flex items-center gap-3 bg-white/[0.07] border border-[#F97415]/30 rounded-2xl px-6 py-4 mb-10 transition-all duration-700 delay-300 ${isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
          <Shield className="w-5 h-5 text-[#F97415] flex-shrink-0" />
          <span className="text-white font-bold text-base">
            🎉 Prova gratuita di <span className="text-[#F97415]">31 giorni</span> — se non ti piace, non paghi nulla. Nessun obbligo.
          </span>
        </div>

        {/* CTAs */}
        <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-400 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <button
            type="button"
            onClick={() => { import("@/components/landing/QuickContactModal").then(m => m.openContactModal()); }}
            className="w-full sm:w-auto px-8 py-4 rounded-full bg-[#F97415] text-white font-bold text-lg hover:bg-[#e8650e] hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30"
          >
            Inizia Gratis Adesso →
          </button>
          <Link
            to="/prezzi/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full border border-white/20 text-white font-semibold hover:bg-white/5 hover:border-white/40 transition-all"
          >
            Vedi tutti i piani <ArrowRight size={16} />
          </Link>
        </div>

        <p className={`mt-6 text-white/30 text-xs transition-all duration-700 delay-500 ${isVisible ? "opacity-100" : "opacity-0"}`}>
          Setup in 48h incluso · Supporto italiano dedicato · Dati cifrati e al sicuro
        </p>
      </div>
    </section>
  );
}
