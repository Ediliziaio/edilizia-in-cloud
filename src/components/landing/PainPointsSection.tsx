import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { AlertTriangle, TrendingDown, Clock, FileQuestion, Users, Wallet, BarChart3 } from "lucide-react";
import AIImage from "./AIImage";

const painPoints = [
  { icon: TrendingDown, text: "Fatturi 500.000€, anche 1 milione — ma a fine anno sul conto non c'è quasi nulla. Dove sono finiti i soldi?" },
  { icon: FileQuestion, text: "Non conosci il margine REALE di ogni cantiere. Lo scopri solo a cantiere chiuso — quando è troppo tardi per cambiare qualcosa." },
  { icon: Clock, text: "Il commercialista ti dà i numeri una volta l'anno. Nel frattempo hai già perso mesi di margini che non recupererai mai più." },
  { icon: Wallet, text: "Hai paura ad aprire il conto a metà mese: non sai se riuscirai a pagare fornitori, dipendenti e contributi tutti insieme." },
  { icon: Users, text: "Non sai le ore reali di ogni operaio su ogni cantiere. Il costo della manodopera lo scopri a consuntivo, mai in tempo per agire." },
  { icon: BarChart3, text: "I preventivi li fai su Excel, li mandi e non sai mai perché hai perso — non hai dati sul tuo tasso di chiusura reale." },
  { icon: AlertTriangle, text: "Accetti qualsiasi lavoro pur di fatturare — anche quelli in perdita — perché senza numeri chiari non puoi permetterti di scegliere." },
];

export default function PainPointsSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="vantaggi" className="py-24 md:py-32 bg-white">
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#1a2744] text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Ti Riconosci in <span className="text-[#0fa68c]">Almeno uno</span> di Questi?
        </h2>
        <p
          className={`text-gray-500 text-center mb-16 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Se sì, stai lasciando soldi sul tavolo ogni settimana. Non è colpa tua — nessuno ti ha mai dato gli strumenti giusti per gestire un'impresa edile.
        </p>

        <div className="grid md:grid-cols-[1fr_320px] gap-10 items-start">
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

          <div className="hidden md:block sticky top-24">
            <AIImage
              prompt="Imprenditore edile italiano stressato seduto alla scrivania piena di fogli, fatture e calcolatrice, stile illustrazione moderna minimalista flat, palette navy blue e teal, sfondo bianco pulito, aspetto professionale"
              alt="Imprenditore stressato dai conti"
              className="w-full rounded-2xl"
            />
          </div>
        </div>

        <p
          className={`text-center text-gray-500 mt-12 text-base italic transition-all duration-700 delay-[900ms] ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          Non è colpa tua. L'edilizia è uno dei settori più complessi d'Italia.
          <br />
          <strong className="text-[#1a2744]">Edilizia in Cloud è stato costruito per cambiare esattamente questo.</strong>
        </p>
      </div>
    </section>
  );
}
