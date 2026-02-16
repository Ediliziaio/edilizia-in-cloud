import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { AlertTriangle, TrendingDown, Clock, FileQuestion, Users, Wallet, BarChart3 } from "lucide-react";

const painPoints = [
  { icon: TrendingDown, text: "Fatturi 1 milione ma a fine anno non sai dove sono finiti i soldi" },
  { icon: FileQuestion, text: "Non conosci il margine reale di ogni singola commessa" },
  { icon: Wallet, text: "Scopri i buchi di cassa solo quando è troppo tardi" },
  { icon: Clock, text: "Passi ore su Excel per avere numeri che non tornano mai" },
  { icon: Users, text: "I tuoi collaboratori lavorano senza dati — e tu senza controllo" },
  { icon: BarChart3, text: "Non sai quali clienti ti fanno guadagnare e quali ti fanno perdere" },
  { icon: AlertTriangle, text: "Prendi decisioni importanti basandoti sull'istinto, non sui numeri" },
];

export default function PainPointsSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="vantaggi" className="py-24 md:py-32 bg-[#0a0a0a]">
      <div ref={ref} className="max-w-4xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-white text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Stai Fatturando... <span className="text-[#c8ee44]">Ma i Soldi Dove Sono?</span>
        </h2>
        <p
          className={`text-gray-400 text-center mb-16 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Se ti riconosci in almeno 3 di questi punti, stai perdendo soldi ogni mese.
        </p>

        <div className="space-y-5">
          {painPoints.map((p, i) => (
            <div
              key={i}
              className={`flex items-start gap-4 p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-[#c8ee44]/20 hover:bg-white/[0.05] transition-all duration-500 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: isVisible ? `${200 + i * 80}ms` : "0ms" }}
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#c8ee44]/10 flex items-center justify-center">
                <p.icon className="w-5 h-5 text-[#c8ee44]" />
              </div>
              <p className="text-gray-200 text-base md:text-lg leading-relaxed">{p.text}</p>
            </div>
          ))}
        </div>

        <p
          className={`text-center text-gray-500 mt-12 text-base italic transition-all duration-700 delay-[900ms] ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          Non è colpa tua. Nessuno ti ha mai dato gli strumenti giusti per controllare i numeri.
          <br />
          <strong className="text-gray-300">Fino ad ora.</strong>
        </p>
      </div>
    </section>
  );
}
