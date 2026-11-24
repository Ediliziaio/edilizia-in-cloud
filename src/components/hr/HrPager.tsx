import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function HrPager({ total, page, pageSize = 20, onPage }: { total: number; page: number; pageSize?: number; onPage: (page: number) => void }) {
  const t = useT();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages - 1);
  if (total <= pageSize) return null;
  return <nav aria-label={t("Pagine elenco")} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
    <span aria-live="polite">{t("{current}–{valore} di {total}", { current: current * pageSize + 1, valore: Math.min((current + 1) * pageSize, total), total: String(total ?? "") })}</span>
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={current === 0} onClick={() => onPage(current - 1)}>{t("Precedenti")}</Button>
      <span>{t("Pagina {current} di {pages}", { current: current + 1, pages: String(pages ?? "") })}</span>
      <Button size="sm" variant="outline" disabled={current + 1 >= pages} onClick={() => onPage(current + 1)}>{t("Successivi")}</Button>
    </div>
  </nav>;
}
