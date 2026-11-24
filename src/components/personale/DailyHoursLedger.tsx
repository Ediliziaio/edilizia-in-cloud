import { UniformSelect } from "@/components/ui/uniform-select";
import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import { orePresenze } from "@/lib/personale/presenze";
import type { DailyHoursController } from "@/hooks/useDailyHours";
import type { DailyHoursLine } from "@/lib/orders/dailyHours";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const PAGE_SIZE = 15;
const EMPTY_LINES: DailyHoursLine[] = [];
const selectClass = "h-9 min-w-0 rounded-md border bg-white px-3 text-sm";
export function DailyHoursLedger({
  controller: c,
  onCancel,
  busy,
}: {
  controller: DailyHoursController;
  onCancel: (reportId: string) => void;
  busy: boolean;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState("");
  const [order, setOrder] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const people = useMemo(
    () => new Map(c.data?.people.map((p) => [p.id, p.name]) ?? []),
    [c.data?.people],
  );
  const orders = useMemo(
    () => new Map(c.data?.orders.map((o) => [o.id, o.name]) ?? []),
    [c.data?.orders],
  );
  const lines = c.data?.lines ?? EMPTY_LINES;
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("it-IT");
    return lines
      .filter(
        (r) =>
          (!person || r.employeeId === person) &&
          (!order || r.orderId === order) &&
          (!status ||
            (status === "confirmed" && !r.pending) ||
            (status === "pending" && r.pending) ||
            (status === "unpriced" &&
              (!c.showCosts || r.pending || r.cost === null))) &&
          (!query ||
            `${people.get(r.employeeId) ?? ""} ${orders.get(r.orderId) ?? ""} ${r.note ?? ""}`
              .toLocaleLowerCase("it-IT")
              .includes(query)),
      )
      .sort(
        (a, b) =>
          b.day.localeCompare(a.day) ||
          (people.get(a.employeeId) ?? "").localeCompare(
            people.get(b.employeeId) ?? "",
            "it",
          ) ||
          a.key.localeCompare(b.key),
      );
  }, [lines, search, person, order, status, people, orders, c.showCosts]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const hasFilters = Boolean(search || person || order || status);
  const reset = () => {
    setSearch("");
    setPerson("");
    setOrder("");
    setStatus("");
    setPage(1);
  };
  const first = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(currentPage * PAGE_SIZE, filtered.length);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_180px_220px_180px]">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
          />
          <Input
            aria-label={t("Cerca nelle ore di cantiere")}
            placeholder={t("Cerca persona, cantiere o nota…")}
            value={search}
            className="h-9 pl-9"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <UniformSelect
          className={`${selectClass} max-md:hidden`}
          aria-label={t("Dipendente del registro")}
          value={person}
          onChange={(e) => {
            setPerson(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("Tutti i dipendenti")}</option>
          {c.data?.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </UniformSelect>
        <UniformSelect
          className={`${selectClass} max-md:hidden`}
          aria-label={t("Cantiere del registro")}
          value={order}
          onChange={(e) => {
            setOrder(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("Tutti i cantieri")}</option>
          {c.data?.orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </UniformSelect>
        <UniformSelect
          className={selectClass}
          aria-label={t("Stato delle ore")}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("Tutti gli stati")}</option>
          <option value="confirmed">{t("Confermate")}</option>
          <option value="pending">{t("In attesa")}</option>
          {c.showCosts && <option value="unpriced">{t("Da valorizzare")}</option>}
        </UniformSelect>
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <span>
          {hasFilters
            ? t("{n} registrazioni su {totale} · {ore} nei risultati", { n: filtered.length, totale: lines.length, ore: orePresenze(filtered.reduce((sum, r) => sum + r.hours, 0)) })
            : t("{n} registrazioni nel mese · {ore} complessive", { n: filtered.length, ore: orePresenze(filtered.reduce((sum, r) => sum + r.hours, 0)) })}
        </span>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-7" onClick={reset}>
              {t("Azzera filtri")}
            </Button>
          )}
          {pages > 1 && (
            <nav
              aria-label={t("Paginazione rapida registro ore")}
              className="flex items-center gap-2"
            >
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={t("Pagina precedente delle ore (in alto)")}
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums">
                {currentPage} / {pages}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={t("Pagina successiva delle ore (in alto)")}
                disabled={currentPage >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          )}
        </div>
      </div>
      {!filtered.length ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {lines.length
            ? t("Nessuna registrazione corrisponde ai filtri selezionati.")
            : t("Nessuna ora nel mese selezionato. Registra la prima giornata.")}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <table className="block w-full text-sm md:table">
              <caption className="sr-only">{t("Registro delle ore per cantiere, pagina {currentPage} di {pages}", { currentPage: String(currentPage ?? ""), pages: String(pages ?? "") })}</caption>
              <thead className="hidden bg-slate-50 text-left text-xs text-muted-foreground md:table-header-group">
                <tr>
                  <th scope="col" className="p-3 font-medium">
                    {t("Data")}
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    {t("Dipendente")}
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    {t("Cantiere / commessa")}
                  </th>
                  <th scope="col" className="p-3 text-right font-medium">
                    {t("Ore")}
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    {t("Stato")}
                  </th>
                  {c.showCosts && (
                    <th scope="col" className="p-3 text-right font-medium">
                      {t("Costo")}
                    </th>
                  )}
                  <th scope="col" className="p-3">
                    <span className="sr-only">{t("Azioni")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="block divide-y md:table-row-group">
                {visible.map((r) => (
                  <tr
                    key={r.key}
                    className="block p-3 transition-colors hover:bg-slate-50/50 md:table-row md:p-0"
                  >
                    <td className="block whitespace-nowrap py-1 text-xs text-muted-foreground md:table-cell md:p-3">
                      {r.day.split("-").reverse().join("/")}
                    </td>
                    <th
                      scope="row"
                      className="block py-1 text-left font-medium md:table-cell md:p-3"
                    >
                      {people.get(r.employeeId) || t("Dipendente non disponibile")}
                    </th>
                    <td className="block min-w-0 py-1 md:table-cell md:max-w-[360px] md:p-3">
                      <p
                        className="break-words text-sm"
                        title={orders.get(r.orderId)}
                      >
                        {orders.get(r.orderId) || t("Commessa non disponibile")}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.office
                          ? t("Inserito dall’ufficio")
                          : t("Rapportino cantiere")}
                      </p>
                      {r.note && (
                        <details className="mt-1 text-xs text-muted-foreground">
                          <summary className="w-fit cursor-pointer hover:text-foreground">
                            {t("Note della registrazione")}
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-slate-50 p-2">
                            {r.note}
                          </p>
                        </details>
                      )}
                    </td>
                    <td className="inline-block py-1 pr-3 font-medium tabular-nums md:table-cell md:p-3 md:text-right">
                      {orePresenze(r.hours)}
                    </td>
                    <td className="inline-block py-1 md:table-cell md:p-3">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs ${r.pending ? "bg-orange-50 text-orange-800" : "bg-blue-50 text-blue-700"}`}
                      >
                        {r.pending ? t("In attesa") : t("Confermato")}
                      </span>
                    </td>
                    {c.showCosts && (
                      <td className="block whitespace-nowrap py-1 tabular-nums md:table-cell md:p-3 md:text-right">
                        <span className="text-xs text-muted-foreground md:hidden">
                          {t("Costo:")}{" "}
                        </span>
                        {r.cost === null ? (
                          <span className="text-xs text-orange-700">
                            {t("Da completare")}
                          </span>
                        ) : (
                          formatCurrency(r.cost)
                        )}
                      </td>
                    )}
                    <td className="block py-1 md:table-cell md:p-3">
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <a
                          href={`/azienda/ordini/${r.orderId}?tab=cantiere&vista_cantiere=diario#section-rapportini`}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {t("Apri rapportini")}
                          <ArrowUpRight
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                        </a>
                        {r.office && c.canEdit && (
                          <Button
                            disabled={busy}
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => onCancel(r.reportId)}
                          >
                            {t("Annulla registrazione")}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav
            aria-label={t("Paginazione registro ore")}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-xs text-muted-foreground">{t("{first}–{last} di {n} registrazioni", { first: String(first ?? ""), last: String(last ?? ""), n: filtered.length })}</p>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                aria-label={t("Pagina precedente delle ore")}
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs tabular-nums">{t("Pagina {n} di {totale}", { n: String(currentPage ?? ""), totale: String(pages ?? "") })}</span>
              <Button
                size="icon"
                variant="outline"
                aria-label={t("Pagina successiva delle ore")}
                disabled={currentPage >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
