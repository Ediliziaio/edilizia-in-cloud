import { useState, useEffect, useRef } from "react";
import { useSEO } from "@/hooks/useSEO";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";

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
        SE NON TI FA GUADAGNARE, IL PROGRAMMA È GRATIS PER SEMPRE
      </span>
    </div>
  );
}

type CellType = "check" | "cross" | "partial" | "text";

interface TableCell {
  type: CellType;
  text?: string;
}

function Cell({ cell, highlight = false }: { cell: TableCell; highlight?: boolean }) {
  if (cell.type === "check") {
    return (
      <div className={`flex items-center justify-center ${highlight ? "text-[#0fa68c]" : "text-[#0fa68c]"}`}>
        <CheckCircle2 className="w-5 h-5" />
      </div>
    );
  }
  if (cell.type === "cross") {
    return (
      <div className="flex items-center justify-center text-red-500">
        <XCircle className="w-5 h-5" />
      </div>
    );
  }
  if (cell.type === "partial") {
    return (
      <div className="flex items-center justify-center text-amber-500">
        <AlertCircle className="w-5 h-5" />
        <span className="ml-1 text-xs font-medium">Parziale</span>
      </div>
    );
  }
  return (
    <span className={`text-sm ${highlight ? "font-semibold text-[#0fa68c]" : "text-[#1a2744]"}`}>
      {cell.text}
    </span>
  );
}

const TABS = [
  { label: "vs Excel", id: "excel" },
  { label: "vs ERP Generici", id: "erp" },
  { label: "vs Commercialista", id: "commercialista" },
  { label: "vs Concorrenti", id: "concorrenti" },
];

const excelRows: { feature: string; excel: TableCell; eic: TableCell }[] = [
  { feature: "Margine reale per cantiere", excel: { type: "cross" }, eic: { type: "text", text: "Automatico, aggiornato al secondo" } },
  { feature: "Previsionale di cassa", excel: { type: "cross" }, eic: { type: "text", text: "Dashboard pronta, 90 giorni" } },
  { feature: "Collaborazione team", excel: { type: "cross" }, eic: { type: "text", text: "Tutti i dati sincronizzati in tempo reale" } },
  { feature: "Aggiornamento dati", excel: { type: "cross" }, eic: { type: "text", text: "Automatico da ogni dispositivo" } },
  { feature: "Accesso da cantiere", excel: { type: "cross" }, eic: { type: "text", text: "App mobile nativa, funziona offline" } },
  { feature: "Alert automatici", excel: { type: "cross" }, eic: { type: "text", text: "Notifica se margine scende, se scade pagamento" } },
  { feature: "Report per il commercialista", excel: { type: "cross" }, eic: { type: "text", text: "PDF e Excel pronti in 1 click" } },
  { feature: "Integrazione fatturazione", excel: { type: "cross" }, eic: { type: "text", text: "SDI nativo, completo" } },
  { feature: "Sicurezza dati", excel: { type: "cross" }, eic: { type: "text", text: "Cloud sicuro, backup automatici" } },
  { feature: "Costo effettivo", excel: { type: "text", text: '"Gratis" ma 10+ ore/sett sprecate' }, eic: { type: "text", text: "Da 99€/mese, risparmio immediato" } },
];

