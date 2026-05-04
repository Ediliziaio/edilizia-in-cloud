import { ps } from "../content";
import { FadeUp } from "./FadeUp";

export function NotaFinale() {
  return (
    <section className="relative overflow-hidden bg-white px-5 py-24 md:px-8 lg:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-eic-navy/16 to-transparent" />
      <FadeUp className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.32fr_0.68fr]">
        <div className="rounded-md border border-eic-navy/10 bg-eic-navy p-6 text-white shadow-2xl shadow-eic-navy/15 lg:self-start">
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-md bg-eic-orange text-3xl font-black text-white shadow-lg shadow-eic-orange/25">
            EiC
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-eic-orange-soft">Nota finale</p>
          <p className="mt-3 text-2xl font-black leading-tight">Una decisione semplice: continuare a inseguire i dati o farli lavorare per te.</p>
        </div>
        <article className="rounded-md border border-eic-navy/10 bg-white p-6 shadow-xl shadow-eic-navy/6 md:p-10">
          <h2 className="font-display text-display-lg font-black text-eic-ink">{ps.title}</h2>
          <div className="mt-10 space-y-7 text-[17px] leading-[1.75] text-eic-ink/78 md:text-[19px]">
            {ps.paragraphs.map((paragraph) => (
              <p key={paragraph} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
          <div className="mt-12 border-t border-eic-navy/12 pt-8">
            <p className="font-display text-3xl italic text-eic-navy">EdiliziaInCloud</p>
            <p className="mt-3 font-semibold text-eic-ink">{ps.signatureName}</p>
            <p className="text-sm italic text-eic-ink/60">{ps.signatureRole}</p>
          </div>
        </article>
      </FadeUp>
    </section>
  );
}
