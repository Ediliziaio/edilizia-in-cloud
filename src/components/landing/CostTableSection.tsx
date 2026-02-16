import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const costs = [
  { error: "Errori di preventivazione", cost: "5.000 – 20.000 €/anno", desc: "Margini calcolati male su ogni commessa" },
  { error: "Mancato controllo fornitori", cost: "3.000 – 15.000 €/anno", desc: "Pagamenti doppi, condizioni non negoziate" },
  { error: "Buchi di cassa improvvisi", cost: "5.000 – 30.000 €/anno", desc: "Interessi bancari, ritardi, scoperti" },
  { error: "Ore perse su Excel e fogli", cost: "2.000 – 10.000 €/anno", desc: "Tempo tuo e dei collaboratori sprecato" },
  { error: "Decisioni senza dati", cost: "5.000 – 25.000 €/anno", desc: "Commesse accettate in perdita senza saperlo" },
];

export default function CostTableSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-[#060606]">
      <div ref={ref} className="max-w-4xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-white text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Quanto Ti Costa <span className="text-red-400">NON</span> Controllare i Numeri?
        </h2>
        <p
          className={`text-gray-400 text-center mb-14 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Ecco cosa succede quando gestisci un'impresa edile "a sensazione":
        </p>

        <div
          className={`overflow-hidden rounded-2xl border border-white/10 transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <table className="w-full">
            <thead>
              <tr className="bg-white/[0.05]">
                <th className="text-left text-gray-400 text-sm font-medium px-6 py-4 uppercase tracking-wider">Errore</th>
                <th className="text-left text-gray-400 text-sm font-medium px-6 py-4 uppercase tracking-wider hidden sm:table-cell">Descrizione</th>
                <th className="text-right text-gray-400 text-sm font-medium px-6 py-4 uppercase tracking-wider">Costo</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c, i) => (
                <tr key={i} className="border-t border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                  <td className="px-6 py-4 text-white font-medium">{c.error}</td>
                  <td className="px-6 py-4 text-gray-500 text-sm hidden sm:table-cell">{c.desc}</td>
                  <td className="px-6 py-4 text-right text-red-400 font-semibold whitespace-nowrap">{c.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-white/10 bg-red-500/10 px-6 py-5 flex items-center justify-between">
            <span className="text-white font-bold text-lg">TOTALE STIMATO</span>
            <span className="text-red-400 font-extrabold text-xl md:text-2xl">20.000 – 100.000 €/anno</span>
          </div>
        </div>
      </div>
    </section>
  );
}
