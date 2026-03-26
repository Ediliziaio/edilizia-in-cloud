import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";

function PromoBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-[#0fa68c] text-white py-2 text-center overflow-hidden">
      <span
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
        }}
      />
      <span className="relative flex items-center justify-center gap-2 text-xs md:text-sm font-bold tracking-wide">
        SE NON TI FA GUADAGNARE, IL PROGRAMMA E GRATIS PER SEMPRE
      </span>
    </div>
  );
}

interface Module {
  id: string;
  label: string;
  tagline: string;
  description: string;
  features: string[];
  impact?: string;
  mockup?: React.ReactNode;
}

const modules: Module[] = [
  {
    id: "commesse",
    label: "Gestione Ordini/Commesse",
    tagline: "Il controllo totale su ogni cantiere",
    description:
      "Gestisci ogni commessa dalla firma del contratto alla chiusura finale. Sai in ogni momento quanto hai guadagnato, quanto hai speso e quanto ti resta da fare. Basta fogli Excel che si perdono, basta stime a occhio.",
    features: [
      "Stato avanzamento in % per ogni commessa",
      "Margine reale aggiornato in tempo reale",
      "Storico modifiche con timestamp",
      "Associazione diretta a clienti e fornitori",
      "Gestione varianti e lavori extra con approvazione",
      "Documenti allegati per commessa (contratti, disegni, SAL)",
      "Alert automatico quando il margine scende sotto soglia",
      "Report PDF di commessa per il cliente o la direzione",
    ],
    mockup: (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="font-bold text-[#1a2744]">Commessa #2024-047</span>
          <span
            className="text-xs px-2.5 py-1 rounded-full font-semibold"
            style={{ background: "rgba(15,166,140,0.12)", color: "#0fa68c" }}
          >
            In corso
          </span>
        </div>
        <p className="text-[#1a2744]/60 text-xs mb-4">Ristrutturazione Villa Bianchi — Via Roma 12, Milano</p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Valore totale", value: "€ 148.500" },
            { label: "Costi sostenuti", value: "€ 91.200" },
            { label: "Margine attuale", value: "38,6%" },
          ].map((item) => (
            <div key={item.label} className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-[10px] text-[#1a2744]/40 uppercase tracking-wide mb-1">{item.label}</div>
              <div className="font-bold text-[#1a2744] text-sm">{item.value}</div>
            </div>
          ))}
        </div>
        <div className="mb-1 flex justify-between text-xs text-[#1a2744]/50">
          <span>Avanzamento</span>
          <span className="font-semibold text-[#1a2744]">61%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: "61%", background: "#0fa68c" }} />
        </div>
      </div>
    ),
  },
  {
    id: "cassa",
    label: "Previsionale di Cassa",
    tagline: "Il modulo che da solo vale l'investimento",
    description:
      "Smetti di scoprire a fine mese che non ci sono soldi. Il previsionale di cassa ti mostra settimana per settimana, mese per mese, cosa entra e cosa esce — in anticipo. Pianifica i pagamenti ai fornitori senza mai restare a secco.",
    features: [
      "Proiezione entrate/uscite su 6 mesi rolling",
      "Separazione cassa operativa e cassa investimenti",
      "Alert di liquidita a 30/60/90 giorni",
      "Integrazione con scadenziario fornitori",
      "Confronto previsionale vs effettivo a chiusura mese",
      "Grafico waterfall interattivo",
      "Export Excel per il commercialista",
      "Simulatore 'what-if' per nuove commesse",
    ],
    impact: "Il modulo che da solo vale l'investimento",
  },
  {
    id: "magazzino",
    label: "Magazzino e Materiali",
    tagline: "Sai sempre cosa hai, dove ce, quanto vale",
    description:
      "Tieni traccia di tutti i materiali in cantiere e in deposito. Registra i carichi dai fornitori, le uscite per commessa, e ricevi un avviso quando le scorte scendono sotto il minimo. Niente piu materiale sparito o doppioni di ordine.",
    features: [
      "Anagrafica materiali con codice, categoria e unita di misura",
      "Carico da bolla di trasporto con collegamento al fornitore",
      "Scarico per commessa con attribuzione automatica al costo",
      "Giacenza in tempo reale per ogni deposito o cantiere",
      "Soglia minima di riordino con notifica automatica",
      "Inventario periodico guidato con rilevazione differenze",
      "Valore totale magazzino aggiornato in tempo reale",
      "Storico movimenti con filtri per data, fornitore, cantiere",
    ],
  },
  {
    id: "manodopera",
    label: "Costi Manodopera",
    tagline: "Il costo vero dei tuoi operai, senza sorprese",
    description:
      "La manodopera e spesso il costo piu sottostimato. Con questo modulo imputi le ore di ogni operaio a ogni commessa, calcoli il costo reale (lordo + contributi) e vedi quanto incide sul margine. Finisci di scoprirlo solo a bilancio.",
    features: [
      "Anagrafica dipendenti con costo orario comprensivo di oneri",
      "Timbrature giornaliere via app mobile (QR code cantiere)",
      "Associazione ore lavorative a commessa specifica",
      "Calcolo straordinari e trasferte automatizzato",
      "Confronto budget manodopera vs consuntivo per commessa",
      "Report mensile per cedolini e verifica DURC",
      "Gestione subappaltatori con costo giornata concordato",
      "Dashboard costo medio orario per tipologia di lavorazione",
    ],
  },
  {
    id: "gantt",
    label: "Calendario e Gantt",
    tagline: "Pianifica i cantieri senza conflitti di risorse",
    description:
      "Visualizza tutte le commesse su una timeline interattiva. Sposta le attivita con drag and drop, assegna le squadre, identifica i colli di bottiglia prima che diventino problemi. Il Gantt che finalmente si capisce.",
    features: [
      "Vista Gantt per commessa con dipendenze tra attivita",
      "Vista calendario per squadra o singolo operaio",
      "Drag and drop per ripianificazione rapida",
      "Rilevamento conflitti di risorse in tempo reale",
      "Milestone con notifica automatica al cliente",
      "Integrazione con Google Calendar per sincronizzazione",
      "Stampa PDF del programma lavori da consegnare al DL",
      "Storico ripianificazioni per analisi scostamenti",
    ],
  },
  {
    id: "costi",
    label: "Controllo Costi Aziendali",
    tagline: "La visione di insieme che cambia le decisioni",
    description:
      "Non solo i costi di cantiere: qui vedi l'intera struttura di costo aziendale. Affitti, noleggi, assicurazioni, leasing, costi fissi e variabili. Capisci dove stai guadagnando e dove stai perdendo davvero.",
    features: [
      "Piano dei conti personalizzabile per categoria di costo",
      "Separazione costi fissi vs costi variabili",
      "Ripartizione costi generali tra commesse (pro-quota)",
      "Confronto budget annuale vs consuntivo mese per mese",
      "Analisi dei costi per centro di costo o cantiere",
      "Grafico di Pareto per identificare le voci piu pesanti",
      "Export per inserimento in software contabili",
      "Alert superamento budget per categoria",
    ],
  },
  {
    id: "clienti",
    label: "Clienti e Portale",
    tagline: "Dai ai tuoi clienti quello che i concorrenti non danno",
    description:
      "Un portale dedicato dove ogni cliente puo vedere lo stato dei propri lavori, scaricare i documenti, firmare i SAL e approvare le varianti. Professionalita che fidelizza. Meno chiamate, piu fiducia.",
    features: [
      "Portale clienti white-label con logo aziendale",
      "Accesso dedicato per ogni cliente con credenziali proprie",
      "Stato avanzamento lavori visibile in tempo reale",
      "Download documenti (preventivi, fatture, report)",
      "Firma digitale SAL e approvazione varianti",
      "Chat diretta con il responsabile di cantiere",
      "Notifiche automatiche per milestone raggiunte",
      "Storico di tutte le comunicazioni per commessa",
    ],
  },
];

