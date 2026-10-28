import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Search,
  Users,
} from "lucide-react";
import { useGiornate, type GiornataWithProfilo } from "@/hooks/useGiornate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  filtraPresenze,
  giornataDaVerificare,
  giorniMese,
  orePresenze,
  riepilogoPresenze,
  statoPresenzaHr,
  STATI_PRESENZA,
} from "@/lib/personale/presenze";
import { cn } from "@/lib/utils";

const nomeData = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
const selectClass = "h-9 min-w-0 rounded-md border bg-white px-3 text-sm";
const EMPTY_ROWS: GiornataWithProfilo[] = [];
export function PresenzeHrCalendar({
  mese,
  oggi,
}: {
  mese: string;
  oggi: string;
}) {
  const [ricerca, setRicerca] = useState("");
  const [reparto, setReparto] = useState("");
  const [stato, setStato] = useState("");
  const [anomalie, setAnomalie] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const giorni = useMemo(() => giorniMese(mese), [mese]);
  const dateTo = giorni.filter((day): day is string => day !== null).at(-1)!;
  const query = useGiornate(`${mese}-01`, dateTo);
  const rows = query.data ?? EMPTY_ROWS;
  const reparti = [
    ...new Set(rows.map((g) => g.profilo_reparto?.trim() || "Non indicato")),
  ].sort();
  const filtered = useMemo(
    () => filtraPresenze(rows, ricerca, reparto, stato, anomalie, oggi),
    [rows, ricerca, reparto, stato, anomalie, oggi],
  );
  const summary = riepilogoPresenze(filtered, oggi);
  const personeCount = new Set(filtered.map((g) => g.profilo_id)).size;
  const byDay = useMemo(() => {
    const map = new Map<string, GiornataWithProfilo[]>();
    for (const row of filtered) {
      const list = map.get(row.data) ?? [];
      list.push(row);
      map.set(row.data, list);
    }
    return map;
  }, [filtered]);
  const detail = [...(selectedDay ? (byDay.get(selectedDay) ?? []) : [])].sort(
    (a, b) =>
      `${a.profilo_cognome} ${a.profilo_nome}`.localeCompare(
        `${b.profilo_cognome} ${b.profilo_nome}`,
        "it",
      ),
  );
  const hasFilters = Boolean(ricerca || reparto || stato || anomalie);
  const reset = () => {
    setRicerca("");
    setReparto("");
    setStato("");
    setAnomalie(false);
  };

  return (
    <section aria-label="Calendario presenze HR" className="space-y-4">
      <div className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_180px_180px_auto]">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
          />
          <Input
            aria-label="Cerca persona o mansione"
            placeholder="Cerca persona o mansione…"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <select
          aria-label="Reparto presenze"
          value={reparto}
          onChange={(e) => setReparto(e.target.value)}
          className={selectClass}
        >
          <option value="">Tutti i reparti</option>
          {reparti.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          aria-label="Stato presenza"
          value={stato}
          onChange={(e) => setStato(e.target.value)}
          className={selectClass}
        >
          <option value="">Tutti gli stati</option>
          {Object.entries(STATI_PRESENZA).map(([key, info]) => (
            <option key={key} value={key}>
              {info.label}
            </option>
          ))}
        </select>
        <Button
          variant={anomalie ? "secondary" : "outline"}
          size="sm"
          aria-pressed={anomalie}
          onClick={() => setAnomalie(!anomalie)}
          className={cn(
            "h-9 gap-2",
            anomalie && "bg-orange-50 text-orange-800",
          )}
        >
          <AlertTriangle className="h-4 w-4" />
          Solo anomalie
        </Button>
      </div>
      {query.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-white p-5"
        >
          <p className="font-medium">Impossibile caricare le presenze</p>
          <p className="mt-1 text-sm text-muted-foreground">
            I dati non sono disponibili: questo non indica che il mese sia
            vuoto.
          </p>
          <Button
            onClick={() => {
              void query.refetch();
            }}
            variant="outline"
            className="mt-3"
          >
            Riprova
          </Button>
        </div>
      ) : query.isLoading ? (
        <div
          role="status"
          className="rounded-xl border bg-white p-12 text-center text-sm text-muted-foreground"
        >
          Caricamento delle presenze…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {(
              [
                [
                  Users,
                  "Giornate lavorate",
                  String(summary.lavorate),
                  "Somma delle giornate per persona",
                ],
                [
                  Clock,
                  "Ore registrate",
                  orePresenze(summary.ore),
                  "Dalle presenze HR, non dai rapportini",
                ],
                [
                  CalendarDays,
                  "Giornate di assenza",
                  String(summary.assenze),
                  "Incluse ferie, permessi e malattia",
                ],
                [
                  AlertTriangle,
                  "Da verificare",
                  String(summary.anomalie),
                  "Giornate con anomalie segnalate",
                ],
              ] as const
            ).map(([Icon, label, value, hint]) => (
              <div key={label} className="rounded-xl border bg-white p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      label === "Da verificare"
                        ? "text-orange-500"
                        : "text-blue-600",
                    )}
                  />
                  {label}
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
                  {value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground"
            aria-live="polite"
          >
            <span>
              {hasFilters ? "Risultati filtrati" : "Tutto il personale"} ·{" "}
              {filtered.length}{" "}
              {filtered.length === 1
                ? "giornata registrata"
                : "giornate registrate"}{" "}
              · {personeCount} {personeCount === 1 ? "persona" : "persone"}
            </span>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-7" onClick={reset}>
                Azzera filtri
              </Button>
            )}
          </div>
          {rows.length === 0 && (
            <p className="rounded-lg border border-dashed bg-white p-3 text-sm text-muted-foreground">
              Nessuna presenza HR registrata in questo mese. Le ore dei
              rapportini sono nella vista “Ore per cantiere”.
            </p>
          )}
          {rows.length > 0 && filtered.length === 0 && (
            <p
              role="status"
              className="rounded-lg border border-dashed bg-white p-3 text-sm"
            >
              Nessuna presenza corrisponde ai filtri selezionati.
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border bg-white">
            <div className="min-w-[620px]">
              <div className="grid grid-cols-7 border-b bg-slate-50">
                {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(
                  (d, i) => (
                    <div
                      key={d}
                      className={cn(
                        "py-2 text-center text-xs font-medium",
                        i > 4 ? "text-slate-400" : "text-slate-600",
                      )}
                    >
                      {d}
                    </div>
                  ),
                )}
              </div>
              <div className="grid grid-cols-7">
                {giorni.map((day, i) => {
                  if (!day)
                    return (
                      <div
                        key={`empty-${i}`}
                        aria-hidden="true"
                        className="min-h-[112px] border-b border-r bg-slate-50/50"
                      />
                    );
                  const dayRows = byDay.get(day) ?? [];
                  const counts = new Map<string, number>();
                  for (const g of dayRows)
                    counts.set(g.stato, (counts.get(g.stato) ?? 0) + 1);
                  const entries = [...counts].sort((a, b) => b[1] - a[1]);
                  const daySummary = riepilogoPresenze(dayRows, oggi);
                  return (
                    <button
                      type="button"
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      aria-label={`${nomeData(day)}: ${dayRows.length} ${dayRows.length === 1 ? "presenza" : "presenze"}, ${orePresenze(daySummary.ore)}${daySummary.anomalie ? `, ${daySummary.anomalie} anomalie` : ""}`}
                      className={cn(
                        "flex min-h-[112px] min-w-0 flex-col border-b border-r p-2 text-left transition-colors hover:bg-blue-50/50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                        i % 7 > 4 && "bg-slate-50/50",
                        day === oggi && "bg-blue-50/60",
                      )}
                    >
                      <span className="mb-1 flex w-full items-center justify-between">
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                            day === oggi && "bg-blue-600 text-white",
                          )}
                        >
                          {Number(day.slice(-2))}
                        </span>
                        {daySummary.anomalie > 0 && (
                          <AlertTriangle
                            aria-hidden="true"
                            className="h-3.5 w-3.5 text-orange-500"
                          />
                        )}
                      </span>
                      <span className="w-full space-y-1">
                        {entries.slice(0, 2).map(([key, count]) => (
                          <span
                            key={key}
                            className={cn(
                              "block truncate rounded px-1.5 py-0.5 text-[11px]",
                              statoPresenzaHr(key).className,
                            )}
                          >
                            {count} · {statoPresenzaHr(key).label}
                          </span>
                        ))}
                        {entries.length > 2 && (
                          <span className="block text-[10px] text-muted-foreground">
                            +{entries.length - 2} stati
                          </span>
                        )}
                      </span>
                      {dayRows.length > 0 && (
                        <span className="mt-auto pt-1 text-[11px] font-medium text-slate-600">
                          {orePresenze(daySummary.ore)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            Seleziona un giorno per vedere nomi, orari e dettagli. I riepiloghi
            seguono i filtri; nessun dato mancante viene considerato un’assenza.
          </p>
        </>
      )}
      <Sheet
        open={selectedDay !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
      >
        <SheetContent className="flex w-full flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {selectedDay ? nomeData(selectedDay) : "Presenze del giorno"}
            </SheetTitle>
            <SheetDescription>
              {detail.length} {detail.length === 1 ? "presenza" : "presenze"}
              {hasFilters ? " · con i filtri selezionati" : ""}. Dettagli dal
              registro HR.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {detail.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nessuna presenza registrata per questa giornata
                {hasFilters ? " con questi filtri" : ""}.
              </p>
            ) : (
              detail.map((g) => (
                <article key={g.id} className="space-y-3 rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {g.profilo_nome} {g.profilo_cognome}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {g.profilo_reparto || "Reparto non indicato"}
                        {g.profilo_mansione ? ` · ${g.profilo_mansione}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded px-2 py-1 text-xs",
                        statoPresenzaHr(g.stato).className,
                      )}
                    >
                      {statoPresenzaHr(g.stato).label}
                    </span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Entrata</dt>
                      <dd>{g.prima_entrata?.slice(0, 5) || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Uscita</dt>
                      <dd>{g.ultima_uscita?.slice(0, 5) || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Ore</dt>
                      <dd>{orePresenze(g.ore_lavorate || 0)}</dd>
                    </div>
                  </dl>
                  {giornataDaVerificare(g, oggi) && (
                    <p className="rounded-md bg-orange-50 p-2 text-xs text-orange-800">
                      {g.anomalia_motivo || (g.prima_entrata && !g.ultima_uscita ? "Entrata senza uscita: verifica la giornata" : "Anomalia da verificare")}
                    </p>
                  )}
                  {g.note && (
                    <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {g.note}
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
