import { marketingVisuals, type MarketingVisualTheme } from "@/lib/marketing/visuals";

/** Editorial illustrations, never represented as screenshots of the product. */
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
  return <figure className={`min-w-0 ${className}`}>
    <div className="overflow-hidden rounded-3xl bg-[#e8e2d9] border border-black/5">
      <img src={`${visual.base}-960.webp`} srcSet={`${visual.base}-640.webp 640w, ${visual.base}-960.webp 960w, ${visual.base}-1536.webp 1536w`} sizes="(min-width: 1024px) 48vw, 100vw" width={1536} height={1024} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" alt={visual.alt} className="w-full h-auto" />
    </div>
    {caption && <figcaption className={`mt-3 text-xs leading-relaxed ${tone === "dark" ? "text-white/65" : "text-gray-600"}`}>{caption}</figcaption>}
  </figure>;
}
