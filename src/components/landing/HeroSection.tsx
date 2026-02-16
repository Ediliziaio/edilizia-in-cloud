import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Hammer, HardHat, Ruler, Warehouse, Wrench, Building2, Blocks, ConeIcon, LayoutDashboard, ShoppingBag, Package, Calendar, Users, Settings, TrendingUp, Euro, AlertCircle, CheckCircle2, Star, Headphones } from "lucide-react";

const floatingIcons = [
  { Icon: HardHat, top: "10%", left: "5%", size: 48, delay: "0s", anim: "animate-float" },
  { Icon: Hammer, top: "20%", right: "8%", size: 40, delay: "1s", anim: "animate-float-slow" },
  { Icon: Ruler, top: "60%", left: "10%", size: 36, delay: "2s", anim: "animate-float" },
  { Icon: Warehouse, top: "70%", right: "12%", size: 44, delay: "0.5s", anim: "animate-float-slow" },
  { Icon: Wrench, top: "40%", left: "3%", size: 32, delay: "3s", anim: "animate-float" },
  { Icon: Building2, top: "15%", left: "80%", size: 52, delay: "1.5s", anim: "animate-float-slow" },
  { Icon: Blocks, top: "80%", left: "25%", size: 38, delay: "2.5s", anim: "animate-float" },
  { Icon: ConeIcon, top: "50%", right: "5%", size: 34, delay: "0.8s", anim: "animate-float-slow" },
];

const sidebarItems = [
  { Icon: LayoutDashboard, label: "Dashboard", active: true },
  { Icon: ShoppingBag, label: "Ordini" },
  { Icon: Users, label: "Clienti" },
  { Icon: Package, label: "Magazzino" },
  { Icon: Calendar, label: "Calendario" },
  { Icon: Settings, label: "Impostazioni" },
];

