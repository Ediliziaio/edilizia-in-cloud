import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const criteria = [
  { n: "01", title: "Specifico per il tuo settore", desc: "Un software generico non capirà mai le dinamiche di cantiere, acconti, SAL e subappalti. Serve uno strumento pensato per l'edilizia." },
  { n: "02", title: "Semplice da usare ogni giorno", desc: "Se devi fare un corso di 3 giorni per usarlo, non lo userai mai. Deve essere intuitivo dal giorno 1." },
  { n: "03", title: "Visione in tempo reale", desc: "I numeri di ieri sono già vecchi. Ti serve un cruscotto che si aggiorna in tempo reale con margini, cassa e stato commesse." },
  { n: "04", title: "Tutto integrato, zero export", desc: "Commesse, fornitori, magazzino, dipendenti: tutto collegato. Niente copia-incolla tra 5 software diversi." },
  { n: "05", title: "Prezzo sostenibile per una PMI", desc: "Non devi spendere 50.000€ per un ERP enterprise. Serve un investimento proporzionato al tuo fatturato." },
];

export default function CriteriaSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-[#0a0a0a]">
      <div ref={ref} className="max-w-4xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-white text-center mb-16 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          5 Criteri per Scegliere il <span className="text-[#c8ee44]">Software Giusto</span>
        </h2>

        <div className="space-y-6">
          {criteria.map((c, i) => (
            <div
              key={i}
              className={`flex gap-6 p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-[#c8ee44]/20 transition-all duration-500 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: isVisible ? `${200 + i * 100}ms` : "0ms" }}
            >
              <span className="text-[#c8ee44] font-extrabold text-3xl opacity-40 flex-shrink-0">{c.n}</span>
              <div>
                <h3 className="text-white font-bold text-lg mb-1">{c.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
