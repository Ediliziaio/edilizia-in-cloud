import { useState, useEffect, useRef } from "react";
import { useSEO } from "@/hooks/useSEO";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import {
  Building2,
  TrendingUp,
  BookOpen,
  ShieldCheck,
  Users,
  ShoppingCart,
  BarChart3,
  AlertTriangle,
  Wallet,
  Building,
  FileCheck,
  Receipt,
  Clock,
  DollarSign,
  PieChart,
  Kanban,
  FileSignature,
  Mail,
  MessageSquare,
  Zap,
  Target,
  BarChart2,
  CalendarDays,
  MapPin,
  FileText,
  Bell,
  BarChart,
  Truck,
  MinusCircle,
  Inbox,
  Bot,
  Workflow,
  RefreshCw,
  Shield,
  Globe,
  Image,
  Headphones,
  CheckCircle2,
  LayoutGrid,
} from "lucide-react";

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

// ─── Types ───────────────────────────────────────────────────────────────────

interface FeatureItem {
  icon: React.ReactNode;
  name: string;
  desc: string;
}

interface TabData {
  id: string;
  label: string;
  color: string;
  bgLight: string;
  borderColor: string;
  title: string;
  desc: string;
  features: FeatureItem[];
  mockup: React.ReactNode;
  impact: string;
}

// ─── Mockups ─────────────────────────────────────────────────────────────────

