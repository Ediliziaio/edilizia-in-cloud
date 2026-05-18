/**
 * DemoWatermark — v8.6.63
 *
 * Overlay leggero che marchia un'area come "DEMO". Usato sopra screenshot di
 * esempio, preview generati, mockup. Non blocca interazione (pointer-events:none)
 * ma comunica visivamente "questo è un esempio".
 *
 * Visibile SOLO se feature è in preview mode.
 *
 * Pattern d'uso:
 *
 *   <div className="relative">
 *     <img src={renderExample} alt="Esempio render" />
 *     <DemoWatermark featureKey="render_ai" />
 *   </div>
 */
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useFeaturePreviewContextOptional } from "./useFeaturePreview";

interface Props {
  featureKey?: string;
  /** Testo da mostrare (default: "DEMO"). */
  label?: string;
  /** Posizione: "diagonal" (default) | "ribbon-tr" | "ribbon-bl". */
  variant?: "diagonal" | "ribbon-tr" | "ribbon-bl";
}

export function DemoWatermark({
  featureKey: keyProp,
  label = "DEMO",
  variant = "diagonal",
}: Props) {
  const ctx = useFeaturePreviewContextOptional();
  const featureKey = keyProp ?? ctx?.featureKey ?? "";
  const directAccess = useFeatureAccess(featureKey);
  const isPreview = ctx?.isPreview ?? directAccess.isPreview;

  if (!isPreview || !featureKey) return null;

  if (variant === "ribbon-tr") {
    return (
      <div className="pointer-events-none absolute top-0 right-0 overflow-hidden w-24 h-24">
        <div className="absolute top-3 -right-8 rotate-45 bg-amber-500 text-white text-[10px] font-bold py-1 px-10 shadow-md tracking-wider">
          {label}
        </div>
      </div>
    );
  }

  if (variant === "ribbon-bl") {
    return (
      <div className="pointer-events-none absolute bottom-0 left-0 overflow-hidden w-24 h-24">
        <div className="absolute bottom-3 -left-8 rotate-45 bg-amber-500 text-white text-[10px] font-bold py-1 px-10 shadow-md tracking-wider">
          {label}
        </div>
      </div>
    );
  }

  // diagonal (default): testo grande semi-trasparente al centro
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      aria-hidden="true"
    >
      <span
        className="text-amber-500/15 dark:text-amber-400/20 font-black tracking-[0.3em] select-none"
        style={{
          fontSize: "clamp(2rem, 8vw, 5rem)",
          transform: "rotate(-15deg)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
