import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { BarChart3, Wallet, Calculator, Users, Package, CalendarDays, HeadphonesIcon } from "lucide-react";

const modules = [
  { icon: BarChart3, name: "Gestione Ordini", desc: "Visualizza TUTTI i tuoi ordini in un colpo d'occhio: totale ivato, importo incassato, importo da incassare, margine reale, stato di avanzamento e pagamenti.", saving: "5-8 ore/settimana eliminate" },
  { icon: Package, name: "Magazzino e Tracking Materiali", desc: "Sai esattamente cosa hai in magazzino, cosa è in transito, cosa devi ordinare. Collegato direttamente alle commesse.", saving: "2.000-8.000 €/anno risparmiati" },
  { icon: CalendarDays, name: "Calendario Lavori e Gantt", desc: "Pianifica cantieri con vista Settimana, Mese, Trimestre e Anno. Zero sovrapposizioni, zero dimenticanze.", saving: "3-5 ore/settimana risparmiate" },
  { icon: Wallet, name: "Previsionale di Cassa", desc: "Questo modulo da SOLO vale l'intero investimento. Sai esattamente quanta liquidità avrai domani, tra 30 e 90 giorni.", saving: "3.000-15.000 €/anno risparmiati" },
  { icon: Calculator, name: "Controllo Costi Aziendali", desc: "Gestisci costi fissi e variabili, IVA a debito, fornitori da pagare, scadenze. Tutto sotto controllo.", saving: "5.000-25.000 €/anno risparmiati" },
  { icon: HeadphonesIcon, name: "Gestione Clienti e Ticket", desc: "Anagrafica clienti centralizzata con storico ordini e sistema ticket per assistenza. Zero reclami persi.", saving: "Zero reclami persi" },
  { icon: Users, name: "Costi Manodopera", desc: "Monitora dipendenti interni e squadre esterne. Costo REALE della manodopera per cantiere, aggiornato in tempo reale.", saving: "Ottimizzazione 10-20% ore lavoro" },
];

export default function ModulesSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="moduli" className="py-24 md:py-32 bg-white">
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#1a2744] text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          7 Strumenti Integrati. <span className="text-[#0fa68c]">Zero Complicazioni.</span>
        </h2>
        <p
          className={`text-gray-500 text-center mb-16 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Tutto quello che ti serve per gestire la tua impresa edile, in un unico posto.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((m, i) => (
            <div
              key={i}
              className={`group p-7 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-500 border-t-4 border-t-[#0fa68c] ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
              style={{ transitionDelay: isVisible ? `${200 + i * 80}ms` : "0ms" }}
            >
              <div className="w-12 h-12 rounded-xl bg-[#0fa68c]/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <m.icon className="w-6 h-6 text-[#0fa68c]" />
              </div>
              <h3 className="text-[#1a2744] font-bold text-lg mb-2">{m.name}</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">{m.desc}</p>
              <p className="text-[#0fa68c] text-xs font-semibold">{m.saving}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
