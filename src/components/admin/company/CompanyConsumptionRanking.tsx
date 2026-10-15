import { useMemo, useState } from "react";
import { ArrowDownToLine, Database, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompanyDatabaseFootprint } from "@/hooks/useCompanyDatabaseFootprint";
import {
  bytesLabel,
  consumptionCsv,
  consumptionRanking,
  consumptionShareLabel,
  footprintCoverage,
  type ConsumptionMetric,
} from "@/lib/companyConsumption";
import { euro, type EconomicsReport } from "@/lib/companyEconomics";
const metrics: { id: ConsumptionMetric; label: string; quality: string }[] = [
  {
    id: "cost",
    label: "Costi registrati",
    quality: "Registri · possibili stime",
  },
  { id: "files", label: "File e backup", quality: "Misurati dai metadati" },
  {
    id: "database",
    label: "Spazio DB stimato",
    quality: "Stima per numero di record",
  },
  {
    id: "records",
    label: "Record DB",
    quality: "Conteggi reali · copertura parziale",
  },
];
const number = (v: number | null) =>
  v === null ? "Non disponibile" : v.toLocaleString("it-IT");
const timestamp = (v: string) =>
  new Date(v).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    dateStyle: "short",
    timeStyle: "short",
  });
export function CompanyConsumptionRanking({
  data,
  companyId,
}: {
  data: EconomicsReport;
  companyId: string;
}) {
  const [metric, setMetric] = useState<ConsumptionMetric>("cost");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const dbMode = metric === "database" || metric === "records";
  const database = useCompanyDatabaseFootprint(dbMode);
  const ranked = useMemo(
    () => consumptionRanking(data, database.data, metric),
    [data, database.data, metric],
  );
  const filtered = ranked.filter((r) =>
    r.company.name
      .toLocaleLowerCase("it")
      .includes(search.trim().toLocaleLowerCase("it")),
  );
  const visible = showAll || search.trim() ? filtered : filtered.slice(0, 8);
  const descriptor = metrics.find((m) => m.id === metric)!;
  const coverage = database.data
    ? footprintCoverage(
        database.data,
        data.companies.map((c) => c.id),
      )
    : null;
  const unassignedFiles = data.storage
    .filter(
      (s) =>
        !s.company_id || !data.companies.some((c) => c.id === s.company_id),
    )
    .reduce((s, r) => s + r.bytes, 0);
  const formatValue = (value: number | null) =>
    metric === "cost"
      ? euro(value)
      : metric === "records"
        ? number(value)
        : bytesLabel(value);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([consumptionCsv(data, database.data, metric)], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `classifica-consumi-${metric}-${data.measured_at.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section
      id="classifica-consumi"
      className="economics-card consumption-ranking"
      aria-labelledby="consumption-heading"
    >
      <header>
        <div>
          <div className="economics-eyebrow">
            <Database size={14} /> Confronto della piattaforma
          </div>
          <h3 id="consumption-heading">Classifica dei consumi</h3>
          <p>
            Chi genera costi e occupa spazio. Ogni classifica usa un indicatore
            distinto; lo spazio non misura la lentezza delle query.
          </p>
        </div>
        <Button variant="outline" onClick={download}>
          <ArrowDownToLine size={15} /> Esporta classifica
        </Button>
      </header>
      <div
        className="consumption-metrics"
        role="group"
        aria-label="Indicatore della classifica"
      >
        {metrics.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={metric === m.id}
            onClick={() => {
              setMetric(m.id);
              setShowAll(false);
            }}
          >
            <strong>{m.label}</strong>
            <span>{m.quality}</span>
          </button>
        ))}
      </div>
      <div className="consumption-explanation" role="note">
        <Info size={17} />
        <div>
          <strong>
            {metric === "cost"
              ? "Costi diretti, con stime segnalate"
              : metric === "files"
                ? "Spazio file misurato, backup inclusi"
                : metric === "records"
                  ? "Record contati nelle tabelle analizzate"
                  : "Spazio database attribuito per proporzione"}
          </strong>
          <p>
            {metric === "cost"
              ? "Ordine per importi nei registri, incluse le stime segnalate. Quota comune mostrata a parte: non è consumo misurato. Costi non rilevati esclusi, non considerati gratuiti."
              : metric === "files"
                ? "Somma delle dimensioni nei metadati dei file attribuiti all’azienda. È spazio occupato, non traffico di download né costo di Storage fatturato."
                : metric === "records"
                  ? "Numero reale di righe con company_id nelle tabelle rilevate, alla data indicata. Non è il numero di query né una misura di CPU."
                  : "Per ogni tabella: dimensione fisica, inclusi indici, moltiplicata per la quota di record dell’azienda. È una stima: le righe possono avere dimensioni diverse. Non modifica la ripartizione dei costi."}
          </p>
          <p className="consumption-query-warning">
            <strong>Tempi SQL e CPU per azienda: non disponibili.</strong> Con
            questi dati non si può stabilire chi rallenta il database.
          </p>
        </div>
      </div>
      <div className="consumption-source">
        <span>
          {dbMode
            ? `Database: ${database.data ? timestamp(database.data.measured_at) : "rilevazione non disponibile"}`
            : metric === "files"
              ? `File: ${timestamp(data.storage_measured_at ?? data.measured_at)}`
              : `Costi: ${timestamp(data.measured_at)} · dal ${timestamp(data.period_start)}`}
        </span>
        {dbMode && (
          <Button
            variant="outline"
            size="sm"
            disabled={database.isFetching}
            onClick={() => void database.refetch()}
          >
            <RefreshCw size={14} />
            {database.isFetching ? "Rilevazione…" : "Rileva database"}
          </Button>
        )}
      </div>
      {dbMode && database.isLoading ? (
        <p role="status" className="economics-empty">
          Rilevazione delle tabelle principali…
        </p>
      ) : dbMode &&
        (database.isError || !database.data || !database.data.tables.length) ? (
        <div role="alert" className="economics-empty">
          <strong>Classifica database non disponibile</strong>
          <p>
            {database.error instanceof Error
              ? database.error.message
              : "Manca una rilevazione valida delle tabelle. Nessun valore viene sostituito con zero."}
          </p>
        </div>
      ) : (
        <>
          {dbMode && coverage && database.data && (
            <div className="consumption-coverage">
              <strong>
                Copertura: {database.data.tables.length} di{" "}
                {database.data.eligible_tables} tabelle con azienda
              </strong>
              <span>
                {bytesLabel(coverage.coveredBytes)} di tabelle analizzate ·{" "}
                {coverage.databasePercent?.toLocaleString("it-IT", {
                  maximumFractionDigits: 1,
                }) ?? "—"}
                % del database complessivo. Fuori dal confronto: altre tabelle,
                dati condivisi e spazio di sistema.
              </span>
              <span>
                Non attribuiti o fuori elenco:{" "}
                {number(coverage.unassignedRecords)} record ·{" "}
                {bytesLabel(coverage.unassignedBytes)} stimati. Non vengono
                distribuiti ai clienti.
              </span>
            </div>
          )}
          {metric === "files" && (
            <p className="consumption-scope">
              Non attribuiti o fuori elenco: {bytesLabel(unassignedFiles)} di
              file, esclusi dalle quote della classifica.
            </p>
          )}
          <div className="economics-filters">
            <Input
              aria-label="Cerca azienda nella classifica consumi"
              placeholder="Cerca nella classifica…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span>
              {filtered.length} di {data.companies.length} aziende · posizioni e
              quote sull’elenco completo
            </span>
          </div>
          <p className="consumption-mobile-hint">
            Scorri la tabella lateralmente per leggere tutte le colonne.
          </p>
          <div
            className="economics-table-scroll"
            role="region"
            aria-label="Tabella classifica consumi"
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                Classifica consumi: {descriptor.label}
              </caption>
              <thead>
                <tr>
                  <th>Posizione · Azienda</th>
                  <th>{descriptor.label}</th>
                  <th>Quota dell’indicatore</th>
                  <th>
                    {metric === "cost"
                      ? "Quota comune stimata"
                      : "Qualità e limiti"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.company.id}
                    className={
                      r.company.id === companyId
                        ? "economics-selected-row"
                        : undefined
                    }
                  >
                    <td>
                      <div className="consumption-company">
                        <span className="consumption-rank">
                          {r.rank ?? "—"}
                        </span>
                        <div>
                          <strong>{r.company.name}</strong>
                          <small>
                            {!r.company.plan_name
                              ? "Ambiente interno / piano assente"
                              : r.mrr === null
                                ? "Canone non disponibile"
                                : r.mrr === 0
                                  ? "Non pagante"
                                  : "Canone attivo"}
                            {r.company.id === companyId
                              ? " · Azienda aperta"
                              : ""}
                          </small>
                        </div>
                      </div>
                      <details>
                        <summary>Origine dei consumi</summary>
                        {dbMode ? (
                          r.tables
                            .filter((t) => t.records > 0)
                            .sort((a, b) => b.records - a.records)
                            .map((t) => (
                              <p key={t.name}>
                                <code>{t.name}</code>: {number(t.records)}{" "}
                                record · {bytesLabel(t.estimatedBytes)} stimati
                              </p>
                            ))
                        ) : metric === "files" ? (
                          <p>
                            {r.storage
                              ? `${number(r.storage.files)} file · backup ${bytesLabel(r.storage.exports_bytes)}`
                              : "Nessuna misura attribuita disponibile."}
                          </p>
                        ) : (
                          <>
                            <p>
                              Quota comune e cambio valuta stimati, esclusi
                              dall’ordinamento. Totale parziale con quota:{" "}
                              {euro(r.knownCost)}.
                            </p>
                            {r.rows.map((c) => (
                              <p key={c.kind}>
                                {c.kind.toUpperCase()}: {euro(c.recorded_eur)} ·{" "}
                                {c.events} operazioni
                                {c.estimated_events
                                  ? ` · ${c.estimated_events} con costo stimato`
                                  : ""}
                                {c.missing_events
                                  ? ` · ${c.missing_events} costi mancanti`
                                  : ""}
                              </p>
                            ))}
                            {!r.rows.length && (
                              <p>
                                Nessuna attività nei registri collegati; gli
                                altri servizi restano da riconciliare.
                              </p>
                            )}
                          </>
                        )}
                      </details>
                    </td>
                    <td>
                      <strong>{formatValue(r.value)}</strong>
                      <small>
                        {metric === "cost"
                          ? r.value === null
                            ? "Costi non misurati"
                            : r.estimated
                              ? `Include stime per ${r.estimated} ${r.estimated === 1 ? "operazione" : "operazioni"}`
                              : "Nessuna stima segnalata nei registri"
                          : metric === "database"
                            ? "Stima · non spazio fisico del cliente"
                            : r.value === null
                              ? "Nessuna misura"
                              : "Misurato · perimetro indicato"}
                      </small>
                    </td>
                    <td>
                      <span>{consumptionShareLabel(r.share)}</span>
                      <div className="consumption-share" aria-hidden="true">
                        <i style={{ width: `${r.share ?? 0}%` }} />
                      </div>
                      <small>
                        {metric === "cost"
                          ? "Dei costi registrati in elenco"
                          : metric === "files"
                            ? "Dei file attribuiti in elenco"
                            : "Nelle tabelle rilevate, aziende in elenco"}
                      </small>
                    </td>
                    <td>
                      {metric === "cost" ? (
                        <>
                          <strong>{euro(r.shared)}</strong>
                          <small>
                            Riparto uniforme 1/{r.denominator} · escluso dalla
                            quota
                          </small>
                          <small>
                            {r.missing
                              ? `${r.missing} ${r.missing === 1 ? "costo non misurato" : "costi non misurati"}`
                              : "Copertura servizi parziale"}
                          </small>
                        </>
                      ) : (
                        <>
                          <span className="economics-pill">
                            {r.value === null
                              ? "Non disponibile"
                              : metric === "database"
                                ? "Stimato"
                                : "Misurato"}
                          </span>
                          <small>
                            {dbMode
                              ? "Tempi query non disponibili"
                              : "Traffico download non misurato"}
                          </small>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <p className="economics-empty">
                Nessuna azienda corrisponde alla ricerca.
              </p>
            )}
          </div>
          {!search.trim() && filtered.length > 8 && (
            <div className="consumption-more">
              <Button variant="outline" onClick={() => setShowAll((v) => !v)}>
                {showAll
                  ? "Mostra le prime 8"
                  : `Mostra tutte le ${filtered.length} aziende`}
              </Button>
            </div>
          )}
        </>
      )}
      <details className="economics-method">
        <summary>Fonti, copertura e significato della classifica</summary>
        <p>
          Le quote e le posizioni sono calcolate sulle {data.companies.length}{" "}
          aziende e ambienti della rilevazione economica, inclusi gratuiti e
          sospesi; la ricerca non cambia il denominatore. Valori uguali hanno la
          stessa posizione. L’esportazione include tutte le aziende, anche se
          l’elenco è filtrato.
        </p>
        <p>
          Costi riferiti al ciclo; file e record sono fotografie dello spazio e
          dei dati esistenti, non consumi del solo ciclo. I tre orari di
          rilevazione possono differire. Le stime di spazio database non vengono
          convertite in addebiti né sommate ai costi.
        </p>
        {database.data && (
          <>
            <p>
              Tabelle con company_id UUID analizzate, selezionate tra le 12 più
              grandi per dimensione fisica. Misura database:{" "}
              {timestamp(database.data.measured_at)}. I conteggi includono tutte
              le righe presenti, anche archiviate.
            </p>
            {database.data.tables.map((t) => (
              <p key={t.name}>
                <code>{t.name}</code> · {bytesLabel(t.total_bytes)} misurati ·{" "}
                {number(t.companies.reduce((s, c) => s + c.records, 0))} record
                contati
              </p>
            ))}
          </>
        )}
        <p>
          Per attribuire rallentamenti servono tempi delle richieste correlati
          all’azienda e una misura sul database. La sola durata di una chiamata
          AI o di una pagina non misura il tempo SQL.
        </p>
      </details>
    </section>
  );
}
