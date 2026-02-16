import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { BarChart3, Wallet, Calculator, Users, Package, CalendarDays, HeadphonesIcon } from "lucide-react";

const modules = [
  { icon: BarChart3, name: "Dashboard Commesse", desc: "Visione completa di ogni cantiere: margine, stato avanzamento, incassi e costi in tempo reale.", goal: "Margine reale per commessa", saving: "Fino a 15.000 €/anno recuperati" },
  { icon: Wallet, name: "Previsionale di Cassa", desc: "Sai esattamente quanta liquidità avrai domani, tra 30 e 90 giorni. Zero sorprese.", goal: "Previsione a 90 giorni", saving: "Elimina scoperti e interessi bancari" },
  { icon: Calculator, name: "Gestione Costi Aziendali", desc: "Tutti i costi fissi e variabili sotto controllo. Categorizzati, scadenzati, monitorati.", goal: "Controllo costi al centesimo", saving: "Risparmio 5-10% sui costi operativi" },
  { icon: Users, name: "Gestione Dipendenti e Squadre", desc: "Assegna operai e squadre esterne alle commesse. Calcola il costo orario reale.", goal: "Costo manodopera per commessa", saving: "Ottimizzazione 10-20% ore lavoro" },
  { icon: Package, name: "Magazzino Integrato", desc: "Gestisci scorte, movimenti e ordini fornitori collegati direttamente alle commesse.", goal: "Zero sprechi materiale", saving: "Riduzione 8-15% costi materiali" },
  { icon: CalendarDays, name: "Calendario Lavori", desc: "Pianifica cantieri, consegne e scadenze con vista Gantt. Tutto sincronizzato.", goal: "Zero sovrapposizioni", saving: "Risparmio 3.000-8.000 €/anno" },
  { icon: HeadphonesIcon, name: "Assistenza Clienti", desc: "Portale dedicato ai tuoi clienti per seguire lo stato dei lavori e comunicare con te.", goal: "Clienti sempre aggiornati", saving: "Meno chiamate, più professionalità" },
];

export default function ModulesSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="moduli" className="py-24 md:py-32 bg-[#f8f9fa]">
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-gray-900 text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          7 Strumenti Integrati. <span className="text-[#7ab800]">Zero Complicazioni.</span>
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
              className={`group p-7 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-500 border-t-4 border-t-[#c8ee44] ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
              style={{ transitionDelay: isVisible ? `${200 + i * 80}ms` : "0ms" }}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c8ee44]/30 to-[#7ab800]/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <m.icon className="w-6 h-6 text-[#7ab800]" />
              </div>
              <h3 className="text-gray-900 font-bold text-lg mb-2">{m.name}</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">{m.desc}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#7ab800] font-medium">{m.goal}</span>
              </div>
              <p className="text-emerald-600/70 text-xs mt-2 font-medium">{m.saving}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