const erpRows: { feature: string; erp: TableCell; eic: TableCell }[] = [
  { feature: "Costo setup", erp: { type: "text", text: "€5.000 – €50.000" }, eic: { type: "text", text: "Incluso nel piano" } },
  { feature: "Tempo implementazione", erp: { type: "text", text: "3-12 mesi" }, eic: { type: "text", text: "48 ore" } },
  { feature: "Formazione richiesta", erp: { type: "text", text: "2-8 settimane" }, eic: { type: "text", text: "1-2 giorni" } },
  { feature: "Canone mensile", erp: { type: "text", text: "€500 – €5.000+" }, eic: { type: "text", text: "€99 – €399" } },
  { feature: "Moduli edilizia nativi", erp: { type: "partial" }, eic: { type: "text", text: "100% pensati per edilizia" } },
  { feature: "Supporto in italiano", erp: { type: "text", text: "Ticket, settimane di risposta" }, eic: { type: "text", text: "Telefono/WhatsApp, risposta 2h" } },
  { feature: "Aggiornamenti prodotto", erp: { type: "text", text: "1-2/anno con costi aggiuntivi" }, eic: { type: "text", text: "Mensili, inclusi nel piano" } },
  { feature: "Scalabilità per PMI", erp: { type: "cross" }, eic: { type: "text", text: "Progettato per PMI 200K-5M" } },
  { feature: "Marginalità cantieri", erp: { type: "text", text: "Da configurare con consulente" }, eic: { type: "text", text: "Nativo, pronto dal giorno 1" } },
  { feature: "Rischio blocco vendor", erp: { type: "cross" }, eic: { type: "text", text: "Esporta sempre i tuoi dati" } },
];

const commercialistaRows: { feature: string; solo: TableCell; combined: TableCell }[] = [
  { feature: "Frequenza dati", solo: { type: "text", text: "Mensile/Trimestrale" }, combined: { type: "text", text: "Giornaliera" } },
  { feature: "Margine per cantiere", solo: { type: "cross" }, combined: { type: "text", text: "Aggiornato al secondo" } },
  { feature: "Previsionale cassa", solo: { type: "cross" }, combined: { type: "text", text: "A 90 giorni" } },
  { feature: "Costo manodopera reale", solo: { type: "text", text: "Post-consuntivo" }, combined: { type: "text", text: "In tempo reale" } },
  { feature: "Quando scopri i problemi", solo: { type: "text", text: "Quando è tardi" }, combined: { type: "text", text: "Prima che diventino gravi" } },
  { feature: "Costo totale", solo: { type: "text", text: "€12.000-36.000/anno" }, combined: { type: "text", text: "Da €1.188/anno (+commercialista per sola contabilità)" } },
];

const concorrentiRows: { feature: string; softA: TableCell; softB: TableCell; eic: TableCell }[] = [
  { feature: "Previsionale di cassa", softA: { type: "partial" }, softB: { type: "cross" }, eic: { type: "text", text: "Completo, 90 giorni" } },
  { feature: "CRM + Marketing integrato", softA: { type: "cross" }, softB: { type: "cross" }, eic: { type: "check" } },
  { feature: "Email + WhatsApp marketing", softA: { type: "cross" }, softB: { type: "cross" }, eic: { type: "check" } },
  { feature: "Agenti AI", softA: { type: "cross" }, softB: { type: "cross" }, eic: { type: "check" } },
  { feature: "Portale clienti", softA: { type: "cross" }, softB: { type: "partial" }, eic: { type: "check" } },
  { feature: "Fatturazione elettronica SDI", softA: { type: "text", text: "A pagamento extra" }, softB: { type: "cross" }, eic: { type: "check" } },
  { feature: "App mobile offline", softA: { type: "cross" }, softB: { type: "check" }, eic: { type: "check" } },
  { feature: "Setup in 48h", softA: { type: "cross" }, softB: { type: "check" }, eic: { type: "check" } },
  { feature: "Supporto italiano WhatsApp", softA: { type: "cross" }, softB: { type: "cross" }, eic: { type: "check" } },
  { feature: "Garanzia rimborso", softA: { type: "cross" }, softB: { type: "cross" }, eic: { type: "check" } },
  { feature: "Prezzo", softA: { type: "text", text: "Da €150/mese" }, softB: { type: "text", text: "Da €200/mese" }, eic: { type: "text", text: "Da €99/mese" } },
];

