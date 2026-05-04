import {
  AlertTriangle,
  Bot,
  Building2,
  CalendarDays,
  Euro,
  FileSpreadsheet,
  Hammer,
  MessageSquare,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { motion } from "framer-motion";

const scatteredTools = [
  { label: "Excel", sub: "margini separati", icon: FileSpreadsheet },
  { label: "WhatsApp", sub: "messaggi sparsi", icon: MessageSquare },
  { label: "Cantiere", sub: "foto e ore", icon: Hammer },
];

const outcomes = [
  { label: "Vendite", value: "+24h follow-up", icon: TrendingUp },
  { label: "Margini", value: "3 commesse a rischio", icon: Euro },
  { label: "Cassa", value: "incassi da presidiare", icon: WalletCards },
];

export function HeroVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.75, ease: "easeOut", delay: 0.16 }}
      className="relative mx-auto mt-12 w-full max-w-6xl overflow-hidden rounded-md border border-white/12 bg-white/[0.08] p-3 shadow-2xl shadow-black/30 backdrop-blur-xl md:mt-14 md:p-5"
      aria-label="Visualizzazione della regia AI EdiliziaInCloud per vendite, margini, cassa e cantieri"
    >
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 22%, rgba(249,115,22,.28), transparent 26%), radial-gradient(circle at 82% 18%, rgba(59,90,133,.42), transparent 30%), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,0))",
        }}
      />
      <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-eic-orange/70 to-transparent" />

      <div className="relative grid min-h-[360px] gap-4 rounded-md border border-white/10 bg-eic-navy-90/70 p-4 md:min-h-[420px] md:grid-cols-[0.85fr_1.35fr_0.85fr] md:p-6 lg:min-h-[500px]">
        <div className="hidden flex-col justify-center gap-3 md:flex">
          <div className="mb-1 inline-flex w-fit items-center gap-2 rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-red-200">
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
            Prima
          </div>
          {scatteredTools.map((tool, index) => {
            const Icon = tool.icon;
            return (
              <motion.div
                key={tool.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.55, delay: 0.25 + index * 0.08 }}
                className="rounded-md border border-white/10 bg-white/[0.06] p-4 shadow-lg shadow-black/10"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/[0.08] text-eic-orange ring-1 ring-white/10">
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <div>
                    <p className="font-black text-white">{tool.label}</p>
                    <p className="text-xs text-white/54">{tool.sub}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="relative flex items-center justify-center py-2 md:py-0">
          <div className="absolute left-0 right-0 top-1/2 hidden h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-eic-orange/45 to-transparent md:block" />
          <div className="relative w-full max-w-xl rounded-md border border-white/14 bg-white text-eic-ink shadow-2xl shadow-black/35">
            <div className="flex items-center justify-between border-b border-eic-navy/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-eic-orange text-white shadow-lg shadow-eic-orange/25">
                  <Bot className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-eic-navy/55">Regia AI</p>
                  <p className="font-black text-eic-navy">Priorità di oggi</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Live</span>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <div className="rounded-md bg-eic-navy px-4 py-4 text-white">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/58">Margine</p>
                <p className="mt-2 text-2xl font-black">+18%</p>
                <p className="mt-1 text-xs text-white/58">da proteggere</p>
              </div>
              <div className="rounded-md bg-orange-50 px-4 py-4 text-eic-ink">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-eic-orange">Incassi</p>
                <p className="mt-2 text-2xl font-black">€84k</p>
                <p className="mt-1 text-xs text-eic-ink/55">prossimi 30g</p>
              </div>
              <div className="rounded-md bg-emerald-50 px-4 py-4 text-eic-ink">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Cantieri</p>
                <p className="mt-2 text-2xl font-black">3</p>
                <p className="mt-1 text-xs text-eic-ink/55">da controllare</p>
              </div>
            </div>

            <div className="space-y-3 px-4 pb-4">
              <div className="rounded-md border border-eic-navy/10 bg-eic-cream p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-black text-eic-navy">Commessa via Manzoni</p>
                    <p className="mt-1 text-sm text-eic-ink/60">Materiali fuori previsione, margine sotto target.</p>
                  </div>
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600">Rischio</span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-eic-navy/10 p-4">
                  <CalendarDays className="h-5 w-5 text-eic-orange" strokeWidth={1.5} />
                  <p className="mt-3 text-sm font-black">Posa domani</p>
                  <p className="text-xs text-eic-ink/55">merce e squadra confermate</p>
                </div>
                <div className="rounded-md border border-eic-navy/10 p-4">
                  <Building2 className="h-5 w-5 text-eic-orange" strokeWidth={1.5} />
                  <p className="mt-3 text-sm font-black">Offerta calda</p>
                  <p className="text-xs text-eic-ink/55">cliente ha riaperto il preventivo</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden flex-col justify-center gap-3 md:flex">
          <div className="mb-1 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100">
            <Bot className="h-3.5 w-3.5" strokeWidth={1.5} />
            Dopo
          </div>
          {outcomes.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.55, delay: 0.34 + index * 0.08 }}
                className="rounded-md border border-eic-orange/25 bg-eic-orange/10 p-4 shadow-lg shadow-eic-orange/5"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-eic-orange text-white shadow-lg shadow-eic-orange/20">
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <div>
                    <p className="font-black text-white">{item.label}</p>
                    <p className="text-xs text-white/62">{item.value}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
