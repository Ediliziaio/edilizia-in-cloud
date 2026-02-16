import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Target, TrendingUp, Shield } from "lucide-react";

const questions = [
  { icon: Target, q: "Qual è il margine REALE di ogni commessa?", desc: "Non il margine stimato. Quello vero, aggiornato in tempo reale con costi effettivi." },
  { icon: TrendingUp, q: "Quanta cassa avrò tra 30, 60, 90 giorni?", desc: "Previsione automatica basata su incassi attesi, scadenze fornitori e costi fissi." },
  { icon: Shield, q: "Dove sto perdendo soldi senza saperlo?", desc: "Identifica commesse in perdita, fornitori troppo cari e inefficienze nascoste." },
];

export default function SolutionSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-[#0a0a0a]">
      <div ref={ref} className="max-w-5xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-white text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          La Soluzione: <span className="text-[#c8ee44]">Edilizia in Cloud</span>
        </h2>
        <p
          className={`text-gray-400 text-center mb-16 text-lg max-w-2xl mx-auto transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Un software che risponde alle 3 domande che ogni imprenditore edile dovrebbe farsi ogni giorno.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {questions.map((q, i) => (
            <div
              key={i}
              className={`p-8 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-[#c8ee44]/30 hover:bg-white/[0.05] transition-all duration-500 group ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
              style={{ transitionDelay: isVisible ? `${300 + i * 120}ms` : "0ms" }}
            >
              <div className="w-12 h-12 rounded-xl bg-[#c8ee44]/10 flex items-center justify-center mb-5 group-hover:bg-[#c8ee44]/20 transition-colors">
                <q.icon className="w-6 h-6 text-[#c8ee44]" />
              </div>
              <h3 className="text-white font-bold text-lg mb-3">{q.q}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{q.desc}</p>
            </div>
          ))}
        </div>

        <p
          className={`text-center text-gray-500 mt-14 text-base transition-all duration-700 delay-700 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          Niente corsi di formazione complicati. Niente consulenti costosi.
          <br />
          <strong className="text-gray-300">Apri, guarda i numeri, decidi.</strong>
        </p>
      </div>
    </section>
  );
}
