import { useScrollAnimation } from "@/hooks/useScrollAnimation";

export default function FinalCtaSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section
      id="cta-finale"
      className="py-24 md:py-32 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #1a2744 0%, #0f1d35 100%)" }}
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
          className={`text-white/50 text-lg mb-10 transition-all duration-700 delay-150 ${
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
          className={`inline-block px-12 py-5 rounded-full bg-[#0fa68c] text-white font-extrabold text-xl hover:bg-[#0d9079] hover:scale-105 transition-all duration-300 animate-pulse-glow shadow-lg shadow-[#0fa68c]/30 ${
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
          <p className="text-white/40 text-sm">
            <strong className="text-white/60">P.S.</strong> Se stai leggendo fin qui, sai già che qualcosa deve cambiare. L'istinto ti ha portato dove sei oggi, ma non ti porterà dove vuoi essere domani. I numeri sì.
          </p>
          <p className="text-white/40 text-sm">
            <strong className="text-white/60">P.P.S.</strong> Ricorda: ogni mese senza controllo è un mese in cui stai letteralmente regalando soldi. Su un fatturato di 500.000€, anche solo il 5% di margine perso sono 2.083€/mese.
          </p>
          <p className="text-white/40 text-sm">
            <strong className="text-white/60">P.P.P.S.</strong> Se sei un imprenditore che prende decisioni velocemente, ti basta questo: 15 minuti di demo gratuita per vedere se Edilizia in Cloud fa per te. Zero rischi. Zero impegni. Solo chiarezza.
          </p>
        </div>
      </div>
    </section>
  );
}
