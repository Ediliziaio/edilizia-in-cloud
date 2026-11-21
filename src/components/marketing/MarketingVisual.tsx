import { useRef } from "react";
import { marketingVisuals, type MarketingVisualTheme } from "@/lib/marketing/visuals";
import HeroRete from "@/components/landing/HeroRete";

const CSS = `
@keyframes mv-zoom { from { transform: scale(1.02) translate(0, 0); } to { transform: scale(1.1) translate(-1.5%, -1%); } }
.mv-img { animation: mv-zoom 18s ease-in-out infinite alternate; transform-origin: 60% 40%; }
.mv-card { transition: transform 400ms cubic-bezier(0.22, 1, 0.36, 1); transform: perspective(1100px) rotateX(var(--mv-rx, 0deg)) rotateY(var(--mv-ry, 0deg)); }
@keyframes mv-dot { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
.mv-dot { animation: mv-dot 1.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .mv-img, .mv-dot { animation: none; } .mv-card { transform: none; } }
`;

/**
 * Illustrazioni editoriali delle pagine (mai spacciate per schermate del prodotto).
 * Dal 21/11/2026 sono "vive": l'immagine si muove piano e si inclina col mouse, sopra
 * scorre la rete di palline dell'apertura della home e in basso Silvio collega i dati.
 * Un solo componente: le 13 pagine che lo usano cambiano tutte insieme.
 */
export default function MarketingVisual({ theme, image, className = "", priority = false, caption, tone = "light" }: {
  theme?: MarketingVisualTheme;
  /** Immagine propria della pagina, negli stessi tagli -640/-960/-1536 dei temi. */
  image?: { base: string; alt: string };
  className?: string;
  priority?: boolean;
  caption?: string;
  tone?: "light" | "dark";
}) {
  const visual = image ?? marketingVisuals[theme ?? "operations"];
  const cardRef = useRef<HTMLDivElement>(null);

  const inclina = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--mv-ry", `${(x * 6).toFixed(2)}deg`);
    el.style.setProperty("--mv-rx", `${(-y * 5).toFixed(2)}deg`);
  };
  const raddrizza = () => {
    cardRef.current?.style.setProperty("--mv-ry", "0deg");
    cardRef.current?.style.setProperty("--mv-rx", "0deg");
  };

  return <figure className={`min-w-0 ${className}`}>
    <style>{CSS}</style>
    <div ref={cardRef} onPointerMove={inclina} onPointerLeave={raddrizza} className="mv-card relative overflow-hidden rounded-3xl bg-[#e8e2d9] border border-black/5 shadow-xl">
      <img src={`${visual.base}-960.webp`} srcSet={`${visual.base}-640.webp 640w, ${visual.base}-960.webp 960w, ${visual.base}-1536.webp 1536w`} sizes="(min-width: 1024px) 48vw, 100vw" width={1536} height={1024} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" alt={visual.alt} className="mv-img w-full h-auto" />
      {/* velo leggero, così la rete si legge sull'immagine */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b1220]/45 via-[#0b1220]/10 to-transparent" />
      <HeroRete />
      {/* Silvio che collega i dati */}
      <div aria-hidden className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-white/40 bg-white/90 py-1 pl-1 pr-3 shadow-lg backdrop-blur">
        <span className="relative block h-7 w-7 overflow-hidden rounded-full bg-orange-50 ring-2 ring-orange-200">
          <img src="/images/silvio/silvio-busto.png" alt="" width={28} height={28} loading="lazy" decoding="async" className="absolute left-1/2 top-[4%] h-[115%] w-[115%] max-w-none -translate-x-1/2" />
        </span>
        <span className="text-[11px] font-bold text-[#111111]">Silvio collega i dati</span>
        <span className="flex gap-0.5">
          {[0, 1, 2].map((k) => <span key={k} className="mv-dot block h-1.5 w-1.5 rounded-full bg-eic-orange" style={{ animationDelay: `${k * 0.18}s` }} />)}
        </span>
      </div>
    </div>
    {caption && <figcaption className={`mt-3 text-xs leading-relaxed ${tone === "dark" ? "text-white/65" : "text-gray-600"}`}>{caption}</figcaption>}
  </figure>;
}