const faqItems = [
  {
    q: "Posso importare i dati che ho su Excel?",
    a: "Sì. Il nostro team di onboarding si occupa dell'importazione gratuitamente. Non dovrai fare nulla: ti consegniamo il sistema già popolato con i tuoi dati entro 48 ore dall'attivazione.",
  },
  {
    q: "Posso integrare Edilizia in Cloud con il mio ERP attuale?",
    a: "Dipende dall'ERP. Offriamo API aperte e connettori nativi per i principali sistemi contabili italiani. Il nostro team tecnico valuta gratuitamente la fattibilità prima che tu firmi qualsiasi contratto.",
  },
  {
    q: "Quanto tempo ci vuole per passare da un altro software?",
    a: "La migrazione standard richiede 48-72 ore. Gestiamo noi l'export dal vecchio sistema, l'import, la configurazione e il test. Il tuo team può continuare a lavorare durante la transizione.",
  },
  {
    q: "Cosa succede se voglio tornare indietro?",
    a: "I tuoi dati sono sempre tuoi. In qualsiasi momento puoi esportare tutto in formato Excel/CSV/PDF con un solo click. Nessun costo di uscita, nessun dato trattenuto.",
  },
  {
    q: "Avete un periodo di prova gratuito?",
    a: "Sì. Offriamo una demo personalizzata gratuita (30 minuti con un consulente del controllo) + 14 giorni di accesso completo senza carta di credito. Inizia e vedi i risultati prima di decidere.",
  },
];

