import { useState, useEffect, useRef } from "react";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
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
  ArrowRight,
  Sparkles,
  HardHat,
  Banknote,
  Megaphone,
  UserCheck,
  FolderOpen,
  BrainCircuit,
  HandshakeIcon,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FeatureItem {
  icon: React.ReactNode;
  name: string;
  desc: string;
}

interface TabData {
  id: string;
  label: string;
  tabIcon: React.ReactNode;
  color: string;
  bgLight: string;
  borderColor: string;
  title: string;
  titleHighlight: string;
  desc: string;
  features: FeatureItem[];
  mockup: React.ReactNode;
  impact: string;
  impactNumber: string;
}

// ─── Mockups (app-window style) ──────────────────────────────────────────────

const MockupCantieri = () => (
  <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
    <div className="bg-[#1E3A5F] px-4 py-3 flex items-center gap-2">
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
      </div>
      <span className="text-white/60 text-[11px] ml-2 font-mono">Commessa #2024-047</span>
      <span className="ml-auto text-[10px] bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full font-semibold">In Corso</span>
    </div>
    <div className="p-4">
      <div className="mb-4">
        <p className="font-bold text-gray-900 text-sm">Ristrutturazione Villa Bianchi</p>
        <p className="text-xs text-gray-400 mt-0.5">Via Roma 12, Milano</p>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { l: "Valore", v: "€ 148.500" },
          { l: "Costi", v: "€ 91.200" },
          { l: "Margine", v: "38.6%", green: true },
        ].map((s) => (
          <div key={s.l} className="bg-gray-50 rounded-lg p-2.5 text-center border border-gray-100">
            <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1">{s.l}</p>
            <p className={`font-bold text-sm ${s.green ? "text-green-600" : "text-gray-800"}`}>{s.v}</p>
          </div>
        ))}
      </div>
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Avanzamento lavori</span>
          <span className="font-bold text-[#1E3A5F]">78%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#F97415] rounded-full" style={{ width: "78%" }} />
        </div>
      </div>
      <div className="space-y-1.5 mb-3">
        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Ultime voci di costo</p>
        {[
          { label: "Manodopera settimana 12", val: "€ 4.200" },
          { label: "Materiali idraulici", val: "€ 1.890" },
          { label: "Noleggio ponteggio", val: "€ 680" },
        ].map((row) => (
          <div key={row.label} className="flex justify-between text-xs py-1 border-b border-gray-50">
            <span className="text-gray-600">• {row.label}</span>
            <span className="font-semibold text-gray-800">{row.val}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <span className="text-[11px] text-amber-700">Costi materiali +12% vs preventivo</span>
      </div>
    </div>
  </div>
);

const MockupFinanza = () => (
  <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
    <div className="bg-[#1E3A5F] px-4 py-3 flex items-center gap-2">
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
      </div>
      <span className="text-white/60 text-[11px] ml-2 font-mono">Previsionale Cassa — 90 giorni</span>
    </div>
    <div className="p-4">
      <div className="bg-gradient-to-r from-[#1E3A5F] to-[#2a4f80] rounded-xl p-4 mb-4 text-white">
        <p className="text-xs text-white/60 mb-1">Saldo attuale</p>
        <p className="text-3xl font-black text-[#F97415]">€ 87.420</p>
      </div>
      <div className="flex items-end gap-2 mb-4" style={{ height: "80px" }}>
        {[
          { m: "Feb", h: 55, color: "#1E3A5F" },
          { m: "Mar", h: 80, color: "#1E3A5F" },
          { m: "Apr", h: 42, color: "#F97415" },
        ].map((b) => (
          <div key={b.m} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <div className="w-full rounded-t-md" style={{ height: `${b.h}%`, backgroundColor: b.color, opacity: 0.85 }} />
            <span className="text-[10px] font-medium text-gray-400">{b.m}</span>
          </div>
        ))}
      </div>
      <div className="space-y-2 mb-3">
        {[
          { m: "Feb", inc: "+€ 42.800", exp: null, note: "3 incassi previsti" },
          { m: "Mar", inc: "+€ 68.500", exp: "−€ 23.400", note: "5 incassi · 4 pagamenti" },
          { m: "Apr", inc: "+€ 31.000", exp: "−€ 18.900", note: "2 incassi · 3 pagamenti" },
        ].map((r) => (
          <div key={r.m} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-xs border border-gray-100">
            <span className="font-bold text-gray-700 w-7">{r.m}</span>
            <span className="text-green-600 font-semibold">{r.inc}</span>
            {r.exp && <span className="text-red-400">{r.exp}</span>}
            <span className="ml-auto text-gray-400 text-[9px] hidden sm:block">{r.note}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <span className="text-[11px] text-amber-700">Scadenza Brico SpA: <strong>€ 8.400</strong> il 15/03</span>
      </div>
    </div>
  </div>
);

const MockupMarketing = () => (
  <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
    <div className="bg-[#1E3A5F] px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
        </div>
        <span className="text-white/60 text-[11px] ml-2 font-mono">Pipeline Vendite Q1 2024</span>
      </div>
      <span className="text-[10px] bg-[#F97415]/20 text-[#F97415] px-2 py-0.5 rounded-full font-bold">€ 312k</span>
    </div>
    <div className="p-3 grid grid-cols-2 gap-2">
      {[
        { label: "Lead", count: 8, color: "bg-blue-50 border-blue-100", tc: "text-blue-700", items: ["Cond. Via Petrarca (12k)", "Imm. Centrale (28k)", "+3 altri..."] },
        { label: "Trattativa", count: 5, color: "bg-amber-50 border-amber-100", tc: "text-amber-700", items: ["F.lli Esposito (85k)", "Costr. Mancini (51k)", "+2 altri..."] },
        { label: "Proposta", count: 3, color: "bg-purple-50 border-purple-100", tc: "text-purple-700", items: ["Villa Verde (34k)", "+ Aggiungi"] },
        { label: "Chiuso ✓", count: 12, color: "bg-green-50 border-green-100", tc: "text-green-700", items: ["✓ Rossi € 42.800", "✓ Cond. € 65.000", "✓ +10 altri..."] },
      ].map((col) => (
        <div key={col.label} className={`rounded-xl border p-2.5 ${col.color}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase">{col.label}</span>
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white/80 ${col.tc}`}>{col.count}</span>
          </div>
          {col.items.map((item, i) => (
            <div key={i} className="text-[10px] text-gray-600 bg-white/70 rounded px-2 py-1 mb-1 truncate border border-white/50">{item}</div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

const MockupHR = () => (
  <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
    <div className="bg-[#1E3A5F] px-4 py-3 flex items-center gap-2">
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
      </div>
      <span className="text-white/60 text-[11px] ml-2 font-mono">Personale — Questa Settimana</span>
    </div>
    <div className="p-4">
      <div className="mb-3">
        <div className="grid grid-cols-4 gap-1 text-[9px] text-gray-400 uppercase tracking-wide px-1 mb-2">
          <span>Nome</span><span>Cantiere</span><span className="text-right">Ore</span><span className="text-right">€</span>
        </div>
        {[
          { n: "Mario Bianchi", c: "Villa Rossi (MI)", h: "38h", e: "€ 836" },
          { n: "Giuseppe Greco", c: "Villa Rossi (MI)", h: "40h", e: "€ 760" },
          { n: "Luca Ferrari", c: "Uff. Centrale", h: "32h", e: "€ 800" },
          { n: "Ahmed Malik", c: "Villa Rossi (MI)", h: "40h", e: "€ 720" },
        ].map((row, i) => (
          <div key={i} className="grid grid-cols-4 gap-1 bg-gray-50 rounded-lg px-2 py-2 mb-1 text-xs border border-gray-100">
            <span className="font-semibold text-gray-800 truncate text-[11px]">{row.n}</span>
            <span className="text-gray-500 truncate text-[10px]">{row.c}</span>
            <span className="text-right text-gray-700">{row.h}</span>
            <span className="text-right font-bold text-[#1E3A5F]">{row.e}</span>
          </div>
        ))}
      </div>
      <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-3 mt-2">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-500">Costo totale settimana</span>
          <span className="font-black text-[#1E3A5F] text-sm">€ 4.116</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-[#F97415] rounded-full" style={{ width: "89%" }} />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>Attribuito cantieri: 89%</span>
          <span>Non attribuito: 11%</span>
        </div>
      </div>
    </div>
  </div>
);

const MockupDocumenti = () => (
  <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
    <div className="bg-[#1E3A5F] px-4 py-3 flex items-center gap-2">
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
      </div>
      <span className="text-white/60 text-[11px] ml-2 font-mono">Documenti Fiscali — Marzo 2024</span>
    </div>
    <div className="p-4">
      <div className="space-y-2 mb-4">
        {[
          { id: "FT-2024-0089", cl: "Rossi Mario", amt: "€ 8.400", st: "✓ Inviata SDI", sc: "text-green-600 bg-green-50 border-green-100" },
          { id: "FT-2024-0088", cl: "Cond. Petrarca", amt: "€ 15.200", st: "✓ Pagata", sc: "text-green-700 bg-green-100 border-green-200" },
          { id: "FT-2024-0087", cl: "Imm. Centrale", amt: "€ 6.800", st: "⏳ In attesa", sc: "text-amber-600 bg-amber-50 border-amber-100" },
          { id: "DDT-0234", cl: "Brico SpA", amt: "—", st: "✓ Ricevuto", sc: "text-blue-600 bg-blue-50 border-blue-100" },
        ].map((row) => (
          <div key={row.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
            <div>
              <p className="text-xs font-bold text-gray-700">{row.id}</p>
              <p className="text-[10px] text-gray-400">{row.cl}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-gray-800">{row.amt}</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${row.sc}`}>{row.st}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#1E3A5F]/5 rounded-xl p-3 text-center border border-[#1E3A5F]/10">
          <p className="text-[9px] text-gray-500 uppercase tracking-wide">Fatturato mese</p>
          <p className="font-black text-[#1E3A5F] text-sm">€ 68.400</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
          <p className="text-[9px] text-amber-500 uppercase tracking-wide">Da incassare</p>
          <p className="font-black text-amber-600 text-sm">€ 21.600</p>
        </div>
      </div>
    </div>
  </div>
);

const MockupAI = () => (
  <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
    <div className="bg-[#1E3A5F] px-4 py-3 flex items-center gap-2">
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
      </div>
      <div className="flex items-center gap-1.5 ml-2">
        <Bot className="w-3.5 h-3.5 text-[#F97415]" />
        <span className="text-white/80 text-[11px] font-mono">Agente "Controllo Margini"</span>
      </div>
      <span className="ml-auto text-[10px] text-white/40">09:41</span>
    </div>
    <div className="p-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-relaxed">
            <strong>Alert:</strong> Villa Bianchi ha superato il budget materiali del 14%. Margine stimato: <strong>28%</strong> vs <strong>38%</strong> preventivato.
            <span className="block mt-1 text-amber-600 font-semibold">→ Revisione fornitore consigliata.</span>
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1">Flow attivi</p>
          <p className="text-2xl font-black text-[#1E3A5F]">7</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1">Azioni oggi</p>
          <p className="text-2xl font-black text-[#F97415]">23</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {[
          { l: "Follow-up email automatici", n: 8 },
          { l: "Reminder scadenze inviati", n: 5 },
          { l: "Aggiornamenti stato cantieri", n: 10 },
        ].map((item) => (
          <div key={item.l} className="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
            <span className="text-gray-600">• {item.l}</span>
            <span className="font-bold text-gray-800">{item.n}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const MockupClienti = () => (
  <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
    <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Globe className="w-3 h-3 text-gray-400 mr-1" />
        <span className="text-gray-400 text-[10px]">clienti.ediliziaincloud.com</span>
      </div>
    </div>
    <div className="bg-[#1E3A5F] px-4 py-3">
      <p className="text-white font-bold text-sm">Portale Cliente — Famiglia Rossi</p>
      <p className="text-white/50 text-xs">Ristrutturazione Villa (Via Roma 12)</p>
    </div>
    <div className="p-4">
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Avanzamento lavori</span>
          <span className="font-bold text-[#1E3A5F]">78%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#F97415] rounded-full" style={{ width: "78%" }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-1">Prossima fase: Pavimentazioni (stimato 15/04)</p>
      </div>
      <div className="bg-[#F97415]/10 border border-[#F97415]/30 rounded-xl p-3 mb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-gray-700">📄 SAL n.3 da approvare</p>
            <p className="text-lg font-black text-[#1E3A5F]">€ 24.800</p>
          </div>
          <button className="bg-[#F97415] text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shrink-0">
            FIRMA ORA →
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Aggiornamenti</p>
        {[
          { d: "12/03", t: "Completata posa impianto idraulico" },
          { d: "10/03", t: "Iniziata posa massetto" },
        ].map((u) => (
          <div key={u.d} className="flex gap-2 text-xs">
            <span className="text-gray-400 shrink-0">{u.d}</span>
            <span className="text-gray-600">{u.t}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── Tab data ─────────────────────────────────────────────────────────────────

const TABS: TabData[] = [
  {
    id: "cantieri",
    label: "Cantieri",
    tabIcon: <HardHat className="w-3.5 h-3.5" />,
    color: "#3b82f6",
    bgLight: "rgba(59,130,246,0.05)",
    borderColor: "rgba(59,130,246,0.2)",
    title: "Controllo totale su ogni cantiere,",
    titleHighlight: "in tempo reale",
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
    impact: "Risparmio medio su reportistica cantieri",
    impactNumber: "−8h/sett",
  },
  {
    id: "finanza",
    label: "Finanza",
    tabIcon: <Banknote className="w-3.5 h-3.5" />,
    color: "#F97415",
    bgLight: "rgba(249,116,21,0.05)",
    borderColor: "rgba(249,116,21,0.2)",
    title: "Sai esattamente quanti soldi hai",
    titleHighlight: "e quanti ne arriveranno",
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
    impact: "Riduzione problemi di cassa in media",
    impactNumber: "−73%",
  },
  {
    id: "marketing",
    label: "Marketing",
    tabIcon: <Megaphone className="w-3.5 h-3.5" />,
    color: "#8b5cf6",
    bgLight: "rgba(139,92,246,0.05)",
    borderColor: "rgba(139,92,246,0.2)",
    title: "Acquisisci più clienti",
    titleHighlight: "e chiudi più preventivi",
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
    impact: "Tasso di chiusura preventivi con firma digitale",
    impactNumber: "+35%",
  },
  {
    id: "hr",
    label: "HR & Personale",
    tabIcon: <UserCheck className="w-3.5 h-3.5" />,
    color: "#f59e0b",
    bgLight: "rgba(245,158,11,0.05)",
    borderColor: "rgba(245,158,11,0.2)",
    title: "Il tuo team,",
    titleHighlight: "sempre sotto controllo",
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
    impact: "Ottimizzazione costi manodopera in media dopo 3 mesi",
    impactNumber: "−15%",
  },
  {
    id: "documenti",
    label: "Documenti",
    tabIcon: <FolderOpen className="w-3.5 h-3.5" />,
    color: "#3b82f6",
    bgLight: "rgba(59,130,246,0.05)",
    borderColor: "rgba(59,130,246,0.2)",
    title: "Fatturazione elettronica nativa.",
    titleHighlight: "Zero mal di testa.",
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
    impact: "Risparmio su gestione fatturazione settimanale",
    impactNumber: "−4h/sett",
  },
  {
    id: "ai",
    label: "AI & Automazioni",
    tabIcon: <BrainCircuit className="w-3.5 h-3.5" />,
    color: "#ec4899",
    bgLight: "rgba(236,72,153,0.05)",
    borderColor: "rgba(236,72,153,0.2)",
    title: "L'intelligenza artificiale",
    titleHighlight: "lavora per te, 24/7",
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
    impact: "Risparmio su attività ripetitive settimanali",
    impactNumber: "−5h/sett",
  },
  {
    id: "clienti",
    label: "Clienti",
    tabIcon: <HandshakeIcon className="w-3.5 h-3.5" />,
    color: "#F97415",
    bgLight: "rgba(249,116,21,0.05)",
    borderColor: "rgba(249,116,21,0.2)",
    title: "I tuoi clienti seguono",
    titleHighlight: "il cantiere in tempo reale",
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
    impact: "Riduzione chiamate di aggiornamento dai clienti",
    impactNumber: "−60%",
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
    title: "26 Moduli + AI — Funzionalità Gestionale Edilizia | Edilizia in Cloud",
    description: "Tutti i 26 moduli del gestionale edilizia con AI: cantieri in tempo reale, margini, CRM, WhatsApp, fatturazione elettronica SDI, HR presenze, previsione liquidità e dashboard intelligente.",
    canonical: "/funzionalita",
    keywords: "funzionalità gestionale edilizia, moduli software edilizia, gestione cantieri real-time, AI dashboard edilizia, CRM imprese edili, WhatsApp marketing edilizia, fatturazione elettronica SDI edilizia, HR presenze cantiere software, previsione liquidità impresa edile, software margini commesse",
  });

  useEffect(() => {
    setVisiblePanel(activeTab);
  }, [activeTab]);

  const activeCategoryData = TABS.find((t) => t.id === activeTab);
  void activeCategoryData;

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd id="jsonld-breadcrumb-funzionalita" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://ediliziaincloud.com/" },
          { "@type": "ListItem", "position": 2, "name": "Funzionalità", "item": "https://ediliziaincloud.com/funzionalita" }
        ]
      }} />
      {/* HowTo rimosso: rich results eliminati da Google a settembre 2023 */}
      <JsonLd id="jsonld-webpage-funzionalita" data={{
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": "https://ediliziaincloud.com/funzionalita",
        "name": "Funzionalità Gestionale Edilizia — 26 Moduli + AI",
        "description": "Tutti i moduli del gestionale edilizia con AI: cantieri, margini, CRM, WhatsApp, fatturazione SDI, HR, previsione liquidità. Scopri tutto ciò che puoi fare con Edilizia in Cloud.",
        "url": "https://ediliziaincloud.com/funzionalita",
        "inLanguage": "it",
        "isPartOf": { "@id": "https://ediliziaincloud.com/#website" },
        "about": { "@id": "https://ediliziaincloud.com/#software" },
        "publisher": { "@id": "https://ediliziaincloud.com/#organization" }
      }} />

      <LandingNavbar />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="pt-36 pb-20 px-6 bg-[#1E3A5F] relative overflow-hidden">
        <div
          className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle, #F97415 0%, transparent 70%)", transform: "translate(30%, -30%)" }}
        />
        <div
          className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-5 pointer-events-none"
          style={{ background: "radial-gradient(circle, white 0%, transparent 70%)", transform: "translate(-30%, 30%)" }}
        />

        <div className="max-w-6xl mx-auto relative">
          <div className="max-w-3xl">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-6 border"
              style={{ background: "rgba(249,116,21,0.15)", color: "#F97415", borderColor: "rgba(249,116,21,0.3)" }}
            >
              <Sparkles className="w-3 h-3" />
              PIATTAFORMA ALL-IN-ONE
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
              Una piattaforma.<br />
              <span style={{ color: "#F97415" }}>Tutto quello che serve.</span>
            </h1>

            <p className="text-lg md:text-xl text-white/65 leading-relaxed mb-10 max-w-2xl">
              Cantieri, finanza, marketing, HR, AI — integrati e sincronizzati in tempo reale.
              Nessuna app separata, nessun dato perso.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
              {[
                { value: "26+", label: "Funzionalità" },
                { value: "Zero", label: "integrazioni esterne" },
                { value: "48h", label: "Setup completo" },
                { value: "100%", label: "Made for edilizia" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl px-4 py-3 border"
                  style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.15)" }}
                >
                  <p className="text-2xl font-extrabold text-[#F97415]">{stat.value}</p>
                  <p className="text-xs text-white/50 mt-0.5 leading-tight">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STICKY TABS ───────────────────────────────────────────────────── */}
      <div
        ref={tabsRef}
        className="sticky top-9 z-40 bg-white border-b border-gray-200 shadow-sm"
      >
        <div className="max-w-7xl mx-auto px-4 overflow-x-auto flex items-center gap-0 scrollbar-hide">
          <button
            onClick={() => setActiveTab("tutti")}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap"
            style={{
              borderBottomColor: activeTab === "tutti" ? "#1E3A5F" : "transparent",
              color: activeTab === "tutti" ? "#1E3A5F" : "#11111188",
            }}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Tutti
          </button>

          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap"
              style={{
                borderBottomColor: activeTab === tab.id ? tab.color : "transparent",
                color: activeTab === tab.id ? tab.color : "#11111188",
              }}
            >
              <span style={{ color: activeTab === tab.id ? tab.color : "#11111166" }}>
                {tab.tabIcon}
              </span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── "TUTTI" PANEL ─────────────────────────────────────────────────── */}
      <div className={visiblePanel === "tutti" ? "block" : "hidden"}>
        <section className="py-16 px-6 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-[#111111] mb-3">
                Esplora ogni area della piattaforma
              </h2>
              <p className="text-[#111111]/55 max-w-lg">
                Clicca su una categoria per scoprire le funzionalità, i mockup e gli impatti reali sul tuo business.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="text-left rounded-2xl p-6 border transition-all hover:shadow-lg hover:-translate-y-0.5 group bg-white"
                  style={{ borderColor: tab.borderColor }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: tab.bgLight, border: `1px solid ${tab.borderColor}`, color: tab.color }}
                    >
                      {tab.tabIcon}
                    </div>
                    <div>
                      <div className="font-bold text-[#111111] text-sm">{tab.label}</div>
                      <div className="font-black text-xs" style={{ color: tab.color }}>{tab.impactNumber}</div>
                    </div>
                  </div>
                  <h3 className="font-bold text-[#111111] text-base mb-2 leading-snug">
                    {tab.title} <span style={{ color: tab.color }}>{tab.titleHighlight}</span>
                  </h3>
                  <p className="text-xs text-[#111111]/55 leading-relaxed mb-4">{tab.desc}</p>
                  <div
                    className="inline-flex items-center gap-1 text-xs font-bold group-hover:gap-2 transition-all"
                    style={{ color: tab.color }}
                  >
                    Scopri le funzionalità
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ── CATEGORY PANELS ───────────────────────────────────────────────── */}
      {TABS.map((tab) => (
        <div key={tab.id} className={visiblePanel === tab.id ? "block" : "hidden"}>
          <section className="py-16 px-6" style={{ background: tab.bgLight }}>
            <div className="max-w-6xl mx-auto">

              {/* Impact badge + header */}
              <div className="mb-10">
                <div
                  className="inline-flex items-center gap-2.5 rounded-full px-4 py-2 border mb-5"
                  style={{ background: "white", borderColor: tab.borderColor }}
                >
                  <span className="text-xl font-black" style={{ color: tab.color }}>{tab.impactNumber}</span>
                  <span className="text-sm text-[#111111]/70">{tab.impact}</span>
                </div>

                <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#111111] mb-3 leading-snug max-w-2xl">
                  {tab.title}{" "}
                  <span style={{ color: tab.color }}>{tab.titleHighlight}</span>
                </h2>
                <p className="text-[#111111]/60 max-w-xl leading-relaxed">{tab.desc}</p>
              </div>

              {/* 2-col layout */}
              <div className="grid lg:grid-cols-2 gap-10 items-start">

                {/* Left: feature list */}
                <div>
                  <ul className="space-y-2.5 mb-8">
                    {tab.features.map((feat, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 bg-white rounded-xl px-4 py-3.5 border shadow-sm hover:shadow-md transition-shadow"
                        style={{ borderColor: "rgba(0,0,0,0.07)" }}
                      >
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: tab.bgLight, color: tab.color, border: `1px solid ${tab.borderColor}` }}
                        >
                          {feat.icon}
                        </span>
                        <div>
                          <p className="font-semibold text-[#111111] text-sm">{feat.name}</p>
                          <p className="text-xs text-[#111111]/55 mt-0.5 leading-relaxed">{feat.desc}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Right: mockup + CTAs */}
                <div className="lg:sticky lg:top-28">
                  {tab.mockup}

                  <div className="mt-5 flex flex-col sm:flex-row gap-3">
                    <Link
                      to="/demo"
                      className="flex-1 text-center px-5 py-3.5 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 hover:scale-[1.02] shadow-md flex items-center justify-center gap-2"
                      style={{
                        background: tab.color,
                        boxShadow: `0 6px 20px ${tab.borderColor}`,
                      }}
                    >
                      Inizia la Demo Gratuita
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <a
                      href="mailto:info@ediliziaincloud.com"
                      className="flex-1 text-center px-5 py-3.5 rounded-xl font-bold text-sm transition-all hover:opacity-80 border bg-white"
                      style={{ color: tab.color, borderColor: tab.borderColor }}
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

      {/* ── ALL MODULES GRID ──────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#1E3A5F]">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              Tutti i moduli inclusi,{" "}
              <span className="text-[#F97415]">senza costi aggiuntivi</span>
            </h2>
            <p className="text-white/55 max-w-xl text-sm leading-relaxed">
              Non paghi moduli separati. Non ci sono add-on nascosti. Tutto incluso dal primo giorno, qualunque piano tu scelga.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mb-10">
            {ALL_MODULES.map((mod, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-xl px-4 py-3 border border-white/10 text-xs font-semibold text-white/70 hover:border-[#F97415]/40 hover:bg-white/5 transition-all"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <span style={{ color: "#F97415" }}>{mod.icon}</span>
                <span className="leading-tight">{mod.name}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 mb-10">
            {[
              { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "Aggiornamenti mensili gratuiti" },
              { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "Nessun costo aggiuntivo per moduli" },
              { icon: <Zap className="w-3.5 h-3.5" />, label: "Setup in 48 ore" },
              { icon: <Headphones className="w-3.5 h-3.5" />, label: "Supporto dedicato" },
            ].map((badge) => (
              <span
                key={badge.label}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border"
                style={{ color: "#F97415", borderColor: "rgba(249,116,21,0.3)", background: "rgba(249,116,21,0.1)" }}
              >
                {badge.icon}
                {badge.label}
              </span>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              to="/demo"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-white font-bold text-base transition-all hover:opacity-90 hover:scale-105 shadow-lg"
              style={{ background: "#F97415", boxShadow: "0 8px 30px rgba(249,116,21,0.4)" }}
            >
              Inizia la Demo Gratuita
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="mailto:info@ediliziaincloud.com"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl font-bold text-base transition-all border text-white/80 hover:text-white hover:border-white/40"
              style={{ borderColor: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)" }}
            >
              Parla con noi
            </a>
          </div>
        </div>
      </section>

      {/* ── GUIDE DETTAGLIATE ── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-extrabold text-[#111111] mb-3">
              Esplora ogni funzionalità nel dettaglio
            </h2>
            <p className="text-[#111111]/60 text-sm max-w-xl mx-auto">
              Guide approfondite su ciascun modulo: come funziona, cosa risolve e quanto puoi risparmiare.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {[
              {
                href: "/funzionalita/gestione-cantieri",
                title: "Gestione Cantieri",
                desc: "Monitora avanzamento lavori, squadre, materiali e costi per ogni commessa in tempo reale.",
                badge: "Più usato",
              },
              {
                href: "/funzionalita/preventivi-edilizia",
                title: "Preventivi Professionali",
                desc: "Preventivi con computo metrico, prezziari aggiornati e firma digitale integrata.",
                badge: "",
              },
              {
                href: "/funzionalita/fatturazione-elettronica",
                title: "Fatturazione Elettronica",
                desc: "SDI integrato, split payment, reverse charge e archiviazione fiscale automatica.",
                badge: "",
              },
              {
                href: "/funzionalita/margini-cantiere",
                title: "Controllo Margini",
                desc: "Confronta preventivo vs consuntivo in tempo reale e identifica dove perdi margine.",
                badge: "",
              },
              {
                href: "/funzionalita/hr-personale",
                title: "HR & Personale",
                desc: "Timbratura GPS da cantiere, Cassa Edile, CCNL edilizia e export per buste paga.",
                badge: "Nuovo",
              },
              {
                href: "/funzionalita/gestione-subappalti",
                title: "Gestione Subappalti",
                desc: "Registro subappaltatori, DURC alert automatici, contratti digitali e responsabilità solidale.",
                badge: "Nuovo",
              },
            ].map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="group flex flex-col gap-3 rounded-2xl border border-gray-200 hover:border-[#F97415]/40 p-6 transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-[#111111] text-base group-hover:text-[#F97415] transition-colors">
                    {item.title}
                  </h3>
                  {item.badge && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#F97415]/10 text-[#F97415]">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#111111]/60 leading-relaxed">{item.desc}</p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#F97415] mt-auto">
                  Scopri di più <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Guide del blog correlate ────────────────────────────────────── */}
      <section className="py-14 bg-gray-50 border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-xl font-extrabold text-[#111111] mb-2">Guide pratiche per imprese edili</h2>
          <p className="text-gray-500 text-sm mb-8">Approfondisci con le nostre guide gratuite</p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { slug: "sal-cantiere-come-funziona", label: "SAL Cantiere: Cos'è e Come Funziona" },
              { slug: "computo-metrico-estimativo-guida", label: "Computo Metrico: Guida Pratica" },
              { slug: "analisi-margini-imprese-edili", label: "Analisi dei Margini per Imprese Edili" },
              { slug: "come-fare-preventivo-edilizia", label: "Come Fare un Preventivo Professionale" },
              { slug: "durc-edilizia-guida-completa", label: "DURC in Edilizia: Guida Completa" },
              { slug: "appalti-pubblici-edilizia-guida", label: "Appalti Pubblici: Come Partecipare" },
            ].map((post) => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:border-[#F97415]/40 hover:bg-[#F97415]/5 transition-all group"
              >
                <span className="flex-1 text-sm font-semibold text-[#111111] group-hover:text-[#F97415] transition-colors leading-snug">
                  {post.label}
                </span>
                <svg className="w-4 h-4 text-[#F97415] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
