import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import { orePresenze } from "@/lib/personale/presenze";
import type { DailyHoursController } from "@/hooks/useDailyHours";
import type { DailyHoursLine } from "@/lib/orders/dailyHours";

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
            aria-label="Cerca nelle ore di cantiere"
            placeholder="Cerca persona, cantiere o nota…"
            value={search}
            className="h-9 pl-9"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className={selectClass}
          aria-label="Dipendente del registro"
          value={person}
          onChange={(e) => {
            setPerson(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tutti i dipendenti</option>
          {c.data?.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          aria-label="Cantiere del registro"
          value={order}
          onChange={(e) => {
            setOrder(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tutti i cantieri</option>
          {c.data?.orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          aria-label="Stato delle ore"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tutti gli stati</option>
          <option value="confirmed">Confermate</option>
          <option value="pending">In attesa</option>
          {c.showCosts && <option value="unpriced">Da valorizzare</option>}
        </select>
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <span>
          {filtered.length} registrazioni
          {hasFilters ? ` su ${lines.length}` : " nel mese"} ·{" "}
          {orePresenze(filtered.reduce((sum, r) => sum + r.hours, 0))}
          {hasFilters ? " nei risultati" : " complessive"}
        </span>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-7" onClick={reset}>
              Azzera filtri
            </Button>
          )}
          {pages > 1 && (
            <nav
              aria-label="Paginazione rapida registro ore"
              className="flex items-center gap-2"
            >
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Pagina precedente delle ore (in alto)"
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
                aria-label="Pagina successiva delle ore (in alto)"
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
            ? "Nessuna registrazione corrisponde ai filtri selezionati."
            : "Nessuna ora nel mese selezionato. Registra la prima giornata."}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <table className="block w-full text-sm md:table">
              <caption className="sr-only">
                Registro delle ore per cantiere, pagina {currentPage} di {pages}
              </caption>
              <thead className="hidden bg-slate-50 text-left text-xs text-muted-foreground md:table-header-group">
                <tr>
                  <th scope="col" className="p-3 font-medium">
                    Data
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Dipendente
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Cantiere / commessa
                  </th>
                  <th scope="col" className="p-3 text-right font-medium">
                    Ore
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Stato
                  </th>
                  {c.showCosts && (
                    <th scope="col" className="p-3 text-right font-medium">
                      Costo
                    </th>
                  )}
                  <th scope="col" className="p-3">
                    <span className="sr-only">Azioni</span>
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
                      {people.get(r.employeeId) || "Dipendente non disponibile"}
                    </th>
                    <td className="block min-w-0 py-1 md:table-cell md:max-w-[360px] md:p-3">
                      <p
                        className="break-words text-sm"
                        title={orders.get(r.orderId)}
                      >
                        {orders.get(r.orderId) || "Commessa non disponibile"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.office
                          ? "Inserito dall’ufficio"
                          : "Rapportino cantiere"}
                      </p>
                      {r.note && (
                        <details className="mt-1 text-xs text-muted-foreground">
                          <summary className="w-fit cursor-pointer hover:text-foreground">
                            Note della registrazione
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
                        {r.pending ? "In attesa" : "Confermato"}
                      </span>
                    </td>
                    {c.showCosts && (
                      <td className="block whitespace-nowrap py-1 tabular-nums md:table-cell md:p-3 md:text-right">
                        <span className="text-xs text-muted-foreground md:hidden">
                          Costo:{" "}
                        </span>
                        {r.cost === null ? (
                          <span className="text-xs text-orange-700">
                            Da completare
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
                          Apri rapportini
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
                            Annulla registrazione
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
            aria-label="Paginazione registro ore"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-xs text-muted-foreground">
              {first}–{last} di {filtered.length} registrazioni
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                aria-label="Pagina precedente delle ore"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs tabular-nums">
                Pagina {currentPage} di {pages}
              </span>
              <Button
                size="icon"
                variant="outline"
                aria-label="Pagina successiva delle ore"
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
