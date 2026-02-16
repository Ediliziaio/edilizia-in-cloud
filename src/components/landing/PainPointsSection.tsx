import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { AlertTriangle, TrendingDown, Clock, FileQuestion, Users, Wallet, BarChart3 } from "lucide-react";

const painPoints = [
  { icon: TrendingDown, text: "Fatturi 500.000€, 1 milione, anche 2 milioni… ma a fine anno sul conto non resta quasi nulla." },
  { icon: FileQuestion, text: "Non sai ESATTAMENTE quanto margine hai su ogni singolo cantiere — lavori \"a sensazione\", sperando che i conti tornino." },
  { icon: Clock, text: "Il commercialista ti dà i numeri una volta l'anno, quando ormai è troppo tardi per cambiare qualcosa." },
  { icon: Wallet, text: "Hai paura ad aprire l'estratto conto a metà mese perché non sai se ce la farai a pagare fornitori e dipendenti." },
  { icon: Users, text: "Lavori 12-14 ore al giorno, sabato incluso, ma il tuo compenso personale è inferiore a quello di un tuo operaio." },
  { icon: BarChart3, text: "Accetti QUALSIASI lavoro pur di fatturare, anche quelli che sai già che ti faranno perdere soldi." },
  { icon: AlertTriangle, text: "I preventivi li fai \"a occhio\", i costi li scopri a consuntivo, e i ritardi in cantiere diventano voragini finanziarie." },
];

export default function PainPointsSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="vantaggi" className="py-24 md:py-32 bg-white">
      <div ref={ref} className="max-w-4xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#1a2744] text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Ti Riconosci in <span className="text-[#0fa68c]">Almeno 3</span> di Questi?
        </h2>
        <p
          className={`text-gray-500 text-center mb-16 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Se sì, stai perdendo soldi ogni mese. Non è colpa tua — nessuno ti ha mai dato gli strumenti giusti.
        </p>

        <div className="space-y-4">
          {painPoints.map((p, i) => (
            <div
              key={i}
              className={`flex items-start gap-4 p-5 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md border-l-4 border-l-[#0fa68c] transition-all duration-500 group ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: isVisible ? `${200 + i * 80}ms` : "0ms" }}
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#0fa68c]/10 flex items-center justify-center group-hover:rotate-6 transition-transform duration-300">
                <p.icon className="w-5 h-5 text-[#0fa68c]" />
              </div>
              <p className="text-[#1a2744]/80 text-base md:text-lg leading-relaxed">{p.text}</p>
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
          <strong className="text-[#1a2744]">Fino ad ora.</strong>
        </p>
      </div>
    </section>
  );
}