const statsData = [
  { label: "Fatturato", value: "€ 284.500", icon: Euro, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  { label: "Margine", value: "€ 78.200", icon: TrendingUp, color: "#0fa68c", bg: "rgba(15,166,140,0.15)" },
  { label: "Incassato", value: "€ 196.000", icon: CheckCircle2, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  { label: "Da Incassare", value: "€ 88.500", icon: AlertCircle, color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
];

const ordersData = [
  { code: "ORD-0147", client: "Rossi Mario", amount: "€ 42.800", status: "In Lavorazione", statusColor: "#3b82f6" },
  { code: "ORD-0146", client: "Bianchi & Figli", amount: "€ 28.350", status: "Completato", statusColor: "#22c55e" },
  { code: "ORD-0145", client: "Condominio Via Roma", amount: "€ 65.000", status: "In Attesa", statusColor: "#f59e0b" },
  { code: "ORD-0144", client: "Verdi Costruzioni", amount: "€ 18.900", status: "Sopralluogo", statusColor: "#8b5cf6" },
];

const chartBars = [
  { month: "Set", h: 45 },
  { month: "Ott", h: 62 },
  { month: "Nov", h: 38 },
  { month: "Dic", h: 70 },
  { month: "Gen", h: 55 },
  { month: "Feb", h: 80 },
];

function DashboardMockup({ isVisible }: { isVisible: boolean }) {
  return (
    <div
      className={`relative mt-10 mb-8 max-w-4xl mx-auto transition-all duration-700 delay-200 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
      }`}
    >
      {/* Glow effect behind mockup */}
      <div className="absolute -inset-8 bg-[#0fa68c]/15 rounded-full blur-[80px] animate-pulse-glow pointer-events-none" />
      <div
        className="relative rounded-2xl border border-white/15 shadow-2xl shadow-black/40 overflow-hidden"
        style={{ transform: "perspective(1200px) rotateX(4deg)" }}
      >
        <div className="flex bg-[#0f1a2e]">
          {/* Sidebar */}
          <div className="w-14 md:w-16 bg-[#0a1222] border-r border-white/5 flex flex-col items-center py-3 gap-1 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[#0fa68c] flex items-center justify-center mb-3">
              <Building2 size={14} className="text-white" />
            </div>
            {sidebarItems.map((item, i) => (
              <div
                key={i}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  item.active ? "bg-[#0fa68c]/20 text-[#0fa68c]" : "text-white/25 hover:text-white/40"
                }`}
              >
                <item.Icon size={16} />
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 p-3 md:p-4 min-w-0">
            {/* Header bar */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-white/40 text-[9px] md:text-[10px]">Benvenuto</p>
                <p className="text-white text-xs md:text-sm font-semibold">Dashboard</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#0fa68c]/20 flex items-center justify-center">
                  <span className="text-[#0fa68c] text-[8px] font-bold">F</span>
                </div>
              </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {statsData.map((stat, i) => (
                <div key={i} className="bg-white/[0.04] rounded-lg p-2 md:p-2.5 border border-white/5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: stat.bg }}>
                      <stat.icon size={10} style={{ color: stat.color }} />
                    </div>
                    <span className="text-white/40 text-[8px] md:text-[9px]">{stat.label}</span>
                  </div>
                  <p className="text-white text-xs md:text-sm font-bold">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Chart + Table row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* Bar chart */}
              <div className="bg-white/[0.04] rounded-lg p-2.5 border border-white/5">
                <p className="text-white/50 text-[9px] mb-2 font-medium">Fatturato Mensile</p>
                <div className="flex items-end gap-1.5 h-16">
                  {chartBars.map((bar, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-sm"
                        style={{
                          height: `${bar.h}%`,
                          background: `linear-gradient(to top, #0fa68c, #0fa68c99)`,
                        }}
                      />
                      <span className="text-white/30 text-[7px]">{bar.month}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Orders table */}
              <div className="bg-white/[0.04] rounded-lg p-2.5 border border-white/5">
                <p className="text-white/50 text-[9px] mb-2 font-medium">Ultimi Ordini</p>
                <div className="space-y-1.5">
                  {ordersData.map((order, i) => (
                    <div key={i} className="flex items-center justify-between text-[8px] md:text-[9px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[#0fa68c] font-mono font-medium shrink-0">{order.code}</span>
                        <span className="text-white/50 truncate">{order.client}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-white/70 font-medium">{order.amount}</span>
                        <span
                          className="px-1.5 py-0.5 rounded-full text-[7px] font-medium"
                          style={{ backgroundColor: `${order.statusColor}20`, color: order.statusColor }}
                        >
                          {order.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HeroSection() {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1 });

  return (
    <section
      ref={ref}
      className="relative overflow-hidden pt-36 pb-20"
      style={{
        background: "linear-gradient(135deg, #1a2744 0%, #0f1d35 50%, #1a2744 100%)",
      }}
    >
      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      {/* Floating construction icons */}
      {floatingIcons.map(({ Icon, top, left, right, size, delay, anim }, i) => (
        <div
          key={i}
          className={`absolute opacity-[0.06] text-[#0fa68c] ${anim}`}
          style={{ top, left, right, animationDelay: delay }}
        >
          <Icon size={size} strokeWidth={1} />
        </div>
      ))}

      {/* Gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#0fa68c]/[0.06] rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#0fa68c]/[0.04] rounded-full blur-[100px]" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        {/* 1. Badge */}
        <div
          className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
        >
          <span
            className="inline-block mb-6 px-5 py-2 rounded-full border border-[#0fa68c]/40 bg-[#0fa68c]/10 text-[#0fa68c] text-xs font-semibold uppercase tracking-widest relative overflow-hidden"
          >
            <span className="absolute inset-0 animate-shimmer" style={{ backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(15,166,140,0.15) 50%, transparent 100%)", backgroundSize: "200% 100%" }} />
            <span className="relative">Il Software #1 in Italia per Imprenditori Edili</span>
          </span>
        </div>

        {/* 2. Title */}
        <h1
          className={`text-4xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight mb-2 transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Smetti di Fatturare al Buio.
          <br />
          <span className="text-[#0fa68c]">Inizia a Guadagnare con i Numeri.</span>
        </h1>

        {/* 3. Dashboard Mockup */}
        <DashboardMockup isVisible={isVisible} />

        {/* 4. Subtitle */}
        <p
          className={`text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Il primo software gestionale progettato da imprenditori edili, per imprenditori edili.
          Controlla <span className="text-white font-semibold">margini</span>, <span className="text-white font-semibold">cassa</span> e <span className="text-white font-semibold">commesse</span> in tempo reale — senza fogli Excel, senza sorprese.
        </p>

        {/* 5. CTA Buttons */}
        <div
          className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-500 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <a
            href="#cta-finale"
            onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }}
            className="px-8 py-4 rounded-full bg-[#0fa68c] text-white font-bold text-lg hover:bg-[#0d9079] hover:scale-105 transition-all duration-200 animate-pulse-glow shadow-lg shadow-[#0fa68c]/30"
          >
            Richiedi Demo Gratuita
          </a>
          <a
            href="#moduli"
            onClick={(e) => { e.preventDefault(); document.querySelector("#moduli")?.scrollIntoView({ behavior: "smooth" }); }}
            className="px-8 py-4 rounded-full border border-white/20 text-white font-semibold hover:bg-white/5 hover:border-white/40 transition-all duration-200"
          >
            Scopri le Funzionalità
          </a>
        </div>

        {/* Social Proof */}
        <div
          className={`flex flex-col sm:flex-row items-center justify-center gap-6 mt-8 transition-all duration-700 delay-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <Users size={16} className="text-[#0fa68c]" />
            <span>150+ Imprese Edili</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-white/20" />
          <div className="flex items-center gap-1.5 text-white/50 text-sm">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={14} className="text-[#0fa68c] fill-[#0fa68c]" />
            ))}
            <span className="ml-1">4.9/5 Soddisfazione</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-white/20" />
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <Headphones size={16} className="text-[#0fa68c]" />
            <span>Supporto Italiano</span>
          </div>
        </div>

        {/* Partner Logos Marquee */}
        <div
          className={`mt-10 transition-all duration-700 delay-[900ms] ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <p className="text-white/40 text-xs mb-4">Scelto da aziende che collaborano con</p>
          <div
            className="overflow-hidden"
            style={{
              maskImage: "linear-gradient(90deg, transparent 0%, black 15%, black 85%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 15%, black 85%, transparent 100%)",
            }}
          >
            <div className="flex animate-marquee whitespace-nowrap">
              {[...Array(2)].map((_, copy) => (
                <div key={copy} className="flex items-center shrink-0">
                  {["ANCE", "Confindustria Edilizia", "Cassa Edile", "Edilportale", "Federcostruzioni", "Ordine Ingegneri", "Collegio Geometri", "ANIEM"].map((name) => (
                    <span key={`${copy}-${name}`} className="mx-6 text-white/30 text-sm font-bold uppercase tracking-widest shrink-0">
                      {name}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}