export default function Funzionalita() {
  const [activeTab, setActiveTab] = useState(modules[0].id);

  useEffect(() => {
    document.title = "Funzionalita — Edilizia in Cloud";
  }, []);

  const activeModule = modules.find((m) => m.id === activeTab) || modules[0];

  return (
    <div className="min-h-screen bg-white text-[#1a2744] overflow-x-hidden">
      <PromoBanner />
      <LandingNavbar />

      {/* Hero */}
      <section
        style={{ background: "linear-gradient(135deg, #1a2744 0%, #0f1d35 100%)" }}
        className="pt-36 pb-20 px-6 text-center"
      >
        <div className="max-w-3xl mx-auto">
          <div
            className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-6"
            style={{ background: "rgba(15,166,140,0.18)", color: "#0fa68c" }}
          >
            7 Moduli Integrati
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-5">
            Tutto Quello che ti Serve. Niente di Superfluo.
          </h1>
          <p className="text-lg md:text-xl text-white/70 leading-relaxed">
            7 moduli integrati progettati da chi ha vissuto il cantiere dall'interno.
          </p>
        </div>
      </section>

      {/* Tabs Navigation */}
      <section className="sticky top-9 z-40 bg-white border-b border-gray-100 shadow-sm">
        {/* Desktop tabs */}
        <div className="hidden md:flex max-w-7xl mx-auto px-6 overflow-x-auto">
          {modules.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveTab(m.id)}
              className="flex-shrink-0 px-5 py-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap"
              style={{
                borderBottomColor: activeTab === m.id ? "#0fa68c" : "transparent",
                color: activeTab === m.id ? "#0fa68c" : "#1a2744",
                opacity: activeTab === m.id ? 1 : 0.55,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Mobile dropdown */}
        <div className="md:hidden px-6 py-3">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 text-[#1a2744] text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0fa68c]/30 bg-white"
          >
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Tab Content */}
      <section className="py-16 px-6" style={{ background: "#f7f9fc" }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Left: description + features */}
            <div>
              <div
                className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
                style={{ background: "rgba(15,166,140,0.1)", color: "#0fa68c" }}
              >
                {activeModule.label}
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#1a2744] mb-4 leading-snug">
                {activeModule.tagline}
              </h2>
              <p className="text-[#1a2744]/60 leading-relaxed mb-8 text-sm md:text-base">
                {activeModule.description}
              </p>

              {activeModule.impact && (
                <div
                  className="rounded-xl px-5 py-4 mb-8 border-l-4"
                  style={{
                    background: "rgba(15,166,140,0.08)",
                    borderLeftColor: "#0fa68c",
                  }}
                >
                  <p className="font-bold text-[#1a2744] text-sm">{activeModule.impact}</p>
                </div>
              )}

              <ul className="space-y-3">
                {activeModule.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-[#1a2744]/75">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: "rgba(15,166,140,0.15)" }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="#0fa68c" strokeWidth="2.5" className="w-3 h-3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: mockup or visual placeholder */}
            <div>
              {activeModule.mockup ? (
                <div>{activeModule.mockup}</div>
              ) : (
                <div
                  className="rounded-2xl p-8 text-center"
                  style={{ background: "linear-gradient(135deg, #1a2744 0%, #0f1d35 100%)" }}
                >
                  <div
                    className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                    style={{ background: "rgba(15,166,140,0.2)" }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="#0fa68c" strokeWidth="1.5" className="w-8 h-8">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18M9 21V9" />
                    </svg>
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">{activeModule.label}</h3>
                  <p className="text-white/50 text-sm mb-6">
                    Vedi questo modulo in azione durante la demo gratuita.
                  </p>
                  <Link
                    to="/demo"
                    className="inline-block px-5 py-2.5 rounded-full text-white text-sm font-bold transition-all hover:opacity-90"
                    style={{ background: "#0fa68c" }}
                  >
                    Prenota la Demo
                  </Link>
                </div>
              )}

              {/* Navigation arrows */}
              <div className="flex justify-between mt-6">
                <button
                  onClick={() => {
                    const idx = modules.findIndex((m) => m.id === activeTab);
                    if (idx > 0) setActiveTab(modules[idx - 1].id);
                  }}
                  disabled={modules.findIndex((m) => m.id === activeTab) === 0}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-[#1a2744]/50 hover:text-[#1a2744] transition-colors disabled:opacity-25 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Precedente
                </button>
                <button
                  onClick={() => {
                    const idx = modules.findIndex((m) => m.id === activeTab);
                    if (idx < modules.length - 1) setActiveTab(modules[idx + 1].id);
                  }}
                  disabled={modules.findIndex((m) => m.id === activeTab) === modules.length - 1}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-[#1a2744]/50 hover:text-[#1a2744] transition-colors disabled:opacity-25 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Successivo
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* All modules included */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-[#1a2744] mb-4">
            Tutti i moduli inclusi in ogni piano
          </h2>
          <p className="text-[#1a2744]/55 mb-10 max-w-xl mx-auto text-sm leading-relaxed">
            Non paghi moduli separati, non ci sono add-on nascosti. Tutto quello che hai visto e
            incluso dal primo giorno, qualunque sia il piano che scegli.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
            {modules.map((m) => (
              <div
                key={m.id}
                className="rounded-xl px-4 py-3 text-xs font-semibold text-[#1a2744]/70 border border-gray-100 text-center"
                style={{ background: "#f7f9fc" }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-2"
                  style={{ background: "#0fa68c" }}
                />
                {m.label}
              </div>
            ))}
          </div>

          <Link
            to="/demo"
            className="inline-block px-8 py-4 rounded-full text-white font-bold text-base transition-all hover:opacity-90 hover:scale-105 shadow-lg"
            style={{ background: "#0fa68c", boxShadow: "0 8px 30px rgba(15,166,140,0.3)" }}
          >
            Richiedi Demo Gratuita →
          </Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
