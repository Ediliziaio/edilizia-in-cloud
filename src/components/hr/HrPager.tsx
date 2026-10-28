import { Button } from "@/components/ui/button";

export function HrPager({ total, page, pageSize = 20, onPage }: { total: number; page: number; pageSize?: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages - 1);
  if (total <= pageSize) return null;
  return <nav aria-label="Pagine elenco" className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
    <span aria-live="polite">{current * pageSize + 1}–{Math.min((current + 1) * pageSize, total)} di {total}</span>
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={current === 0} onClick={() => onPage(current - 1)}>Precedenti</Button>
      <span>Pagina {current + 1} di {pages}</span>
      <Button size="sm" variant="outline" disabled={current + 1 >= pages} onClick={() => onPage(current + 1)}>Successivi</Button>
    </div>
  </nav>;
}
