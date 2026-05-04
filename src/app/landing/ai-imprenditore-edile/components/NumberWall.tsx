import { motion } from "framer-motion";
import { Activity, AlertTriangle, ArrowRight, Clock3, Gauge } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/track";
import { cta, numberWall } from "../content";
import { CountUp } from "./CountUp";
import { FadeUp } from "./FadeUp";

const icons = [Gauge, Clock3, Activity, AlertTriangle];
const labels = ["margini", "tempo", "velocita", "controllo"];

export function NumberWall() {
  return (
    <section className="relative overflow-hidden bg-eic-ink px-5 py-16 text-white md:px-8 lg:py-24">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
        }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-eic-orange to-transparent"
        animate={{ x: ["-22%", "22%", "-22%"], opacity: [0.3, 0.9, 0.3] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative mx-auto max-w-6xl">
        <FadeUp className="grid gap-5 lg:grid-cols-[0.9fr_1fr] lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">{numberWall.eyebrow}</p>
            <h2 className="mt-4 max-w-2xl text-display-lg font-black">{numberWall.title}</h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-white/58 md:text-base lg:justify-self-end">
            Quattro segnali da leggere subito: dove l'impresa perde tempo, margine, velocità e controllo prima ancora di accorgersene.
          </p>
        </FadeUp>
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {numberWall.items.map((item, index) => {
            const Icon = icons[index] ?? Gauge;
            return (
            <FadeUp
              key={item.title}
              transition={{ delay: index * 0.08 }}
              className="group relative overflow-hidden rounded-md border border-white/10 bg-white/[0.035] p-5 transition duration-300 hover:-translate-y-1 hover:border-eic-orange/45 hover:bg-white/[0.06] hover:shadow-2xl hover:shadow-eic-orange/10 md:p-6"
            >
              <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-eic-orange/10 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
              <div className="relative flex items-start justify-between gap-4">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-white/56">
                  <Icon className="h-3.5 w-3.5 text-eic-orange" strokeWidth={1.6} />
                  {labels[index]}
                </span>
                <span className="text-xs font-black text-white/24">0{index + 1}</span>
              </div>
              <div className="relative mt-5 flex flex-col gap-4">
                <CountUp
                  value={"value" in item ? item.value : undefined}
                  label={"label" in item ? item.label : undefined}
                  prefix={"prefix" in item ? item.prefix : ""}
                  suffix={"suffix" in item ? item.suffix : ""}
                  className="block whitespace-nowrap text-[3rem] font-black leading-none tracking-[-0.025em] text-eic-orange md:text-[3.7rem]"
                />
                <div className="min-w-0">
                  <h3 className="text-lg font-black leading-6 text-white">{item.title}</h3>
                  <p className="mt-2.5 text-[15px] font-bold leading-6 text-white/88">“{item.punch}”</p>
                  <p className="mt-3 text-sm leading-6 text-white/55">{item.body}</p>
                </div>
              </div>
            </FadeUp>
            );
          })}
        </div>
        <FadeUp className="mt-8 flex flex-col items-start gap-4 rounded-md border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20 md:flex-row md:items-center md:justify-between">
          <p className="text-lg font-black tracking-[-0.03em] text-white md:text-xl">{numberWall.ctaLead}</p>
          <Button
            asChild
            className="h-[52px] rounded-full bg-eic-orange px-7 font-semibold text-white transition hover:scale-[1.02] hover:bg-eic-orange hover:shadow-lg hover:shadow-eic-orange/30"
          >
            <Link
              to={cta.primaryHref}
              onClick={() => trackEvent("landing_ai_cta_consulenza_click", { section_name: "number_wall" })}
            >
              {numberWall.cta}
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </Button>
        </FadeUp>
      </div>
    </section>
  );
}
