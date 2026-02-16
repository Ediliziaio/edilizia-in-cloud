import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const rows = [
  { aspect: "Chi lo ha creato?", others: "Informatici che non hanno mai visto un cantiere", us: "Un imprenditore edile che lo usa ogni giorno" },
  { aspect: "Tempo per impararlo", others: "Settimane di formazione, corsi, manuali", us: "Lo usi dal primo giorno, poche ore al mese" },
  { aspect: "Focus", others: "Fare tutto, per tutti i settori", us: "Solo edilizia. Solo ciò che serve DAVVERO" },
  { aspect: "Controllo margini", others: "Devi costruirtelo tu con formule complesse", us: "Automatico: margine reale per cantiere in un click" },
  { aspect: "Previsionale cassa", others: "Assente o complicatissimo", us: "Integrato: vedi entrate e uscite a 90 giorni" },
  { aspect: "Costo", others: "Migliaia di euro + costi nascosti", us: "Investimento accessibile con ROI dal primo mese" },
];

export default function ComparisonSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="confronto" className="py-24 md:py-32 bg-[#f8f9fa]">
      <div ref={ref} className="max-w-5xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#1a2744] text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Perché Edilizia in Cloud è <span className="text-[#0fa68c]">Diverso</span>
        </h2>
        <p
          className={`text-gray-500 text-center mb-14 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          I gestionali generici non capiscono il cantiere. Gli ERP costano troppo. Noi siamo la terza via.
        </p>

        <div
          className={`overflow-hidden rounded-2xl border border-gray-200 shadow-xl bg-white transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <table className="w-full">
            <thead>
              <tr className="bg-[#1a2744]">
                <th className="text-left text-white/80 text-sm font-medium px-6 py-4">Aspetto</th>
                <th className="text-center text-white/60 text-sm font-medium px-4 py-4">Gli Altri</th>
                <th className="text-center text-sm font-medium px-4 py-4 text-[#0fa68c] bg-[#0fa68c]/10">Edilizia in Cloud</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className={`border-t border-gray-100 transition-all duration-500 ${
                    isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
                  }`}
                  style={{ transitionDelay: isVisible ? `${400 + i * 60}ms` : "0ms" }}
                >
                  <td className="px-6 py-4 text-[#1a2744] font-medium text-sm">{r.aspect}</td>
                  <td className="px-4 py-4 text-center text-gray-400 text-sm">{r.others}</td>
                  <td className="px-4 py-4 text-center text-[#0fa68c] font-medium text-sm bg-[#0fa68c]/[0.03]">{r.us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
