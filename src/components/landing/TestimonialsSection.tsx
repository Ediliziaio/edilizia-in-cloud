import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Star, ArrowRight } from "lucide-react";

const testimonials = [
  {
    company: "Costruzioni Rossi S.r.l.",
    city: "Roma",
    sector: "Ristrutturazioni residenziali",
    revenue: "1.2M €",
    person: "Marco Rossi",
    role: "Titolare",
    initials: "MR",
    avatarBg: "bg-[#0fa68c]",
    quote: "In 8 mesi abbiamo scoperto che 3 cantieri su 10 erano in perdita. Ora ogni commessa è sotto controllo.",
    before: "80.000 € di utile (6.7%)",
    after: "360.000 € di utile (30%)",
  },
  {
    company: "Edil Progetti S.r.l.",
    city: "Milano",
    sector: "Impiantistica e manutenzioni",
    revenue: "800K €",
    person: "Laura Bianchi",
    role: "Amministratrice",
    initials: "LB",
    avatarBg: "bg-[#1a2744]",
    quote: "Prima rincorrevamo i pagamenti. Ora il forecast ci dice esattamente quando e quanto incasseremo.",
    before: "Incassi a 90 giorni",
    after: "Incassi a 35 giorni, cassa positiva",
  },
  {
    company: "Fratelli Conti Costruzioni",
    city: "Napoli",
    sector: "Edilizia civile e appalti pubblici",
    revenue: "3.5M €",
    person: "Giuseppe Conti",
    role: "Direttore Tecnico",
    initials: "GC",
    avatarBg: "bg-[#0fa68c]",
    quote: "Ho eliminato Excel dalla mia vita. Dashboard, margini, stato cantieri: tutto in un click.",
    before: "2 giorni/settimana su Excel",
    after: "Report automatici, 12h/sett risparmiate",
  },
  {
    company: "GreenBuild Italia",
    city: "Torino",
    sector: "Costruzioni sostenibili",
    revenue: "600K €",
    person: "Alessia Verde",
    role: "Co-fondatrice",
    initials: "AV",
    avatarBg: "bg-[#1a2744]",
    quote: "Come startup non potevamo permetterci errori. Edilizia in Cloud ci ha dato il controllo dal giorno uno.",
    before: "Margine stimato \"a occhio\"",
    after: "+22% redditività in 6 mesi",
  },
];

export default function TestimonialsSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-[#f8fafb]">
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#1a2744] text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          I Risultati Parlano <span className="text-[#0fa68c]">Chiaro</span>
        </h2>
        <p
          className={`text-gray-500 text-center mb-14 text-lg max-w-2xl mx-auto transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Ecco cosa hanno ottenuto le imprese che hanno scelto Edilizia in Cloud
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className={`bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-all duration-700 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
              style={{ transitionDelay: isVisible ? `${300 + i * 150}ms` : "0ms" }}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-11 h-11 rounded-full ${t.avatarBg} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                  {t.initials}
                </div>
                <div>
                  <p className="font-bold text-[#1a2744] text-sm">{t.company}</p>
                  <p className="text-gray-400 text-xs">{t.city} · {t.sector} · Fatt. {t.revenue}</p>
                </div>
              </div>

              {/* Quote */}
              <p className="text-[#1a2744]/70 italic text-sm mb-4 leading-relaxed">
                "{t.quote}"
              </p>

              {/* Before / After */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[#f8f9fa] border border-gray-100 mb-4">
                <span className="text-red-500 font-semibold text-xs flex-1">{t.before}</span>
                <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-[#0fa68c] font-semibold text-xs flex-1 text-right">{t.after}</span>
              </div>

              {/* Stars + Person */}
              <div className="flex items-center justify-between">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <span className="text-xs text-gray-400">{t.person}, {t.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
