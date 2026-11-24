
import { useT } from "@/lib/campo/lingua/LinguaCampo";interface RenderBeforeAfterPreviewProps {
  beforeUrl: string;
  afterUrl: string;
  title?: string;
  imageFit?: "cover" | "contain";
}

export function RenderBeforeAfterPreview({
  beforeUrl,
  afterUrl,
  title: titleProp,
  imageFit = "cover",
}: RenderBeforeAfterPreviewProps) {
  const t = useT();
  const title = titleProp ?? t("Confronto prima e dopo");
  const fitClass = imageFit === "contain" ? "object-contain bg-muted" : "object-cover";

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted" aria-label={title}>
      <img src={beforeUrl} alt={t("Prima")} className={`absolute inset-0 h-full w-1/2 ${fitClass}`} loading="lazy" decoding="async" />
      <img src={afterUrl} alt={t("Dopo")} className={`absolute inset-y-0 right-0 h-full w-1/2 ${fitClass}`} loading="lazy" decoding="async" />
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white shadow" />
      <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{t("Prima")}</div>
      <div className="absolute right-2 top-2 rounded bg-primary/80 px-1.5 py-0.5 text-[10px] font-medium text-white">{t("Dopo")}</div>
    </div>
  );
}
