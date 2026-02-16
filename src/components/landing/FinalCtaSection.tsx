import { useScrollAnimation } from "@/hooks/useScrollAnimation";

export default function FinalCtaSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section
      id="cta-finale"
      className="py-24 md:py-32 relative overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 100%, #1a2a1a 0%, #0a0a0a 60%)" }}
    >
      <div ref={ref} className="max-w-3xl mx-auto px-6 text-center relative z-10">
        <h2
          className={`text-3xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          SMETTI DI FATTURARE AL BUIO.
        </h2>
        <p
          className={`text-gray-400 text-lg mb-10 transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Richiedi una demo gratuita e scopri come Edilizia in Cloud può trasformare
          la gestione della tua impresa in soli 15 minuti.
        </p>

        <a
          href="https://calendly.com"
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-block px-12 py-5 rounded-xl bg-[#c8ee44] text-[#0a0a0a] font-extrabold text-xl hover:bg-[#d4f55a] hover:scale-105 transition-all duration-300 animate-pulse-glow ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
          style={{ transitionDelay: isVisible ? "300ms" : "0ms" }}
        >
          RICHIEDI LA TUA DEMO GRATUITA ORA
        </a>

        <div
          className={`mt-16 space-y-6 text-left max-w-xl mx-auto transition-all duration-700 delay-500 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <p className="text-gray-500 text-sm">
            <strong className="text-gray-400">P.S.</strong> Ogni mese che passa senza controllo dei numeri è un mese in cui
            stai potenzialmente perdendo migliaia di euro. Non aspettare il prossimo buco di cassa per agire.
          </p>
          <p className="text-gray-500 text-sm">
            <strong className="text-gray-400">P.P.S.</strong> La demo è gratuita e senza impegno. In 15 minuti ti mostriamo
            esattamente come funziona e come può aiutare la TUA azienda specifica.
          </p>
          <p className="text-gray-500 text-sm">
            <strong className="text-gray-400">P.P.P.S.</strong> I posti per le demo personalizzate sono limitati. Riceviamo
            decine di richieste ogni settimana. Prenota il tuo slot prima che sia troppo tardi.
          </p>
        </div>
      </div>
    </section>
  );
}
