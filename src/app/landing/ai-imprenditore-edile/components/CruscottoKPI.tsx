import { ArrowUpRight, FileCheck, Gauge, ReceiptText, ShieldCheck, Timer, UserX } from "lucide-react";
import { motion } from "framer-motion";
import { cruscotto } from "../content";
import { CountUp } from "./CountUp";
import { FadeUp } from "./FadeUp";

const icons = [Gauge, Timer, UserX, ReceiptText, ShieldCheck, FileCheck];
const accents = ["#F97316", "#FDA76B", "#38BDF8", "#22C55E", "#FACC15", "#A78BFA"];

export function CruscottoKPI() {
  return (
    <section className="relative overflow-hidden bg-eic-navy px-5 py-20 text-white md:px-8 lg:py-28">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 top-[42%] h-px bg-gradient-to-r from-transparent via-eic-orange/80 to-transparent"
        animate={{ x: ["-35%", "35%", "-35%"], opacity: [0.25, 0.75, 0.25] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto max-w-6xl">
        <FadeUp className="grid gap-6 lg:grid-cols-[0.88fr_0.72fr] lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">{cruscotto.eyebrow}</p>
            <h2 className="mt-5 max-w-4xl text-[clamp(2.25rem,4.25vw,4.85rem)] font-black leading-[1.02] tracking-[-0.055em]">
              {cruscotto.title}
            </h2>
            <p className="mt-5 max-w-3xl text-base leading-7 text-white/72 md:text-lg md:leading-8">{cruscotto.subtitle}</p>
          </div>
          <div className="rounded-md border border-white/12 bg-white/[0.06] p-5 shadow-2xl shadow-black/15 backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-eic-orange">Cosa cambia davvero</p>
            <p className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">Da dati sparsi a decisioni operative.</p>
            <p className="mt-3 text-sm leading-6 text-white/62">
              Le card sotto non sono metriche decorative: sono i punti dove l'AI deve ridurre caos, ritardi e margini persi.
            </p>
          </div>
        </FadeUp>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cruscotto.tiles.map((tile, index) => {
            const Icon = icons[index];
            const accent = accents[index] ?? "#F97316";
            return (
              <motion.div
                key={tile.label}
                data-kpi-card="true"
                initial={{ opacity: 1, y: 0 }}
                whileInView={{ y: [8, 0] }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.45, delay: index * 0.04, ease: "easeOut" }}
                whileHover={{ y: -6, scale: 1.012 }}
                className="group relative min-h-[250px] overflow-hidden rounded-md border border-white/12 bg-white/[0.06] p-6 shadow-xl shadow-black/10 outline outline-1 outline-transparent backdrop-blur transition-colors duration-300 hover:border-white/24 hover:bg-white/[0.09] hover:shadow-2xl hover:shadow-black/20"
              >
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-1 opacity-90"
                  style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 w-28 opacity-[0.13] transition duration-500 group-hover:opacity-[0.22]"
                  style={{ background: `linear-gradient(90deg, transparent, ${accent})` }}
                />
                <div className="relative flex items-start justify-between gap-4">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-md border border-white/12 bg-white/[0.08] shadow-lg shadow-black/10"
                    style={{ color: accent }}
                  >
                    <Icon className="h-6 w-6" strokeWidth={1.5} />
                  </span>
                  <ArrowUpRight className="h-5 w-5 text-white/24 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white/60" strokeWidth={1.5} />
                </div>
                <CountUp
                  value={tile.value}
                  prefix={tile.prefix}
                  suffix={tile.suffix}
                  decimals={tile.value % 1 === 0 ? 0 : 1}
                  className="relative mt-6 block text-[3.35rem] font-black leading-none tracking-[-0.06em] md:text-[4.1rem]"
                  style={{ color: accent }}
                />
                <h3 className="relative mt-4 text-lg font-black leading-6 text-white">{tile.label}</h3>
                <p className="relative mt-3 text-sm leading-6 text-white/64">{tile.note}</p>
                <div className="relative mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: accent }}
                    initial={{ width: "28%" }}
                    whileInView={{ width: `${Math.min(92, 42 + index * 8)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, delay: 0.12 + index * 0.05, ease: "easeOut" }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
        <p className="mt-8 text-xs italic leading-6 text-white/48">*{cruscotto.disclaimer}*</p>
      </div>
    </section>
  );
}