const MockupCantieri = () => (
  <div className="bg-[#f8f9fa] rounded-xl border border-gray-200 p-5 font-mono text-xs leading-relaxed">
    <div className="flex items-center justify-between mb-3">
      <span className="font-bold font-sans text-[#1a2744] text-sm">Commessa #2024-047</span>
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200 font-sans">
        In Corso
      </span>
    </div>
    <p className="text-[#1a2744]/60 font-sans text-xs mb-4">Ristrutturazione Villa Bianchi — Via Roma 12, Milano</p>
    <div className="grid grid-cols-3 gap-2 mb-4">
      {[
        { label: "Valore Totale", value: "€ 148.500" },
        { label: "Costi Sostenuti", value: "€ 91.200" },
        { label: "Margine", value: "38.6%", green: true },
      ].map((item) => (
        <div key={item.label} className="bg-white rounded-lg p-2.5 text-center border border-gray-100">
          <div className="text-[9px] text-[#1a2744]/40 uppercase tracking-wide mb-1 font-sans">{item.label}</div>
          <div className={`font-bold text-xs font-sans ${item.green ? "text-green-600" : "text-[#1a2744]"}`}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
    <div className="mb-1 flex justify-between text-[10px] text-[#1a2744]/50 font-sans">
      <span>Avanzamento</span>
      <span className="font-bold text-[#1a2744]">78%</span>
    </div>
    <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
      <div className="h-full rounded-full bg-[#3b82f6]" style={{ width: "78%" }} />
    </div>
    <div className="border-t border-gray-200 pt-3 space-y-1 text-[#1a2744]/70">
      <p className="text-[10px] font-sans font-semibold text-[#1a2744]/40 uppercase mb-1">Ultime voci di costo</p>
      <p>• Manodopera settimana 12: <span className="text-[#1a2744] font-semibold">€ 4.200</span></p>
      <p>• Materiali idraulici: <span className="text-[#1a2744] font-semibold">€ 1.890</span></p>
      <p>• Noleggio ponteggio: <span className="text-[#1a2744] font-semibold">€ 680</span></p>
    </div>
    <div className="mt-3 flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-[10px] font-sans">Costi materiali +12% vs preventivo</span>
    </div>
  </div>
);

const MockupFinanza = () => (
  <div className="bg-[#f8f9fa] rounded-xl border border-gray-200 p-5 font-mono text-xs leading-relaxed">
    <div className="flex items-center justify-between mb-3">
      <span className="font-bold font-sans text-[#1a2744] text-sm">Previsionale Cassa — 90 giorni</span>
    </div>
    <div className="bg-white rounded-lg p-3 border border-gray-100 mb-3">
      <div className="text-[9px] text-[#1a2744]/40 uppercase tracking-wide font-sans mb-1">Saldo attuale</div>
      <div className="text-2xl font-bold text-[#0fa68c] font-sans">€ 87.420</div>
    </div>
    <div className="space-y-2">
      {[
        { month: "Feb", in: "+€ 42.800", out: null, note: "3 incassi previsti", good: true },
        { month: "Mar", in: "+€ 68.500", out: "−€ 23.400", note: "5 incassi · 4 pagamenti", good: true },
        { month: "Apr", in: "+€ 31.000", out: "−€ 18.900", note: "2 incassi · 3 pagamenti", good: true },
      ].map((row) => (
        <div key={row.month} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
          <span className="font-sans font-bold text-[#1a2744] w-8">{row.month}</span>
          <span className="text-green-600 font-semibold flex-1">{row.in}</span>
          {row.out && <span className="text-red-500 font-semibold">{row.out}</span>}
          <span className="text-[9px] text-[#1a2744]/40 font-sans hidden sm:block">{row.note}</span>
        </div>
      ))}
    </div>
    <div className="mt-3 flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-[10px] font-sans">Scadenza Brico SpA: € 8.400 il 15/03</span>
    </div>
    <div className="mt-2 flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-[10px] font-sans">SDI: 3 fatture inviate · 2 confermate · 1 in elaborazione</span>
    </div>
  </div>
);

const MockupMarketing = () => (
  <div className="bg-[#f8f9fa] rounded-xl border border-gray-200 p-5 font-mono text-xs leading-relaxed">
    <div className="flex items-center justify-between mb-3">
      <span className="font-bold font-sans text-[#1a2744] text-sm">Pipeline Vendite Q1 2024</span>
      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200 font-sans">
        Totale: € 312k
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2">
      {[
        {
          label: "Lead",
          count: 8,
          color: "bg-blue-50 border-blue-200",
          items: ["Condominio Via Petrarca (12k)", "Immobiliare Centrale (28k)", "+3 altri..."],
        },
        {
          label: "Trattativa",
          count: 5,
          color: "bg-amber-50 border-amber-200",
          items: ["Fratelli Esposito (85k)", "Costruzioni Mancini (51k)", "+2 altri..."],
        },
        {
          label: "Proposta",
          count: 3,
          color: "bg-purple-50 border-purple-200",
          items: ["Villa Verde Construct. (34k)", "+ Aggiungi"],
        },
        {
          label: "Chiuso",
          count: 12,
          color: "bg-green-50 border-green-200",
          items: ["✓ Rossi Mario € 42.800", "✓ Condominio € 65.000", "✓ +10 altri..."],
        },
      ].map((col) => (
        <div key={col.label} className={`rounded-lg border p-2.5 ${col.color}`}>
          <div className="font-sans font-bold text-[10px] text-[#1a2744]/60 uppercase mb-1.5">
            {col.label} ({col.count})
          </div>
          {col.items.map((item, i) => (
            <div key={i} className="text-[9px] text-[#1a2744]/70 mb-0.5 truncate">
              {item}
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

const MockupHR = () => (
  <div className="bg-[#f8f9fa] rounded-xl border border-gray-200 p-5 font-mono text-xs leading-relaxed">
    <div className="flex items-center justify-between mb-3">
      <span className="font-bold font-sans text-[#1a2744] text-sm">Personale — Questa Settimana</span>
    </div>
    <div className="space-y-1 mb-3">
      <div className="grid grid-cols-4 gap-1 text-[9px] text-[#1a2744]/40 uppercase font-sans px-2 mb-1">
        <span>Nome</span>
        <span>Cantiere</span>
        <span className="text-right">Ore</span>
        <span className="text-right">Tot</span>
      </div>
      {[
        { nome: "Mario Bianchi", cantiere: "Villa Rossi (MI)", ore: "38h", tot: "€ 836" },
        { nome: "Giuseppe Greco", cantiere: "Villa Rossi (MI)", ore: "40h", tot: "€ 760" },
        { nome: "Luca Ferrari", cantiere: "Uff. Centrale (RM)", ore: "32h", tot: "€ 800" },
        { nome: "Ahmed Malik", cantiere: "Villa Rossi (MI)", ore: "40h", tot: "€ 720" },
      ].map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-4 gap-1 bg-white rounded-lg px-2 py-1.5 border border-gray-100 text-[10px]"
        >
          <span className="font-sans font-semibold text-[#1a2744] truncate">{row.nome}</span>
          <span className="text-[#1a2744]/60 truncate">{row.cantiere}</span>
          <span className="text-right text-[#1a2744]">{row.ore}</span>
          <span className="text-right font-bold text-amber-600">{row.tot}</span>
        </div>
      ))}
    </div>
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-sans">
      <p className="text-[10px] font-bold text-[#1a2744]">Costo totale manodopera: € 4.116</p>
      <p className="text-[9px] text-[#1a2744]/60 mt-0.5">Attribuito a cantieri: 89% · Non attribuito: 11%</p>
    </div>
  </div>
);

const MockupDocumenti = () => (
  <div className="bg-[#f8f9fa] rounded-xl border border-gray-200 p-5 font-mono text-xs leading-relaxed">
    <div className="flex items-center justify-between mb-3">
      <span className="font-bold font-sans text-[#1a2744] text-sm">Documenti Fiscali — Marzo 2024</span>
    </div>
    <div className="space-y-1.5 mb-3">
      {[
        { doc: "FT-2024-0089", cliente: "Rossi Mario", importo: "€ 8.400", stato: "✓ Inviata SDI", stileStato: "text-green-600" },
        { doc: "FT-2024-0088", cliente: "Cond. Petrarca", importo: "€ 15.200", stato: "✓ Pagata", stileStato: "text-green-600" },
        { doc: "FT-2024-0087", cliente: "Imm. Centrale", importo: "€ 6.800", stato: "⏳ In attesa", stileStato: "text-amber-600" },
        { doc: "DDT-0234", cliente: "Brico SpA", importo: "—", stato: "✓ Ricevuto", stileStato: "text-green-600" },
      ].map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-4 gap-1 bg-white rounded-lg px-2 py-1.5 border border-gray-100 items-center"
        >
          <span className="font-bold text-[#3b82f6] text-[9px]">{row.doc}</span>
          <span className="text-[#1a2744]/70 text-[9px] truncate">{row.cliente}</span>
          <span className="text-[#1a2744] font-semibold text-[9px]">{row.importo}</span>
          <span className={`text-[9px] font-semibold ${row.stileStato}`}>{row.stato}</span>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-white rounded-lg p-2 border border-gray-100 text-center">
        <div className="text-[9px] text-[#1a2744]/40 font-sans uppercase">Fatturato mese</div>
        <div className="font-bold text-[#1a2744] font-sans text-sm">€ 68.400</div>
      </div>
      <div className="bg-white rounded-lg p-2 border border-gray-100 text-center">
        <div className="text-[9px] text-[#1a2744]/40 font-sans uppercase">Da incassare</div>
        <div className="font-bold text-amber-600 font-sans text-sm">€ 21.600</div>
      </div>
    </div>
  </div>
);

const MockupAI = () => (
  <div className="bg-[#f8f9fa] rounded-xl border border-gray-200 p-5 font-mono text-xs leading-relaxed">
    <div className="flex items-center gap-2 mb-3">
      <div className="w-6 h-6 rounded-full bg-pink-100 border border-pink-200 flex items-center justify-center">
        <Bot className="w-3.5 h-3.5 text-pink-600" />
      </div>
      <span className="font-bold font-sans text-[#1a2744] text-sm">Agente AI "Controllo Margini"</span>
      <span className="ml-auto text-[9px] text-[#1a2744]/40 font-sans">oggi 09:41</span>
    </div>
    <div className="bg-white rounded-lg border border-pink-200 p-3 mb-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-[#1a2744]/80 font-sans leading-relaxed">
          <span className="font-bold text-[#1a2744]">Alert generato:</span> "Il cantiere Villa Bianchi ha superato il
          budget materiali del 14%. Proiettando i costi attuali, il margine finale sarà 28% vs il 38% preventivato.
          Azione consigliata: revisione fornitore materiali."
        </p>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 mb-2">
      <div className="bg-white rounded-lg p-2.5 border border-gray-100 text-center">
        <div className="text-[9px] text-[#1a2744]/40 font-sans uppercase mb-0.5">Flow attivi</div>
        <div className="font-bold text-pink-600 font-sans text-base">7</div>
      </div>
      <div className="bg-white rounded-lg p-2.5 border border-gray-100 text-center">
        <div className="text-[9px] text-[#1a2744]/40 font-sans uppercase mb-0.5">Azioni oggi</div>
        <div className="font-bold text-pink-600 font-sans text-base">23</div>
      </div>
    </div>
    <div className="space-y-1 text-[9px] text-[#1a2744]/60 font-sans">
      <p>• Follow-up email automatici: <span className="font-semibold text-[#1a2744]">8</span></p>
      <p>• Reminder scadenze inviati: <span className="font-semibold text-[#1a2744]">5</span></p>
      <p>• Aggiornamenti stato cantieri: <span className="font-semibold text-[#1a2744]">10</span></p>
    </div>
  </div>
);

const MockupClienti = () => (
  <div className="bg-[#f8f9fa] rounded-xl border border-gray-200 p-5 font-mono text-xs leading-relaxed">
    <div className="flex items-center gap-2 mb-1">
      <Globe className="w-3.5 h-3.5 text-[#0fa68c]" />
      <span className="text-[9px] text-[#1a2744]/40 font-sans">clienti.ediliziaincloud.com</span>
    </div>
    <div className="font-bold font-sans text-[#1a2744] text-sm mb-3">Portale Cliente — Famiglia Rossi</div>
    <div className="bg-white rounded-lg border border-gray-100 p-3 mb-3">
      <p className="font-sans font-semibold text-[#1a2744] text-xs mb-2">Ristrutturazione Villa (Via Roma 12)</p>
      <div className="mb-1 flex justify-between text-[10px] text-[#1a2744]/50 font-sans">
        <span>Avanzamento</span>
        <span className="font-bold text-[#1a2744]">78%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div className="h-full rounded-full bg-[#0fa68c]" style={{ width: "78%" }} />
      </div>
      <p className="text-[9px] text-[#1a2744]/50 font-sans">Prossima fase: Pavimentazioni (stimato 15/04)</p>
    </div>
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2 font-sans">
      <p className="text-[10px] font-bold text-amber-700">Documenti da approvare: 1</p>
      <p className="text-[9px] text-amber-600">→ SAL n.3 — € 24.800 [FIRMA ORA →]</p>
    </div>
    <div className="space-y-0.5 text-[9px] text-[#1a2744]/60 font-sans">
      <p className="font-semibold text-[#1a2744]/40 uppercase text-[8px] mb-1">Ultimi aggiornamenti</p>
      <p>• 12/03: Completata posa impianto idraulico</p>
      <p>• 10/03: Iniziata posa massetto</p>
    </div>
  </div>
);

// ─── Tab data ─────────────────────────────────────────────────────────────────

const TABS: TabData[] = [
  {
    id: "cantieri",
    label: "Cantieri",
    color: "#3b82f6",
    bgLight: "rgba(59,130,246,0.06)",
    borderColor: "rgba(59,130,246,0.25)",
    title: "Controllo totale su ogni cantiere, in tempo reale",
    desc: "Dal sopralluogo alla chiusura lavori, ogni commessa sotto controllo. Margini reali, costi aggiornati al secondo, avanzamento visibile da qualsiasi dispositivo.",
    features: [
      { icon: <Building2 className="w-4 h-4" />, name: "Gestione Commesse", desc: "Stato avanzamento %, documenti allegati, storico variazioni" },
      { icon: <TrendingUp className="w-4 h-4" />, name: "Marginalità per cantiere", desc: "Costo reale vs preventivo, margine aggiornato live" },
      { icon: <BookOpen className="w-4 h-4" />, name: "Giornale dei Lavori", desc: "Registro giornaliero, foto, note tecniche da mobile" },
      { icon: <ShieldCheck className="w-4 h-4" />, name: "Sicurezza Cantiere", desc: "DPI, attestati, scadenze formazione, incidenti" },
      { icon: <Users className="w-4 h-4" />, name: "Squadre e Risorse", desc: "Chi lavora dove, ore per cantiere, costo manodopera" },
      { icon: <ShoppingCart className="w-4 h-4" />, name: "Ordini di Acquisto", desc: "ODA ai fornitori, stato consegne, ricevimento merci" },
      { icon: <BarChart3 className="w-4 h-4" />, name: "Analisi Comparata", desc: "Confronta margini tra cantieri, identifica i più profittevoli" },
      { icon: <AlertTriangle className="w-4 h-4" />, name: "Alert Automatici", desc: "Notifica se costi superano budget o se margine scende sotto soglia" },
    ],
    mockup: <MockupCantieri />,
    impact: "Risparmio medio 8h/settimana su reportistica cantieri",
  },
  {
    id: "finanza",
    label: "Finanza",
    color: "#0fa68c",
    bgLight: "rgba(15,166,140,0.06)",
    borderColor: "rgba(15,166,140,0.25)",
    title: "Sai esattamente quanti soldi hai e quanti ne arriveranno",
    desc: "Previsionale di cassa, tesoreria, fatturazione elettronica SDI e scadenzario — tutto integrato. Il commercialista ti ringrazierà.",
    features: [
      { icon: <Wallet className="w-4 h-4" />, name: "Previsionale di Cassa", desc: "Forecast liquidità a 30/60/90 giorni" },
      { icon: <Building className="w-4 h-4" />, name: "Tesoreria", desc: "Conti correnti, movimenti, riconciliazione bancaria" },
      { icon: <BarChart3 className="w-4 h-4" />, name: "Costi Aziendali", desc: "Fissi, variabili, overhead per categoria" },
      { icon: <FileCheck className="w-4 h-4" />, name: "Fatturazione Elettronica SDI", desc: "Emissione, ricezione, cassetto SDI" },
      { icon: <Receipt className="w-4 h-4" />, name: "Prima Nota", desc: "Registro contabile, partita doppia semplificata" },
      { icon: <Clock className="w-4 h-4" />, name: "Scadenzario", desc: "Pagamenti da ricevere e da fare, alert automatici" },
      { icon: <DollarSign className="w-4 h-4" />, name: "Registro Incassi", desc: "Tracciamento pagamenti ricevuti" },
      { icon: <PieChart className="w-4 h-4" />, name: "Report Finanziari", desc: "P&L, cash flow, analisi per periodo" },
    ],
    mockup: <MockupFinanza />,
    impact: "Le imprese che usano il previsionale riducono i problemi di cassa del 73%",
  },
  {
    id: "marketing",
    label: "Marketing",
    color: "#8b5cf6",
    bgLight: "rgba(139,92,246,0.06)",
    borderColor: "rgba(139,92,246,0.25)",
    title: "Acquisisci più clienti e chiudi più preventivi",
    desc: "CRM, preventivi digitali, email marketing, WhatsApp, automazioni e lead form Facebook — il tuo team commerciale in un'app.",
    features: [
      { icon: <Users className="w-4 h-4" />, name: "CRM Contatti", desc: "Anagrafica clienti e lead, tag, storico interazioni" },
      { icon: <Kanban className="w-4 h-4" />, name: "Pipeline Opportunità", desc: "Gestione trattative con drag & drop per fase" },
      { icon: <FileSignature className="w-4 h-4" />, name: "Preventivi Digitali", desc: "Preventivi con firma elettronica online" },
      { icon: <Mail className="w-4 h-4" />, name: "Email Marketing", desc: "Campagne con editor drag & drop, template professionali" },
      { icon: <MessageSquare className="w-4 h-4" />, name: "WhatsApp Marketing", desc: "Messaggi, automazioni e broadcast WhatsApp" },
      { icon: <Zap className="w-4 h-4" />, name: "Automazioni", desc: "Flow builder visuale, trigger automatici su eventi" },
      { icon: <Target className="w-4 h-4" />, name: "Lead Form Facebook", desc: "Cattura lead da Facebook/Instagram direttamente in CRM" },
      { icon: <BarChart2 className="w-4 h-4" />, name: "Analisi Preventivi", desc: "Conversion rate, tempo medio chiusura, analisi performance" },
    ],
    mockup: <MockupMarketing />,
    impact: "+35% tasso di chiusura preventivi con firma digitale online",
  },
  {
    id: "hr",
    label: "HR & Personale",
    color: "#f59e0b",
    bgLight: "rgba(245,158,11,0.06)",
    borderColor: "rgba(245,158,11,0.25)",
    title: "Il tuo team, sempre sotto controllo",
    desc: "Gestisci dipendenti, squadre esterne, timbrature e costi del personale. Sapere il costo reale di ogni operaio per ogni cantiere.",
    features: [
      { icon: <Users className="w-4 h-4" />, name: "Anagrafica Personale", desc: "Dipendenti, squadre esterne, subappaltatori" },
      { icon: <Clock className="w-4 h-4" />, name: "Timbratura Kiosk", desc: "Badge in/out da tablet installato in cantiere" },
      { icon: <DollarSign className="w-4 h-4" />, name: "Costo Manodopera", desc: "Costo reale H per dipendente e per cantiere" },
      { icon: <CalendarDays className="w-4 h-4" />, name: "Calendario Presenze", desc: "Ferie, permessi, malattie centralizzate" },
      { icon: <MapPin className="w-4 h-4" />, name: "Assegnazione Cantieri", desc: "Chi lavora dove, quando, per quanto" },
      { icon: <FileText className="w-4 h-4" />, name: "Documenti Personale", desc: "Contratti, attestati, documenti in scadenza" },
      { icon: <Bell className="w-4 h-4" />, name: "Alert Scadenze", desc: "Notifica scadenze contratti, visite mediche, formazione" },
      { icon: <BarChart className="w-4 h-4" />, name: "Report HR", desc: "Ore lavorate, costi, produttività per dipendente" },
    ],
    mockup: <MockupHR />,
    impact: "Ottimizzazione 10-20% costi manodopera in media dopo 3 mesi",
  },
  {
    id: "documenti",
    label: "Documenti",
    color: "#3b82f6",
    bgLight: "rgba(59,130,246,0.06)",
    borderColor: "rgba(59,130,246,0.25)",
    title: "Fatturazione elettronica nativa. Zero mal di testa.",
    desc: "Emetti fatture elettroniche, DDT, proforma, note credito direttamente dalla piattaforma. Integrazione SDI completa, cassetto fiscale incluso.",
    features: [
      { icon: <FileCheck className="w-4 h-4" />, name: "Fatture Elettroniche", desc: "Emissione XML, invio SDI, notifiche stato" },
      { icon: <Truck className="w-4 h-4" />, name: "DDT", desc: "Documenti di trasporto collegati alle commesse" },
      { icon: <FileText className="w-4 h-4" />, name: "Proforma", desc: "Preventivi formali prima della fattura definitiva" },
      { icon: <MinusCircle className="w-4 h-4" />, name: "Note di Credito", desc: "Storno e rettifica fatture" },
      { icon: <Inbox className="w-4 h-4" />, name: "Cassetto SDI", desc: "Ricezione fatture fornitori, organizzazione automatica" },
      { icon: <DollarSign className="w-4 h-4" />, name: "Registro Incassi", desc: "Tracciamento pagamenti ricevuti per fattura" },
      { icon: <Building className="w-4 h-4" />, name: "Anagrafica", desc: "Clienti e fornitori con dati fiscali completi" },
      { icon: <BarChart3 className="w-4 h-4" />, name: "Report Fatturazione", desc: "Fatturato per periodo, cliente, cantiere" },
    ],
    mockup: <MockupDocumenti />,
    impact: "Risparmio 3-4 ore/settimana su gestione fatturazione",
  },
  {
    id: "ai",
    label: "AI & Automazioni",
    color: "#ec4899",
    bgLight: "rgba(236,72,153,0.06)",
    borderColor: "rgba(236,72,153,0.25)",
    title: "L'intelligenza artificiale lavora per te, 24/7",
    desc: "Agenti AI personalizzati, flow di automazione no-code e assistente interno — l'AI che conosce il tuo settore e la tua impresa.",
    features: [
      { icon: <Bot className="w-4 h-4" />, name: "Agenti AI Custom", desc: "Agenti addestrati sui dati della tua impresa" },
      { icon: <Workflow className="w-4 h-4" />, name: "Flow Builder", desc: "Automazioni visuale drag & drop senza codice" },
      { icon: <MessageSquare className="w-4 h-4" />, name: "Chat Interna AI", desc: "Assistente che risponde alle tue domande sui dati" },
      { icon: <Zap className="w-4 h-4" />, name: "Trigger Automatici", desc: "Azioni automatiche su eventi (nuovo ordine, pagamento, ecc.)" },
      { icon: <Mail className="w-4 h-4" />, name: "Email Automatiche", desc: "Follow-up clienti, reminder scadenze, conferme" },
      { icon: <Bell className="w-4 h-4" />, name: "Notifiche Smart", desc: "Notifiche intelligenti solo per ciò che conta davvero" },
      { icon: <RefreshCw className="w-4 h-4" />, name: "Sincronizzazione", desc: "Dati sempre aggiornati tra tutti i moduli" },
      { icon: <Shield className="w-4 h-4" />, name: "AI Sicuro", desc: "Dati aziendali mai condivisi con terzi, AI privata" },
    ],
    mockup: <MockupAI />,
    impact: "Risparmio medio 5h/settimana su attività ripetitive",
  },
  {
    id: "clienti",
    label: "Clienti",
    color: "#0fa68c",
    bgLight: "rgba(15,166,140,0.06)",
    borderColor: "rgba(15,166,140,0.25)",
    title: "I tuoi clienti seguono il cantiere in tempo reale",
    desc: "Portale clienti dedicato dove possono vedere l'avanzamento lavori, approvare documenti e comunicare con te. Zero chiamate inutili.",
    features: [
      { icon: <Globe className="w-4 h-4" />, name: "Portale Clienti", desc: "Accesso web dedicato per ogni cliente" },
      { icon: <BarChart className="w-4 h-4" />, name: "Avanzamento Lavori", desc: "Il cliente vede % completamento in tempo reale" },
      { icon: <FileSignature className="w-4 h-4" />, name: "Approvazione Documenti", desc: "Preventivi e SAL firmabili online" },
      { icon: <MessageSquare className="w-4 h-4" />, name: "Messaggistica", desc: "Comunicazione diretta cliente-impresa tracciata" },
      { icon: <Image className="w-4 h-4" />, name: "Foto Cantiere", desc: "Galleria foto condivisibile con il cliente" },
      { icon: <Bell className="w-4 h-4" />, name: "Notifiche Cliente", desc: "Aggiornamenti automatici sullo stato lavori" },
      { icon: <Headphones className="w-4 h-4" />, name: "Assistenza Ticket", desc: "Sistema ticket per richieste e reclami" },
      { icon: <Shield className="w-4 h-4" />, name: "Accesso Sicuro", desc: "Ogni cliente vede solo i propri cantieri" },
    ],
    mockup: <MockupClienti />,
    impact: "Riduzione del 60% delle chiamate di aggiornamento da parte dei clienti",
  },
];

// All modules for the grid at the bottom
const ALL_MODULES = [
  { icon: <Building2 className="w-4 h-4" />, name: "Gestione Commesse", cat: "Cantieri" },
  { icon: <TrendingUp className="w-4 h-4" />, name: "Marginalità Cantieri", cat: "Cantieri" },
  { icon: <BookOpen className="w-4 h-4" />, name: "Giornale dei Lavori", cat: "Cantieri" },
  { icon: <ShieldCheck className="w-4 h-4" />, name: "Sicurezza Cantiere", cat: "Cantieri" },
  { icon: <ShoppingCart className="w-4 h-4" />, name: "Ordini di Acquisto", cat: "Cantieri" },
  { icon: <Wallet className="w-4 h-4" />, name: "Previsionale di Cassa", cat: "Finanza" },
  { icon: <Building className="w-4 h-4" />, name: "Tesoreria", cat: "Finanza" },
  { icon: <FileCheck className="w-4 h-4" />, name: "Fatturazione SDI", cat: "Finanza" },
  { icon: <Receipt className="w-4 h-4" />, name: "Prima Nota", cat: "Finanza" },
  { icon: <PieChart className="w-4 h-4" />, name: "Report Finanziari", cat: "Finanza" },
  { icon: <Users className="w-4 h-4" />, name: "CRM Contatti", cat: "Marketing" },
  { icon: <Kanban className="w-4 h-4" />, name: "Pipeline Vendite", cat: "Marketing" },
  { icon: <FileSignature className="w-4 h-4" />, name: "Preventivi Digitali", cat: "Marketing" },
  { icon: <Mail className="w-4 h-4" />, name: "Email Marketing", cat: "Marketing" },
  { icon: <MessageSquare className="w-4 h-4" />, name: "WhatsApp Marketing", cat: "Marketing" },
  { icon: <Target className="w-4 h-4" />, name: "Lead Form Facebook", cat: "Marketing" },
  { icon: <Clock className="w-4 h-4" />, name: "Timbratura Kiosk", cat: "HR" },
  { icon: <CalendarDays className="w-4 h-4" />, name: "Calendario Presenze", cat: "HR" },
  { icon: <MapPin className="w-4 h-4" />, name: "Assegnazione Cantieri", cat: "HR" },
  { icon: <FileText className="w-4 h-4" />, name: "Documenti Personale", cat: "HR" },
  { icon: <Truck className="w-4 h-4" />, name: "DDT", cat: "Documenti" },
  { icon: <Inbox className="w-4 h-4" />, name: "Cassetto SDI", cat: "Documenti" },
  { icon: <Bot className="w-4 h-4" />, name: "Agenti AI Custom", cat: "AI" },
  { icon: <Workflow className="w-4 h-4" />, name: "Flow Builder", cat: "AI" },
  { icon: <Globe className="w-4 h-4" />, name: "Portale Clienti", cat: "Clienti" },
  { icon: <Image className="w-4 h-4" />, name: "Foto Cantiere", cat: "Clienti" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function Funzionalita() {
  const [activeTab, setActiveTab] = useState<string>("tutti");
  const [visiblePanel, setVisiblePanel] = useState<string>("tutti");
  const tabsRef = useRef<HTMLDivElement>(null);

  useSEO({
    title: "Funzionalità — Software Gestionale Completo per Edilizia",
    description: "Scopri tutte le funzionalità di Edilizia in Cloud: gestione cantieri, contabilità, marketing, HR, documenti e intelligenza artificiale. 26+ moduli integrati.",
    canonical: "/funzionalita",
    keywords: "funzionalità gestionale edilizia, moduli software edilizia, gestione cantieri digitale, contabilità edilizia, HR edilizia, marketing imprese edili",
  });

  // Animate panel transition
  useEffect(() => {
    setVisiblePanel(activeTab);
  }, [activeTab]);

  const activeCategoryData = TABS.find((t) => t.id === activeTab);

  return (
    <div className="min-h-screen bg-white text-[#1a2744] overflow-x-hidden">
      <PromoBanner />
      <LandingNavbar />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        style={{ background: "linear-gradient(135deg, #1a2744 0%, #0f1d35 100%)" }}
        className="pt-36 pb-24 px-6 text-center"
      >
        <div className="max-w-3xl mx-auto">
          <div
            className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-6 border"
            style={{
              background: "rgba(15,166,140,0.15)",
              color: "#0fa68c",
              borderColor: "rgba(15,166,140,0.3)",
            }}
          >
            PIATTAFORMA ALL-IN-ONE
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            Una piattaforma.
            <br />
            <span style={{ color: "#0fa68c" }}>Tutto quello che serve.</span>
          </h1>
          <p className="text-lg md:text-xl text-white/70 leading-relaxed mb-10 max-w-2xl mx-auto">
            Cantieri, finanza, marketing, HR, AI — integrati e sincronizzati in tempo reale. Nessuna app
            separata, nessun dato perso.
          </p>
          {/* Stats inline */}
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {[
              { value: "25+", label: "Funzionalita" },
              { value: "Zero", label: "integrazioni esterne richieste" },
              { value: "48h", label: "Setup completo" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center">
                <span className="text-3xl font-extrabold text-white">{stat.value}</span>
                <span className="text-xs text-white/50 mt-0.5">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STICKY TABS ──────────────────────────────────────────────────── */}
      <div
        ref={tabsRef}
        className="sticky top-9 z-40 bg-white border-b border-gray-200 shadow-sm"
      >
        <div className="max-w-7xl mx-auto px-4 overflow-x-auto flex items-center gap-1 scrollbar-hide">
          {/* "Tutti" tab */}
          <button
            onClick={() => setActiveTab("tutti")}
            className="flex-shrink-0 px-4 py-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap"
            style={{
              borderBottomColor: activeTab === "tutti" ? "#1a2744" : "transparent",
              color: activeTab === "tutti" ? "#1a2744" : "#1a274488",
            }}
          >
            Tutti
          </button>

          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-shrink-0 px-4 py-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap"
              style={{
                borderBottomColor: activeTab === tab.id ? tab.color : "transparent",
                color: activeTab === tab.id ? tab.color : "#1a274488",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── PANELS ───────────────────────────────────────────────────────── */}
      {/* "Tutti" overview panel */}
      <div className={visiblePanel === "tutti" ? "block" : "hidden"}>
        <section className="py-16 px-6" style={{ background: "#f7f9fc" }}>
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-[#1a2744] mb-4">
                Esplora ogni area della piattaforma
              </h2>
              <p className="text-[#1a2744]/55 max-w-xl mx-auto">
                Clicca su una categoria per scoprire in dettaglio le funzionalita, i mockup e gli impatti reali sul tuo business.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="text-left rounded-2xl p-6 border transition-all hover:shadow-md hover:-translate-y-0.5 group"
                  style={{
                    background: tab.bgLight,
                    borderColor: tab.borderColor,
                  }}
                >
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase border mb-4"
                    style={{ color: tab.color, borderColor: tab.borderColor, background: "white" }}
                  >
                    <LayoutGrid className="w-3 h-3" />
                    {tab.label}
                  </div>
                  <h3 className="font-bold text-[#1a2744] text-base mb-2 leading-snug">{tab.title}</h3>
                  <p className="text-xs text-[#1a2744]/55 leading-relaxed mb-4">{tab.desc}</p>
                  <div
                    className="inline-flex items-center gap-1 text-xs font-bold group-hover:gap-2 transition-all"
                    style={{ color: tab.color }}
                  >
                    Scopri le funzionalita
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Category panels */}
      {TABS.map((tab) => (
        <div key={tab.id} className={visiblePanel === tab.id ? "block" : "hidden"}>
          <section
            className="py-16 px-6 transition-all"
            style={{ background: tab.bgLight }}
          >
            <div className="max-w-6xl mx-auto">
              {/* Header */}
              <div className="mb-10">
                <div
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase border mb-4"
                  style={{
                    color: tab.color,
                    borderColor: tab.borderColor,
                    background: "white",
                  }}
                >
                  <LayoutGrid className="w-3 h-3" />
                  {tab.label}
                </div>
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#1a2744] mb-3 leading-snug max-w-2xl">
                  {tab.title}
                </h2>
                <p className="text-[#1a2744]/60 max-w-xl leading-relaxed">{tab.desc}</p>
              </div>

              {/* 2-col layout */}
              <div className="grid lg:grid-cols-2 gap-10 items-start">
                {/* Left: feature list */}
                <div>
                  <ul className="space-y-3 mb-8">
                    {tab.features.map((feat, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 bg-white rounded-xl px-4 py-3.5 border border-white/80 shadow-sm"
                      >
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: tab.bgLight, color: tab.color, border: `1px solid ${tab.borderColor}` }}
                        >
                          {feat.icon}
                        </span>
                        <div>
                          <p className="font-semibold text-[#1a2744] text-sm">{feat.name}</p>
                          <p className="text-xs text-[#1a2744]/55 mt-0.5">{feat.desc}</p>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Impact badge */}
                  <div
                    className="rounded-xl px-5 py-4 border-l-4 flex items-center gap-3"
                    style={{
                      background: "white",
                      borderLeftColor: tab.color,
                      boxShadow: `0 2px 12px ${tab.borderColor}`,
                    }}
                  >
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: tab.color }} />
                    <p className="font-bold text-[#1a2744] text-sm">{tab.impact}</p>
                  </div>
                </div>

                {/* Right: mockup */}
                <div className="lg:sticky lg:top-28">
                  {tab.mockup}

                  <div className="mt-5 flex flex-col sm:flex-row gap-3">
                    <Link
                      to="/demo"
                      className="flex-1 text-center px-5 py-3 rounded-full text-white font-bold text-sm transition-all hover:opacity-90 hover:scale-105 shadow-md"
                      style={{
                        background: tab.color,
                        boxShadow: `0 6px 20px ${tab.borderColor}`,
                      }}
                    >
                      Inizia la Demo Gratuita →
                    </Link>
                    <a
                      href="mailto:info@ediliziaincloud.com"
                      className="flex-1 text-center px-5 py-3 rounded-full font-bold text-sm transition-all hover:opacity-80 border"
                      style={{
                        color: tab.color,
                        borderColor: tab.borderColor,
                        background: "white",
                      }}
                    >
                      Parla con noi
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      ))}

      {/* ── ALL MODULES GRID ─────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-[#1a2744] mb-3">
              Tutti i moduli inclusi, senza costi aggiuntivi
            </h2>
            <p className="text-[#1a2744]/55 max-w-xl mx-auto text-sm leading-relaxed">
              Non paghi moduli separati. Non ci sono add-on nascosti. Tutto incluso dal primo giorno, qualunque piano tu scelga.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-10">
            {ALL_MODULES.map((mod, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-xl px-4 py-3 border border-gray-100 text-xs font-semibold text-[#1a2744]/70 hover:border-[#0fa68c]/30 hover:bg-[#0fa68c]/05 transition-colors"
                style={{ background: "#f7f9fc" }}
              >
                <span style={{ color: "#0fa68c" }}>{mod.icon}</span>
                <span className="leading-tight">{mod.name}</span>
              </div>
            ))}
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {[
              "Aggiornamenti mensili gratuiti",
              "Nessun costo aggiuntivo per moduli",
              "Setup in 48 ore",
              "Supporto dedicato",
            ].map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border"
                style={{
                  color: "#0fa68c",
                  borderColor: "rgba(15,166,140,0.3)",
                  background: "rgba(15,166,140,0.07)",
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {badge}
              </span>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/demo"
              className="inline-block px-8 py-4 rounded-full text-white font-bold text-base transition-all hover:opacity-90 hover:scale-105 shadow-lg text-center"
              style={{ background: "#0fa68c", boxShadow: "0 8px 30px rgba(15,166,140,0.3)" }}
            >
              Inizia la Demo Gratuita →
            </Link>
            <a
              href="mailto:info@ediliziaincloud.com"
              className="inline-block px-8 py-4 rounded-full font-bold text-base transition-all hover:opacity-80 border border-[#1a2744]/20 text-[#1a2744] text-center"
            >
              Parla con noi
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
