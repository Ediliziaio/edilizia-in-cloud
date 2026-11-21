import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { AlertTriangle, TrendingDown, Clock, FileQuestion, Users, Wallet, BarChart3 } from "lucide-react";

const painPoints = [
  { icon: TrendingDown, text: "Fatturi 500.000€, anche 1 milione — ma a fine anno sul conto non c'è quasi nulla. Dove sono finiti i soldi?", soluzione: "Ogni commessa ha il suo conto: venduto, costi e incassi aggiornati mentre lavori. Vedi dove vanno i soldi." },
  { icon: FileQuestion, text: "Non conosci il margine REALE di ogni cantiere. Lo scopri solo a cantiere chiuso — quando è troppo tardi per cambiare qualcosa.", soluzione: "Il margine previsto a fine lavoro lo vedi a cantiere aperto, quando puoi ancora correggere." },
  { icon: Clock, text: "Il commercialista ti dà i numeri una volta l'anno. Nel frattempo hai già perso mesi di margini che non recupererai mai più.", soluzione: "I numeri li hai tu, ogni giorno. Il commercialista entra con il suo accesso e trova tutto in ordine." },
  { icon: Wallet, text: "Hai paura ad aprire il conto a metà mese: non sai se riuscirai a pagare fornitori, dipendenti e contributi tutti insieme.", soluzione: "Scadenzario e cassa prevista a 30, 60 e 90 giorni: sai prima cosa esce e cosa entra." },
  { icon: Users, text: "Non sai le ore reali di ogni operaio su ogni cantiere. Il costo della manodopera lo scopri a consuntivo, mai in tempo per agire.", soluzione: "Le squadre timbrano dal telefono: le ore finiscono sulla commessa giusta e il costo lo vedi subito." },
  { icon: BarChart3, text: "I preventivi li fai su Excel, li mandi e non sai mai perché hai perso — non hai dati sul tuo tasso di chiusura reale.", soluzione: "Preventivi dal tuo listino in pochi minuti, e sai quali sono stati accettati e quali no." },
  { icon: AlertTriangle, text: "Accetti qualsiasi lavoro pur di fatturare — anche quelli in perdita — perché senza numeri chiari non puoi permetterti di scegliere.", soluzione: "Coi margini veri dei lavori passati sai quali lavori ti convengono e quali no." },
];

export default function PainPointsSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="vantaggi" className="py-24 md:py-32 bg-white">
      <style>{`
        .pain-flip { perspective: 1200px; }
        .pain-flip-inner { transition: transform 650ms cubic-bezier(0.22, 1, 0.36, 1); transform-style: preserve-3d; }
        .pain-face { grid-area: 1 / 1; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .pain-back { transform: rotateX(180deg); }
        @media (hover: hover) { .pain-flip:hover .pain-flip-inner { transform: rotateX(180deg); } }
        .pain-flip.is-flipped .pain-flip-inner, .pain-flip:focus-visible .pain-flip-inner { transform: rotateX(180deg); }
        @media (prefers-reduced-motion: reduce) { .pain-flip-inner { transition: none; } }
      `}</style>
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#111111] text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Ti riconosci in <span className="text-eic-orange">almeno uno</span> di questi?
        </h2>
        <p
          className={`text-gray-500 text-center mb-16 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Se sì, stai lasciando soldi sul tavolo ogni settimana. Passa sopra (o tocca) una scheda: dietro c'è come la risolvi.
        </p>

        <div className="grid md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_400px] gap-10 items-stretch">
          <div className="space-y-4">
            {painPoints.map((p, i) => (
              <button
                key={i}
                type="button"
                className={`pain-flip group block w-full text-left transition-all duration-500 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                }`}
                style={{ transitionDelay: isVisible ? `${200 + i * 80}ms` : "0ms" }}
                onClick={(e) => e.currentTarget.classList.toggle("is-flipped")}
              >
                <span className="pain-flip-inner grid">
                  {/* davanti: il problema */}
                  <span className="pain-face flex items-start gap-4 rounded-2xl border border-gray-100 border-l-4 border-l-eic-orange bg-white p-5 shadow-sm">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-eic-orange/10">
                      <p.icon className="h-5 w-5 text-eic-orange" />
                    </span>
                    <span className="text-base leading-relaxed text-[#111111]/80 md:text-lg">{p.text}</span>
                  </span>
                  {/* dietro: la soluzione */}
                  <span className="pain-face pain-back flex items-start gap-4 rounded-2xl border border-emerald-200 border-l-4 border-l-emerald-500 bg-emerald-50 p-5 shadow-sm">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-lg font-black text-white">✓</span>
                    <span>
                      <span className="block text-[11px] font-black uppercase tracking-widest text-emerald-700">Con Edilizia in Cloud</span>
                      <span className="mt-1 block text-base font-semibold leading-relaxed text-emerald-950 md:text-lg">{p.soluzione}</span>
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div
            className={`hidden md:block h-full min-h-[720px] transition-all duration-700 delay-300 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <picture>
              <source srcSet="/landing/pain-points-edilizia.avif" type="image/avif" />
              <source srcSet="/landing/pain-points-edilizia.webp" type="image/webp" />
              <img
                src="/landing/pain-points-edilizia.webp"
                alt="Imprenditore edile che controlla margini, cassa e costi di cantiere"
                width={1024}
                height={1024}
                loading="lazy"
                decoding="async"
                className="h-full w-full rounded-3xl border border-gray-100 object-cover object-[72%_center] shadow-sm"
              />
            </picture>
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
