import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Target, TrendingUp, Shield, PieChart, BarChart3, ArrowUpRight } from "lucide-react";
import AIImage from "./AIImage";

// Pre-calculated bar heights to avoid Math.random() in render
const BAR_HEIGHTS = [32, 48, 25, 55, 38, 42, 28, 52, 35, 45, 30, 58, 40, 22, 50, 36, 46, 33];

const questions = [
  { icon: Target, q: "Qual è il margine REALE di ogni commessa?", desc: "Non il margine stimato. Quello vero, aggiornato in tempo reale con costi effettivi." },
  { icon: TrendingUp, q: "Quanta cassa avrò tra 30, 60, 90 giorni?", desc: "Previsione automatica basata su incassi attesi, scadenze fornitori e costi fissi." },
  { icon: Shield, q: "Dove sto perdendo soldi senza saperlo?", desc: "Identifica commesse in perdita, fornitori troppo cari e inefficienze nascoste." },
];

export default function SolutionSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-[#1a2744] relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#0fa68c]/[0.06] rounded-full blur-[150px]" />

      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-white text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          La Soluzione: <span className="text-[#0fa68c]">Edilizia in Cloud</span>
        </h2>
        <p
          className={`text-white/50 text-center mb-16 text-lg max-w-2xl mx-auto transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Un software che risponde alle 3 domande che ogni imprenditore edile dovrebbe farsi ogni giorno.
        </p>

        <div className="grid md:grid-cols-[1fr_280px] gap-8 mb-16">
          <div className="grid md:grid-cols-3 gap-6">
            {questions.map((q, i) => (
              <div
                key={i}
                className={`p-8 rounded-2xl bg-white/[0.05] border border-white/[0.1] hover:border-[#0fa68c]/40 hover:bg-white/[0.08] transition-all duration-500 group ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                }`}
                style={{ transitionDelay: isVisible ? `${300 + i * 120}ms` : "0ms" }}
              >
                <div className="w-12 h-12 rounded-xl bg-[#0fa68c]/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                  <q.icon className="w-6 h-6 text-[#0fa68c]" />
                </div>
                <h3 className="text-white font-bold text-lg mb-3">{q.q}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{q.desc}</p>
              </div>
            ))}
          </div>

          <div className="hidden md:flex items-center">
            <AIImage
              prompt="Dashboard digitale moderna su tablet con grafici a barre e linee colorati, cantiere edile sullo sfondo sfocato con gru, stile illustrazione flat professionale, palette teal e navy, aspetto pulito e moderno"
              alt="Dashboard su tablet in cantiere"
              className="w-full"
            />
          </div>
        </div>

        {/* Dashboard mockup */}
        <div
          className={`relative rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8 overflow-hidden transition-all duration-700 delay-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="flex items-center gap-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-red-400/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-400/60" />
            <div className="w-3 h-3 rounded-full bg-green-400/60" />
            <span className="ml-3 text-white/30 text-xs">dashboard.ediliziaincloud.com</span>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Margine Medio", value: "24.5%", icon: PieChart, color: "text-[#0fa68c]" },
              { label: "Cassa Disponibile", value: "€ 128.450", icon: BarChart3, color: "text-[#0fa68c]" },
              { label: "Commesse Attive", value: "12", icon: ArrowUpRight, color: "text-[#0fa68c]" },
            ].map((stat, i) => (
              <div key={i} className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.08]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/40 text-xs">{stat.label}</span>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <p className={`font-bold text-xl ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-6 gap-2">
            {BAR_HEIGHTS.map((h, i) => (
              <div
                key={i}
                className="rounded bg-white/[0.04] border border-white/[0.06]"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent animate-shimmer" style={{ backgroundSize: "200% 100%" }} />
        </div>

        <p
          className={`text-center text-white/40 mt-14 text-base transition-all duration-700 delay-700 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          Niente corsi di formazione complicati. Niente consulenti costosi.
          <br />
          <strong className="text-white/70">Apri, guarda i numeri, decidi.</strong>
        </p>
      </div>
    </section>
  );
}
