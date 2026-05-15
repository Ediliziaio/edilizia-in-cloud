import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { AlertTriangle, TrendingDown, Clock, FileQuestion, Users, Wallet, BarChart3 } from "lucide-react";

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
          className={`text-3xl md:text-5xl font-extrabold text-[#111111] text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Ti Riconosci in <span className="text-[#F97415]">Almeno uno</span> di Questi?
        </h2>
        <p
          className={`text-gray-500 text-center mb-16 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Se sì, stai lasciando soldi sul tavolo ogni settimana. Non è colpa tua — nessuno ti ha mai dato gli strumenti giusti per gestire un'impresa edile.
        </p>

        <div className="grid md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_400px] gap-10 items-stretch">
          <div className="space-y-4">
            {painPoints.map((p, i) => (
              <div
                key={i}
                className={`flex items-start gap-4 p-5 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md border-l-4 border-l-[#F97415] transition-all duration-500 group ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                }`}
                style={{ transitionDelay: isVisible ? `${200 + i * 80}ms` : "0ms" }}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#F97415]/10 flex items-center justify-center group-hover:rotate-6 transition-transform duration-300">
                  <p.icon className="w-5 h-5 text-[#F97415]" />
                </div>
                <p className="text-[#111111]/80 text-base md:text-lg leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>

          <div
            className={`hidden md:block h-full min-h-[720px] transition-all duration-700 delay-300 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <img
              src="/landing/pain-points-edilizia.png"
              alt="Imprenditore edile che controlla margini, cassa e costi di cantiere"
              width={1024}
              height={1024}
              loading="lazy"
              decoding="async"
              className="h-full w-full rounded-3xl border border-gray-100 object-cover object-[72%_center] shadow-sm"
            />
          </div>
        </div>

        <p
          className={`text-center text-gray-500 mt-12 text-base italic transition-all duration-700 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
          style={{ transitionDelay: isVisible ? "900ms" : "0ms" }}
        >
          Non è colpa tua. L'edilizia è uno dei settori più complessi d'Italia.
          <br />
          <strong className="text-[#111111]">Edilizia in Cloud è stato costruito per cambiare esattamente questo.</strong>
        </p>
      </div>
    </section>
  );
}
