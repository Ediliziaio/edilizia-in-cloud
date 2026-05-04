import { infrastrutture } from "../content";
import { FadeUp } from "./FadeUp";
import { InfrastrutturaBlock } from "./InfrastrutturaBlock";

export function InfrastruttureGrid() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(30,58,95,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(30,58,95,.055) 1px, transparent 1px)",
          backgroundSize: "58px 58px",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-5 py-24 text-center md:px-8 lg:py-32">
        <FadeUp className="rounded-md border border-eic-navy/10 bg-white/85 p-6 shadow-2xl shadow-eic-navy/6 backdrop-blur md:p-10">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">{infrastrutture.eyebrow}</p>
          <h2 className="mx-auto mt-5 max-w-4xl text-display-lg font-black text-eic-ink">{infrastrutture.title}</h2>
          <div className="mx-auto mt-7 max-w-3xl space-y-4 text-lg leading-8 text-eic-ink/68">
            {infrastrutture.subtitle.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="mx-auto mt-8 grid max-w-3xl gap-2 text-sm font-bold text-eic-navy/70 sm:grid-cols-3">
            {["Vendite", "Cantieri", "Cassa"].map((item) => (
              <span key={item} className="rounded-full border border-eic-navy/10 bg-eic-cream px-4 py-2">
                {item} collegati
              </span>
            ))}
          </div>
        </FadeUp>
      </div>
      {infrastrutture.blocks.map((block, index) => (
        <InfrastrutturaBlock key={block.letter} block={block} index={index} />
      ))}
    </section>
  );
}
