import { ArrowRight, BadgeCheck, CalendarClock, ClipboardCheck, ShieldCheck, Target } from "lucide-react";
import { garanzie } from "../content";
import { FadeUp } from "./FadeUp";

const summaryCards = [
  {
    title: "Prima capiamo se serve davvero",
    body: "Mezz'ora sui tuoi flussi reali, non una demo generica.",
    icon: ClipboardCheck,
  },
  {
    title: "Poi parti con dati veri",
    body: "Setup guidato, migrazione assistita e prova operativa.",
    icon: CalendarClock,
  },
  {
    title: "Alla fine misuri il ROI",
    body: "Margini, incassi, ore e sprechi ricorrenti sotto controllo.",
    icon: Target,
  },
];

const timeline = [
  ["Giorno 1", "Mappiamo preventivi, ordini, incassi, costi e cantieri."],
  ["Giorno 7", "Portiamo dentro i dati che oggi sono sparsi tra Excel, chat e cartelle."],
  ["Giorno 30", "Leggiamo i primi segnali: ritardi, margini bassi, incassi e sprechi."],
  ["Giorno 90", "Misuriamo cosa hai recuperato o dove devi correggere ancora."],
];

export function GaranzieTable() {
  return (
    <section className="relative overflow-hidden bg-white px-5 py-20 md:px-8 lg:py-28">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.34]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(30,58,95,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(30,58,95,.055) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="relative mx-auto max-w-6xl">
        <FadeUp className="grid gap-6 lg:grid-cols-[0.86fr_0.54fr] lg:items-end">
          <div>
            <p className="inline-flex rounded-full bg-eic-orange/10 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-eic-orange">
              {garanzie.eyebrow}
            </p>
            <h2 className="mt-5 max-w-4xl text-[clamp(2.25rem,5vw,4.6rem)] font-black leading-[1.02] tracking-[-0.055em] text-eic-ink">
              Sei garanzie. Parti solo se ha senso per te.
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-eic-ink/64 md:text-lg md:leading-8">
            Non devi fidarti di una promessa. Devi vedere il tuo flusso, provare il sistema con dati reali e misurare se il controllo migliora.
          </p>
        </FadeUp>

        <FadeUp className="mt-9 grid gap-3 md:grid-cols-3">
          {summaryCards.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="group rounded-md border border-eic-navy/10 bg-eic-cream p-5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-eic-orange/35 hover:bg-white hover:shadow-xl hover:shadow-eic-navy/8"
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-eic-orange/20 bg-white text-eic-orange transition group-hover:bg-eic-orange group-hover:text-white">
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <div>
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-eic-orange">0{index + 1}</span>
                    <p className="mt-1 text-lg font-black leading-6 text-eic-ink">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-eic-ink/62">{item.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </FadeUp>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.42fr]">
          <FadeUp className="rounded-md border border-eic-navy/10 bg-white p-4 shadow-2xl shadow-eic-navy/7 md:p-6">
            <div className="mb-5 flex flex-col gap-3 border-b border-eic-navy/10 pb-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-eic-navy/50">Cosa ti protegge davvero</p>
                <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-eic-ink">Garanzie operative, non clausole nascoste</h3>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-eic-orange/20 bg-eic-orange/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-eic-orange">
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.6} />
                rischio ridotto
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {garanzie.rows.map(([number, title, meaning]) => {
                const isRoi = number === "4";
                return (
                  <div
                    key={number}
                    className={`group relative overflow-hidden rounded-md border p-5 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl ${
                      isRoi
                        ? "border-eic-orange/35 bg-eic-orange/[0.08] shadow-eic-orange/8"
                        : "border-eic-navy/10 bg-slate-50/70 hover:border-eic-navy/18 hover:bg-white hover:shadow-eic-navy/6"
                    }`}
                  >
                    <div className={`absolute inset-x-0 top-0 h-1 ${isRoi ? "bg-eic-orange" : "bg-eic-navy/12"}`} />
                    <div className="flex items-start gap-4">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-black ${
                          isRoi ? "bg-eic-orange text-white" : "bg-white text-eic-orange ring-1 ring-eic-navy/10"
                        }`}
                      >
                        {number}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-black leading-6 text-eic-ink">{title.replace("⭐ ", "")}</h4>
                          {isRoi && (
                            <span className="rounded-full bg-eic-navy px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white">
                              ROI 90 giorni
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-eic-ink/64">{meaning}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </FadeUp>

          <FadeUp transition={{ delay: 0.08 }} className="relative overflow-hidden rounded-md bg-eic-navy p-6 text-white shadow-2xl shadow-eic-navy/18">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.13]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.14) 1px, transparent 1px)",
                backgroundSize: "34px 34px",
              }}
            />
            <div className="relative">
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-eic-orange text-white shadow-lg shadow-eic-orange/25">
                <BadgeCheck className="h-6 w-6" strokeWidth={1.5} />
              </span>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-eic-orange-soft">Percorso 90 giorni</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">La garanzia ha un metodo.</h3>
              <div className="mt-6 space-y-4">
                {timeline.map(([time, text], index) => (
                  <div key={time} className="relative flex gap-4">
                    {index < timeline.length - 1 && <span className="absolute left-[15px] top-8 h-full w-px bg-white/14" />}
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/18 bg-white/10 text-xs font-black text-eic-orange-soft">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-black text-white">{time}</p>
                      <p className="mt-1 text-sm leading-6 text-white/68">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>
        </div>

        <FadeUp className="mt-8 overflow-hidden rounded-md border border-eic-orange/30 bg-eic-orange p-6 text-white shadow-2xl shadow-eic-orange/18 md:p-8">
          <div className="grid gap-5 md:grid-cols-[auto_1fr_auto] md:items-center">
            <ShieldCheck className="h-10 w-10" strokeWidth={1.5} />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/72">Obiettivo concreto</p>
              <p className="mt-2 text-xl font-black leading-8">{garanzie.emphasis.replace("⭐ Obiettivo concreto: ", "")}</p>
            </div>
            <ArrowRight className="hidden h-7 w-7 md:block" strokeWidth={1.5} />
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
