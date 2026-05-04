import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BrainCircuit, CheckCircle2, Clock3, Euro, FileSearch, ScanLine, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/track";
import { aiExamples } from "../content";
import { FadeUp } from "./FadeUp";

const caseIcons = [Euro, Clock3, FileSearch];

export function AIExamples() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = aiExamples.cases[activeIndex] ?? aiExamples.cases[0];

  return (
    <section className="relative overflow-hidden bg-eic-cream px-5 py-20 md:px-8 lg:py-28">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(30,58,95,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(30,58,95,.07) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-20 h-px w-full bg-gradient-to-r from-transparent via-eic-orange/70 to-transparent"
        animate={{ x: ["-24%", "24%", "-24%"], opacity: [0.25, 0.7, 0.25] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto max-w-6xl">
        <FadeUp className="grid gap-6 lg:grid-cols-[0.84fr_0.7fr] lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">{aiExamples.eyebrow}</p>
            <h2 className="mt-5 max-w-4xl text-[clamp(2.15rem,4.2vw,4.65rem)] font-black leading-[1.02] tracking-[-0.055em] text-eic-ink">
              {aiExamples.title}
            </h2>
          </div>
          <p className="text-base leading-7 text-slate-600 md:text-lg md:leading-8">{aiExamples.subtitle}</p>
        </FadeUp>

        <div className="mt-12 grid gap-5 lg:grid-cols-[0.42fr_0.58fr]">
          <FadeUp className="space-y-3">
            {aiExamples.cases.map((item, index) => {
              const Icon = caseIcons[index] ?? Target;
              const selected = active.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveIndex(index);
                    trackEvent("landing_ai_example_open", { value: item.id });
                  }}
                  className={cn(
                    "group w-full rounded-md border p-4 text-left transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eic-orange focus-visible:ring-offset-2",
                    selected
                      ? "border-eic-orange bg-white shadow-xl shadow-eic-orange/10"
                      : "border-eic-navy/10 bg-white/70 hover:-translate-y-0.5 hover:border-eic-orange/45 hover:bg-white hover:shadow-lg hover:shadow-eic-navy/5",
                  )}
                >
                  <span className="flex items-start gap-4">
                    <span
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition",
                        selected ? "border-eic-orange/30 bg-eic-orange text-white" : "border-eic-navy/10 bg-eic-cream text-eic-navy",
                      )}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.6} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-black uppercase tracking-[0.18em] text-slate-500">{item.label}</span>
                      <span className="mt-1 block text-lg font-black leading-6 text-eic-ink">{item.title}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </FadeUp>

          <FadeUp transition={{ delay: 0.1 }}>
            <div className="relative overflow-hidden rounded-md border border-eic-navy/10 bg-eic-navy-90 p-4 text-white shadow-2xl shadow-eic-navy/18 md:p-6">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,.11) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.11) 1px, transparent 1px)",
                  backgroundSize: "38px 38px",
                }}
              />
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-eic-orange/18 to-transparent"
                animate={{ y: [-70, 360, -70], opacity: [0.15, 0.42, 0.15] }}
                transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
              />

              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-md bg-eic-orange text-white shadow-lg shadow-eic-orange/25">
                    <BrainCircuit className="h-6 w-6" strokeWidth={1.5} />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-eic-orange-soft">Motore AI operativo</p>
                    <h3 className="mt-1 text-2xl font-black tracking-[-0.04em]">{active.label}</h3>
                  </div>
                </div>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
                  <Sparkles className="h-3.5 w-3.5 text-eic-orange-soft" strokeWidth={1.6} />
                  {active.metric}
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={active.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.32, ease: "easeOut" }}
                  className="relative mt-7"
                >
                  <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
                    <div className="rounded-md border border-white/12 bg-white/[0.06] p-5 backdrop-blur">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/50">
                        <ScanLine className="h-4 w-4 text-eic-orange-soft" strokeWidth={1.5} />
                        Dati che entrano
                      </div>
                      <p className="mt-4 text-base leading-7 text-white/84">{active.input}</p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {["CRM", "Ordine", "Calendario", "Incassi", "Costi"].map((tag, index) => (
                          <motion.span
                            key={tag}
                            className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-xs font-bold text-white/66"
                            animate={{ opacity: [0.55, 1, 0.55] }}
                            transition={{ duration: 2.4, delay: index * 0.15, repeat: Infinity, ease: "easeInOut" }}
                          >
                            {tag}
                          </motion.span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border border-white/12 bg-white/[0.06] p-5 backdrop-blur">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/50">
                        <BrainCircuit className="h-4 w-4 text-eic-orange-soft" strokeWidth={1.5} />
                        Cosa capisce l'AI
                      </div>
                      <div className="mt-4 space-y-3">
                        {active.finds.map((find, index) => (
                          <motion.div
                            key={find}
                            className="flex gap-3 rounded-md border border-white/10 bg-white/[0.055] p-3"
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.34, delay: index * 0.08 }}
                          >
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-eic-orange/15 text-eic-orange-soft">
                              {index + 1}
                            </span>
                            <p className="text-sm leading-6 text-white/76">{find}</p>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="relative my-5 h-7 overflow-hidden">
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-white/12" />
                    <motion.div
                      className="absolute top-1/2 h-px w-32 bg-gradient-to-r from-transparent via-eic-orange to-transparent"
                      animate={{ x: ["-35%", "620%"] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
                    />
                    <motion.div
                      className="absolute left-[48%] top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-eic-orange/40 bg-eic-navy-90 text-eic-orange"
                      animate={{ scale: [1, 1.12, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <ArrowRight className="h-4 w-4" strokeWidth={1.7} />
                    </motion.div>
                  </div>

                  <div className="rounded-md border border-eic-orange/35 bg-eic-orange/12 p-5">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-eic-orange-soft">Azione consigliata</p>
                    <p className="mt-3 text-lg font-black leading-7 text-white">{active.action}</p>
                    <div className="mt-4 flex items-start gap-3 rounded-md border border-white/10 bg-white/[0.06] p-3 text-sm leading-6 text-white/72">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" strokeWidth={1.6} />
                      <span>{active.outcome}</span>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
