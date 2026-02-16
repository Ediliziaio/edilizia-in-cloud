import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Check, X } from "lucide-react";

const features = [
  "Pensato per l'edilizia",
  "Dashboard margine per commessa",
  "Previsionale di cassa automatico",
  "Gestione dipendenti e squadre esterne",
  "Magazzino integrato con commesse",
  "Portale clienti incluso",
  "Setup in 24 ore, senza consulenti",
  "Prezzo accessibile per PMI",
];

export default function ComparisonSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="confronto" className="py-24 md:py-32 bg-[#0a0a0a]">
      <div ref={ref} className="max-w-4xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-white text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Perché Edilizia in Cloud è <span className="text-[#c8ee44]">Diverso</span>
        </h2>
        <p
          className={`text-gray-400 text-center mb-14 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          I gestionali generici non capiscono il cantiere. Gli ERP costano troppo. Noi siamo la terza via.
        </p>

        <div
          className={`overflow-hidden rounded-2xl border border-white/10 transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <table className="w-full">
            <thead>
              <tr className="bg-white/[0.05]">
                <th className="text-left text-gray-400 text-sm font-medium px-6 py-4">Funzionalità</th>
                <th className="text-center text-gray-400 text-sm font-medium px-4 py-4">Gli Altri</th>
                <th className="text-center text-sm font-medium px-4 py-4 text-[#c8ee44] bg-[#c8ee44]/[0.06]">Edilizia in Cloud</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f, i) => (
                <tr
                  key={i}
                  className={`border-t border-white/[0.06] transition-all duration-500 ${
                    isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
                  }`}
                  style={{ transitionDelay: isVisible ? `${400 + i * 60}ms` : "0ms" }}
                >
                  <td className="px-6 py-4 text-gray-300 text-sm">{f}</td>
                  <td className="px-4 py-4 text-center">
                    <X className="w-5 h-5 text-red-400/60 mx-auto" />
                  </td>
                  <td className="px-4 py-4 text-center bg-[#c8ee44]/[0.04]">
                    <div className={`transition-all duration-300 ${isVisible ? "scale-100" : "scale-0"}`} style={{ transitionDelay: isVisible ? `${500 + i * 60}ms` : "0ms" }}>
                      <Check className="w-5 h-5 text-[#c8ee44] mx-auto" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
