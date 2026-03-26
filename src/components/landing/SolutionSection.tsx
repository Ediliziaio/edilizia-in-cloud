import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Target, TrendingUp, Shield, PieChart, BarChart3, ArrowUpRight } from "lucide-react";
import FloatingEdiliziaIcons from "./FloatingEdiliziaIcons";
import AIImage from "./AIImage";

// Pre-calculated bar heights to avoid Math.random() in render
const BAR_HEIGHTS = [32, 48, 25, 55, 38, 42, 28, 52, 35, 45, 30, 58, 40, 22, 50, 36, 46, 33];

const questions = [
  { icon: Target, q: "Qual è il margine REALE di ogni commessa, oggi?", desc: "Non il preventivato. Il margine vero, con i costi reali aggiornati al minuto — inclusa manodopera, materiali e overhead." },
  { icon: TrendingUp, q: "Quanta cassa avrò tra 30, 60 e 90 giorni?", desc: "Forecast di liquidità automatico basato su incassi attesi, scadenze fornitori, stipendi e costi fissi. Zero sorprese." },
  { icon: Shield, q: "Dove sto perdendo soldi senza saperlo?", desc: "Identifica le commesse in perdita, i fornitori troppo cari, le ore di manodopera non imputate. Prima che sia troppo tardi." },
];

export default function SolutionSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-16 md:py-32 bg-[#111111] relative overflow-hidden">
      {/* Luminous top border */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.7) 30%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.7) 70%, transparent 100%)" }} />
      {/* Glow orbs — intensificati */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[160px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(249,116,21,0.22) 0%, transparent 65%)" }} />
      <div className="absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full blur-[130px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(249,116,21,0.16) 0%, transparent 65%)" }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full pointer-events-none blur-[120px]"
        style={{ background: "radial-gradient(ellipse, rgba(249,116,21,0.08) 0%, transparent 70%)" }} />
      <FloatingEdiliziaIcons variant={1} />

      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-white text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Smetti di indovinare. <span className="text-[#F97415]">Inizia a sapere.</span>
        </h2>
        <p
          className={`text-white/50 text-center mb-16 text-lg max-w-2xl mx-auto transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Edilizia in Cloud risponde alle 3 domande che ogni imprenditore edile dovrebbe poter vedere in tempo reale — da qualsiasi dispositivo, in qualsiasi momento.
        </p>

        <div className="grid md:grid-cols-[1fr_280px] gap-8 mb-16">
          <div className="grid md:grid-cols-3 gap-6">
            {questions.map((q, i) => (
              <div
                key={i}
                className={`p-8 rounded-2xl bg-white/[0.05] border border-white/[0.1] hover:border-[#F97415]/40 hover:bg-white/[0.08] transition-all duration-500 group ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                }`}
                style={{ transitionDelay: isVisible ? `${300 + i * 120}ms` : "0ms" }}
              >
                <div className="w-12 h-12 rounded-xl bg-[#F97415]/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                  <q.icon className="w-6 h-6 text-[#F97415]" />
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
            {[
              { label: "Margine Medio", value: "24.5%", icon: PieChart, color: "text-[#F97415]" },
              { label: "Cassa Disponibile", value: "€ 128.450", icon: BarChart3, color: "text-[#F97415]" },
              { label: "Commesse Attive", value: "12", icon: ArrowUpRight, color: "text-[#F97415]" },
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
          <div className="hidden sm:grid grid-cols-6 gap-2 overflow-hidden">
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
          Nessun corso. Nessuna consulenza infinita. Nessun foglio Excel.
          <br />
          <strong className="text-white/70">Apri il gestionale, guarda i numeri, decidi. Da domani.</strong>
        </p>
      </div>
    </section>
  );
}
