import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Check, X } from "lucide-react";

const forYou = [
  "Sei un imprenditore edile che fattura almeno 500K€/anno",
  "Vuoi sapere ESATTAMENTE quanto guadagni su ogni commessa",
  "Sei stanco di Excel e vuoi uno strumento professionale",
  "Vuoi prevedere la cassa e non avere più sorprese",
  "Credi che i numeri siano la base per crescere",
];

const notForYou = [
  "Preferisci continuare con carta e penna",
  "Non vuoi investire 10 minuti al giorno nei tuoi numeri",
  "Pensi che il fatturato sia uguale al guadagno",
  "Non sei disposto a cambiare il modo in cui gestisci l'azienda",
];

export default function TargetSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-[#060606]">
      <div ref={ref} className="max-w-5xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-8">
          <div
            className={`p-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            }`}
          >
            <h3 className="text-2xl font-bold text-white mb-6">
              ✅ Perfetto per te se...
            </h3>
            <ul className="space-y-4">
              {forYou.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-300 text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`p-8 rounded-2xl border border-red-500/20 bg-red-500/[0.03] transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            }`}
          >
            <h3 className="text-2xl font-bold text-white mb-6">
              ❌ NON è per te se...
            </h3>
            <ul className="space-y-4">
              {notForYou.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <X className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-300 text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
