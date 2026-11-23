import type { ComputoDocumentReview } from "@/lib/computo/documentReview";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const money = (value: number) => new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR" }).format(value);

export function ComputoDocumentChecks({ review, acknowledged, onAcknowledge }: {
  review: ComputoDocumentReview; acknowledged: boolean; onAcknowledge: (value: boolean) => void;
}) {
  const t = useT();
  if (review.pagesTotal === null && review.declaredTotal === null && !review.requiresReview && !review.incomplete) return null;
  return (
    <section aria-label={t("Controlli del documento")} className="rounded-md border bg-muted/30 p-3 text-xs space-y-2 mb-3">
      <p className="font-medium">{t("Controlli del documento originale")}</p>
      <div className="flex gap-x-5 gap-y-1 flex-wrap text-muted-foreground">
        {review.pagesTotal !== null && <span>{t("Pagine elaborate:")} {review.pagesRead ?? 0}/{review.pagesTotal}</span>}
        {review.declaredTotal !== null && <span>{t("Totale dichiarato: {declaredTotal}", { declaredTotal: String(money(review.declaredTotal) ?? "") })}</span>}
        <span>{t("Somma importi estratti:")} {review.computedTotal === null ? t("non verificabile") : money(review.computedTotal)}</span>
      </div>
      {review.incomplete && <p role="alert" className="text-destructive">{t("Lettura incompleta: carica un file più piccolo o leggibile prima di importare le voci.")}</p>}
      {review.warnings.length > 0 && <details>
        <summary className="cursor-pointer text-amber-700 dark:text-amber-300">{review.warnings.length} {review.warnings.length === 1 ? t("avviso") : t("avvisi")} {t("da verificare")}</summary>
        <ul className="list-disc pl-5 mt-2 space-y-1 max-h-28 overflow-auto">{review.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
      </details>}
      {review.requiresReview && !review.incomplete && <label className="flex gap-2 items-start cursor-pointer">
        <input type="checkbox" checked={acknowledged} onChange={e => onAcknowledge(e.target.checked)} className="mt-0.5" />
        <span>{t("Ho confrontato gli avvisi con l'originale e verificato le voci da importare.")}</span>
      </label>}
      <p className="text-muted-foreground">{t("Sono controlli aritmetici, non una certificazione della lettura AI. Il totale impresa può differire per ricarichi e voci escluse.")}</p>
    </section>
  );
}
