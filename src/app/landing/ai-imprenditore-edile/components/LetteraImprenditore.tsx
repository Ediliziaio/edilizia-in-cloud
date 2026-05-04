import { lettera } from "../content";
import { FadeUp } from "./FadeUp";

function renderParagraph(text: string, index: number) {
  if (text === "Fermati.") {
    return (
      <p key={text} className="py-8 text-center font-display text-6xl font-black leading-none text-eic-ink md:text-7xl">
        Fermati.
      </p>
    );
  }

  return (
    <p key={`${text}-${index}`} className="whitespace-pre-line text-[17px] leading-[1.75] text-eic-ink/82 md:text-[19px]">
      {text}
    </p>
  );
}

export function LetteraImprenditore() {
  return (
    <section className="relative overflow-hidden bg-eic-cream px-5 py-24 md:px-8 lg:py-32">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.42]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(30,58,95,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(30,58,95,.055) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <FadeUp className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.36fr_0.64fr] lg:items-start">
        <aside className="rounded-md border border-eic-navy/10 bg-white/80 p-6 shadow-xl shadow-eic-navy/5 backdrop-blur lg:sticky lg:top-10">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-eic-orange">Il punto</p>
          <p className="mt-4 text-3xl font-black leading-tight text-eic-ink">Non ti servono altri dati. Ti serve sapere cosa guardare oggi.</p>
          <div className="mt-6 space-y-3">
            {["WhatsApp", "Excel", "DDT", "Preventivi", "Incassi"].map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-md border border-eic-navy/8 bg-eic-cream px-3 py-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-eic-orange/10 text-xs font-black text-eic-orange">
                  {index + 1}
                </span>
                <span className="text-sm font-bold text-eic-navy/75">{item}</span>
              </div>
            ))}
          </div>
        </aside>

        <article className="rounded-md border border-eic-navy/10 bg-white p-6 shadow-2xl shadow-eic-navy/8 md:p-10">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-eic-orange">{lettera.eyebrow}</p>
          <h2 className="mt-6 font-display text-display-lg font-black leading-tight text-eic-ink">{lettera.title}</h2>
          <div className="mt-12 space-y-7">
            <p className="font-display text-3xl italic text-eic-orange">{lettera.opening}</p>
            {lettera.paragraphs.map(renderParagraph)}
          </div>
          <div className="mt-12 border-t border-eic-navy/12 pt-8">
            <p className="font-display text-3xl italic text-eic-navy">EdiliziaInCloud</p>
            <p className="mt-3 font-semibold text-eic-ink">{lettera.signatureName}</p>
            <p className="text-sm italic text-eic-ink/60">{lettera.signatureRole}</p>
          </div>
        </article>
      </FadeUp>
    </section>
  );
}