export default function Confronto() {
  const [activeSection, setActiveSection] = useState("excel");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useSEO({
    title: "Confronto — Edilizia in Cloud vs Excel, ERP e Concorrenti",
    description: "Confronta Edilizia in Cloud con Excel, software ERP, commercialisti e concorrenti. Scopri perché migliaia di imprenditori edili scelgono la nostra piattaforma.",
    canonical: "/confronto",
    keywords: "confronto software edilizia, alternativa excel edilizia, alternativa ERP costruzioni, migliore software gestionale edilizia",
  });

  useEffect(() => {
    const sectionIds = ["excel", "erp", "commercialista", "concorrenti"];
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id);
        },
        { threshold: 0.3 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white text-[#1a2744] overflow-x-hidden">
      <PromoBanner />
      <LandingNavbar />

      {/* ── HERO ── */}
      <section
        className="pt-36 pb-20 px-4 text-center"
        style={{ background: "linear-gradient(160deg, #1a2744 0%, #0f1d35 100%)" }}
      >
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-[#0fa68c]/20 text-[#0fa68c] text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 border border-[#0fa68c]/30">
            CONFRONTO ONESTO
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-4">
            Edilizia in Cloud vs.{" "}
            <span className="text-[#0fa68c]">le Alternative</span>
          </h1>
          <p className="text-lg text-blue-100/80 mb-10 max-w-xl mx-auto">
            Confronto onesto e dettagliato. Senza marketing. Decide tu.
          </p>

          {/* Tab pills */}
          <div className="flex flex-wrap gap-3 justify-center">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => scrollTo(tab.id)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 border ${
                  activeSection === tab.id
                    ? "bg-[#0fa68c] text-white border-[#0fa68c] shadow-lg shadow-[#0fa68c]/30"
                    : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── SEZIONE vs EXCEL ── */}
      <section id="excel" className="py-20 bg-white px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a2744] mb-3">
              Edilizia in Cloud vs.{" "}
              <span className="text-[#0fa68c]">Excel</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Excel non è colpa tua. Ma ti sta costando più di quanto pensi.
            </p>
          </div>

          {/* Pain point box */}
          <div
            className="rounded-xl p-5 md:p-6 mb-10 border-l-4 border-[#ffc107]"
            style={{ background: "#fff3cd" }}
          >
            <p className="text-[#1a2744] font-medium text-sm md:text-base">
              <span className="font-bold text-[#856404]">Il 78% delle PMI edili italiane</span> gestisce i cantieri con Excel. Il problema non è Excel — il problema è che{" "}
              <strong>Excel non ti avvisa quando stai perdendo soldi.</strong>
            </p>
          </div>

          {/* Comparison table */}
          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm mb-10">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-4 text-sm font-semibold text-gray-500 w-2/5">Funzionalità</th>
                  <th className="text-center p-4 text-sm font-semibold text-gray-700 w-[30%]">Excel</th>
                  <th className="text-center p-4 text-sm font-bold text-[#0fa68c] w-[30%] bg-[#0fa68c]/5 border-l-2 border-[#0fa68c]">
                    Edilizia in Cloud
                  </th>
                </tr>
              </thead>
              <tbody>
                {excelRows.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                    <td className="p-4 text-sm font-medium text-[#1a2744]">{row.feature}</td>
                    <td className="p-4 text-center">
                      <Cell cell={row.excel} />
                    </td>
                    <td className="p-4 text-center bg-[#0fa68c]/5 border-l-2 border-[#0fa68c]">
                      <Cell cell={row.eic} highlight />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Hidden cost box */}
          <div className="rounded-2xl p-6 md:p-8 mb-10" style={{ background: "#f8fafb" }}>
            <h3 className="text-lg font-bold text-[#1a2744] mb-4">
              Calcola il costo reale di Excel per la tua impresa
            </h3>
            <div className="space-y-2 text-sm text-gray-700 mb-4">
              <div className="flex items-start gap-2">
                <span className="text-[#0fa68c] font-bold mt-0.5">•</span>
                <span>10 ore/settimana media spese su fogli Excel</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#0fa68c] font-bold mt-0.5">•</span>
                <span>Costo medio imprenditore: <strong>€50/ora</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#0fa68c] font-bold mt-0.5">•</span>
                <span>= <strong className="text-[#1a2744] text-base">€500/settimana = €2.000/mese = €24.000/anno</strong></span>
              </div>
            </div>
            <p className="text-sm text-gray-500 italic">Solo per "usare Excel gratis".</p>
          </div>

          <div className="text-center">
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 bg-[#0fa68c] hover:bg-[#0d9079] text-white font-bold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-[#0fa68c]/20 text-base"
            >
              Smetti di usare Excel. Inizia gratis.
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── SEZIONE vs ERP ── */}
      <section id="erp" className="py-20 px-4" style={{ background: "#f7f9fc" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a2744] mb-3">
              Edilizia in Cloud vs.{" "}
              <span className="text-[#0fa68c]">ERP Generici</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              SAP, Zucchetti, TeamSystem e simili sono potenti. Ma non parlano la lingua del cantiere.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm mb-10 bg-white">
            <table className="w-full min-w-[580px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-4 text-sm font-semibold text-gray-500 w-2/5">Funzionalità</th>
                  <th className="text-center p-4 text-sm font-semibold text-gray-700 w-[30%]">ERP Generici</th>
                  <th className="text-center p-4 text-sm font-bold text-[#0fa68c] w-[30%] bg-[#0fa68c]/5 border-l-2 border-[#0fa68c]">
                    Edilizia in Cloud
                  </th>
                </tr>
              </thead>
              <tbody>
                {erpRows.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                    <td className="p-4 text-sm font-medium text-[#1a2744]">{row.feature}</td>
                    <td className="p-4 text-center">
                      <Cell cell={row.erp} />
                    </td>
                    <td className="p-4 text-center bg-[#0fa68c]/5 border-l-2 border-[#0fa68c]">
                      <Cell cell={row.eic} highlight />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Testimonial */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 mb-8 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-[#0fa68c]/10 flex items-center justify-center shrink-0 mt-1">
                <span className="text-[#0fa68c] text-xl font-bold leading-none">"</span>
              </div>
              <div>
                <p className="text-gray-700 italic text-sm md:text-base leading-relaxed mb-4">
                  "Usavamo TeamSystem da 3 anni. Pagavamo €800/mese e avevamo bisogno di un consulente per ogni modifica. Con Edilizia in Cloud pago meno, faccio tutto da solo e i margini li vedo in tempo reale."
                </p>
                <p className="text-sm font-semibold text-[#1a2744]">
                  — Fratelli Conti Costruzioni, Napoli
                  <span className="font-normal text-gray-500 ml-1">· 3,5M di fatturato</span>
                </p>
              </div>
            </div>
          </div>

          {/* Savings box */}
          <div className="rounded-2xl bg-[#1a2744] text-white p-6 md:p-8 text-center">
            <p className="text-sm text-blue-200 mb-2 uppercase tracking-widest font-semibold">Risparmio medio</p>
            <p className="text-2xl md:text-3xl font-extrabold">
              €6.000 – €18.000<span className="text-[#0fa68c]">/anno</span>
            </p>
            <p className="text-blue-200 text-sm mt-2">passando da un ERP generico a Edilizia in Cloud</p>
          </div>
        </div>
      </section>

      {/* ── SEZIONE vs COMMERCIALISTA ── */}
      <section id="commercialista" className="py-20 bg-white px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a2744] mb-3">
              Edilizia in Cloud vs.{" "}
              <span className="text-[#0fa68c]">Commercialista per il Controllo</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Il commercialista è fondamentale per la contabilità. Ma non è il posto giusto per controllare i margini.
            </p>
          </div>

          {/* Visual diff box */}
          <div className="grid md:grid-cols-2 gap-0 rounded-2xl overflow-hidden border border-gray-200 shadow-sm mb-10">
            <div className="p-6 md:p-8 bg-gray-50">
              <h3 className="text-base font-bold text-gray-700 mb-5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                Solo Commercialista
              </h3>
              <ul className="space-y-4 text-sm text-gray-700">
                <li>
                  <span className="font-semibold text-gray-900">Ti dice com'è andata</span>
                  <p className="text-gray-500">Report a consuntivo</p>
                </li>
                <li>
                  <span className="font-semibold text-gray-900">1-4 volte l'anno</span>
                  <p className="text-gray-500">Aggiornamenti periodici</p>
                </li>
                <li>
                  <span className="font-semibold text-gray-900">€12.000 – €36.000/anno</span>
                  <p className="text-gray-500">Per il controllo di gestione</p>
                </li>
                <li>
                  <span className="font-semibold text-gray-900">Non conosce il cantiere</span>
                  <p className="text-gray-500">Approccio generico</p>
                </li>
              </ul>
            </div>
            <div className="p-6 md:p-8 bg-[#0fa68c]/5 border-l-2 border-[#0fa68c]">
              <h3 className="text-base font-bold text-[#0fa68c] mb-5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#0fa68c] inline-block" />
                Edilizia in Cloud
              </h3>
              <ul className="space-y-4 text-sm text-[#1a2744]">
                <li>
                  <span className="font-semibold">Ti dice come sta andando</span>
                  <p className="text-gray-600">Dati in tempo reale</p>
                </li>
                <li>
                  <span className="font-semibold">365 giorni l'anno</span>
                  <p className="text-gray-600">Accesso continuo</p>
                </li>
                <li>
                  <span className="font-semibold">Da €99/mese</span>
                  <p className="text-gray-600">Tutto incluso</p>
                </li>
                <li>
                  <span className="font-semibold">Pensato per il cantiere</span>
                  <p className="text-gray-600">Margini, costi, cassa — tutto nativo</p>
                </li>
              </ul>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm mb-10">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="text-left p-4 text-sm font-semibold text-gray-500 w-2/5">Voce</th>
                  <th className="text-center p-4 text-sm font-semibold text-gray-700 w-[28%]">Solo Commercialista</th>
                  <th className="text-center p-4 text-sm font-bold text-[#0fa68c] w-[32%] bg-[#0fa68c]/5 border-l-2 border-[#0fa68c]">
                    EiC + Commercialista (contabilità)
                  </th>
                </tr>
              </thead>
              <tbody>
                {commercialistaRows.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                    <td className="p-4 text-sm font-medium text-[#1a2744]">{row.feature}</td>
                    <td className="p-4 text-center">
                      <Cell cell={row.solo} />
                    </td>
                    <td className="p-4 text-center bg-[#0fa68c]/5 border-l-2 border-[#0fa68c]">
                      <Cell cell={row.combined} highlight />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Key message */}
          <div className="rounded-2xl bg-[#1a2744] text-white p-6 md:p-8 text-center">
            <p className="text-lg md:text-xl font-bold leading-relaxed max-w-2xl mx-auto">
              "Non si tratta di sostituire il commercialista. Si tratta di{" "}
              <span className="text-[#0fa68c]">non aspettare fine anno</span> per scoprire se hai guadagnato."
            </p>
          </div>
        </div>
      </section>

      {/* ── SEZIONE vs CONCORRENTI ── */}
      <section id="concorrenti" className="py-20 px-4" style={{ background: "#f7f9fc" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a2744] mb-3">
              Edilizia in Cloud vs.{" "}
              <span className="text-[#0fa68c]">Altri Software per l'Edilizia</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Esistono altri software per l'edilizia. Ecco perché i nostri clienti scelgono noi.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm mb-10 bg-white">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="text-left p-4 text-sm font-semibold text-gray-500" style={{ minWidth: "180px" }}>Funzionalità</th>
                  <th className="text-center p-4 text-sm font-semibold text-gray-700" style={{ minWidth: "140px" }}>
                    Software A
                    <span className="block text-xs font-normal text-gray-400">da €150/mese</span>
                  </th>
                  <th className="text-center p-4 text-sm font-semibold text-gray-700" style={{ minWidth: "140px" }}>
                    Software B
                    <span className="block text-xs font-normal text-gray-400">da €200/mese</span>
                  </th>
                  <th className="text-center p-4 text-sm font-bold text-[#0fa68c] bg-[#0fa68c]/5 border-l-2 border-[#0fa68c]" style={{ minWidth: "160px" }}>
                    Edilizia in Cloud
                    <span className="block text-xs font-normal text-[#0fa68c]/70">da €99/mese</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {concorrentiRows.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}>
                    <td className="p-4 text-sm font-medium text-[#1a2744]">{row.feature}</td>
                    <td className="p-4 text-center">
                      <Cell cell={row.softA} />
                    </td>
                    <td className="p-4 text-center">
                      <Cell cell={row.softB} />
                    </td>
                    <td className="p-4 text-center bg-[#0fa68c]/5 border-l-2 border-[#0fa68c]">
                      <Cell cell={row.eic} highlight />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Final diff box */}
          <div className="rounded-2xl border-2 border-[#0fa68c] bg-white p-6 md:p-8">
            <p className="text-sm font-bold text-[#0fa68c] uppercase tracking-widest mb-3">La differenza vera</p>
            <p className="text-[#1a2744] font-medium text-sm md:text-base leading-relaxed">
              Edilizia in Cloud ha più funzionalità a un prezzo inferiore. Ma la differenza vera è questa:{" "}
              <strong>siamo gli unici ad avere un Consulente del Controllo dedicato incluso nel piano.</strong>
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 bg-white px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a2744] mb-3">
              Domande frequenti sul confronto
            </h2>
            <p className="text-gray-500 text-base">Risposte dirette alle obiezioni più comuni.</p>
          </div>

          <div className="space-y-3">
            {faqItems.map((item, i) => (
              <div
                key={i}
                className="rounded-xl border border-gray-200 overflow-hidden shadow-sm"
              >
                <button
                  className="w-full flex items-center justify-between p-5 text-left bg-white hover:bg-gray-50/70 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-semibold text-[#1a2744] text-sm md:text-base pr-4">{item.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="w-5 h-5 text-[#0fa68c] shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 bg-white border-t border-gray-100">
                    <p className="text-sm text-gray-600 leading-relaxed pt-3">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINALE ── */}
      <section
        className="py-20 px-4 text-center"
        style={{ background: "#1a2744" }}
      >
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Visto abbastanza?{" "}
            <span className="text-[#0fa68c]">Parliamo.</span>
          </h2>
          <p className="text-blue-200/80 text-base mb-8 max-w-md mx-auto">
            Demo gratuita e personalizzata. Nessun obbligo. Il nostro consulente del controllo ti mostra esattamente cosa cambierebbe nella tua impresa.
          </p>
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 bg-[#0fa68c] hover:bg-[#0d9079] text-white font-bold px-10 py-4 rounded-xl transition-colors shadow-xl shadow-[#0fa68c]/30 text-base"
          >
            Prenota la tua demo gratuita
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-blue-300/50 text-xs mt-5">Nessuna carta di credito · Risposta entro 2 ore · 14 giorni di prova completa</p>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
