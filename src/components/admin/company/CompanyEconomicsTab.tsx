import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  Database,
  Info,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompanyEconomics } from "@/hooks/useCompanyEconomics";
import {
  companyEconomics,
  economicsCsv,
  euro,
  providerPeriodCost,
  type CostKind,
} from "@/lib/companyEconomics";
import { CompanyConsumptionRanking } from "./CompanyConsumptionRanking";
import "./company-economics.css";
const labels: Record<CostKind, string> = {
  ai: "AI · registro principale",
  email: "Email",
  sms: "SMS",
  render: "Render · registro principale",
};
const date = (value: string) =>
  new Date(value).toLocaleDateString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const usd = (value: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD" }).format(
    value,
  );
const size = (value: number | undefined) => {
  if (value == null) return "Non disponibile";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.max(0, Math.floor(Math.log10(value) / 3)),
  );
  return `${(value / 1000 ** index).toLocaleString("it-IT", { maximumFractionDigits: 2 })} ${units[index]}`;
};
export function CompanyEconomicsTab({
  companyId,
  onNavigateToTab,
}: {
  companyId: string;
  onNavigateToTab?: (tab: string) => void;
}) {
  const query = useCompanyEconomics();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("cost");
  const data = query.data;
  const selected = data ? companyEconomics(data, companyId) : null;
  const rows = useMemo(
    () =>
      data?.companies
        .map((c) => companyEconomics(data, c.id)!)
        .filter((r) =>
          r.company.name
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.company.name.localeCompare(b.company.name, "it")
            : sort === "margin"
              ? (a.margin ?? Infinity) - (b.margin ?? Infinity)
              : (b.knownCost ?? -Infinity) - (a.knownCost ?? -Infinity),
        ) ?? [],
    [data, search, sort],
  );
  if (query.isLoading)
    return (
      <section className="company-economics">
        <p role="status">Caricamento dei dati economici…</p>
      </section>
    );
  if (query.isError || !data)
    return (
      <section className="company-economics economics-error" role="alert">
        <AlertCircle />
        <h2>Dati economici non disponibili</h2>
        <p>
          La rilevazione non è stata caricata. Costi e margine restano non
          disponibili.
        </p>
        <p>
          {query.error instanceof Error
            ? query.error.message
            : "Riprova tra qualche istante."}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Riprova
        </Button>
      </section>
    );
  if (!selected)
    return (
      <section className="company-economics economics-error" role="alert">
        <h2>Azienda non presente nella rilevazione</h2>
        <p>
          Potrebbe essere stata creata dopo la verifica dei costi. Aggiorna la
          rilevazione per includerla nel riparto.
        </p>
      </section>
    );
  const unassigned = data.costs.filter(
    (c) =>
      c.company_id === null ||
      !data.companies.some((row) => row.id === c.company_id),
  );
  const unassignedEvents = unassigned.reduce(
    (sum, c) => sum + Number(c.events),
    0,
  );
  const unassignedEur = unassigned.reduce(
    (sum, c) => sum + Number(c.recorded_eur),
    0,
  );
  const unassignedStorage = data.storage
    .filter(
      (s) =>
        s.company_id === null ||
        !data.companies.some((c) => c.id === s.company_id),
    )
    .reduce((sum, s) => sum + Number(s.bytes), 0);
  const stale = Date.now() - new Date(data.measured_at).getTime() > 86400000;
  const exportRows = () => {
    const url = URL.createObjectURL(
      new Blob([economicsCsv(data)], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `economia-aziende-${data.measured_at.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="company-economics">
      <header className="economics-heading">
        <div>
          <div className="economics-eyebrow">
            <ShieldCheck size={14} /> Controllo economico interno
          </div>
          <h2>Costi e margine</h2>
          <p>
            Quanto assorbe {selected.company.name} e quanto resta sul suo
            canone.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw
            size={15}
            className={query.isFetching ? "animate-spin" : ""}
          />{" "}
          Aggiorna dati
        </Button>
      </header>
      <div className="economics-period">
        <span>
          <strong>Ciclo osservato</strong> {date(data.period_start)}{" "}
          <ArrowRight size={12} /> {date(data.period_end)}
        </span>
        <span className={stale ? "economics-stale" : ""}>
          Rilevazione del {date(data.measured_at)} ·{" "}
          {new Date(data.measured_at).toLocaleTimeString("it-IT", {
            timeZone: "Europe/Rome",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {stale ? " · da aggiornare" : ""}
        </span>
      </div>
      <div className="economics-kpis">
        <article>
          <span className="economics-kpi-label">
            Canone effettivo attuale <Building2 size={17} />
          </span>
          <strong>
            {euro(selected.mrr)}
            <small>/mese</small>
          </strong>
          <p>
            {selected.mrr === 0
              ? "Accesso gratuito, prova o azienda non pagante"
              : (selected.company.plan_name ?? "Piano non disponibile")}
          </p>
        </article>
        <article>
          <span className="economics-kpi-label">
            Costi noti nel ciclo <Wallet size={17} />
          </span>
          <strong>{euro(selected.knownCost)}</strong>
          <p>
            Registrati {euro(selected.direct)} · ripartiti{" "}
            {euro(selected.shared)}
          </p>
        </article>
        <article className="economics-margin">
          <span className="economics-kpi-label">
            Margine sul canone <Info size={17} />
          </span>
          <strong>{euro(selected.margin)}</strong>
          <p>
            <span className="economics-pill">Parziale</span> Costi futuri e non
            misurati esclusi
          </p>
        </article>
        <article>
          <span className="economics-kpi-label">
            File e backup attribuiti <Database size={17} />
          </span>
          <strong>{size(selected.storage?.bytes)}</strong>
          <p>
            {selected.storage
              ? `${selected.storage.files.toLocaleString("it-IT")} file · backup ${size(selected.storage.exports_bytes)}`
              : "Nessuna misura disponibile"}
          </p>
        </article>
      </div>
      <div className="economics-notice" role="note">
        <Info size={18} />
        <div>
          <strong>Il margine è provvisorio</strong>
          <p>
            Canone mensile attuale meno costi registrati finora nel ciclo e
            quota comune. Non rappresenta incassi o utile consuntivo. Email a
            costo zero non verificato, WhatsApp, telefonia, firme, commissioni
            di pagamento e render verticali richiedono riconciliazione. Le
            ricariche dei wallet non vengono sommate ai ricavi.
          </p>
        </div>
      </div>
      <CompanyConsumptionRanking data={data} companyId={companyId} />
      <div className="economics-detail-grid">
        <section className="economics-card">
          <header>
            <h3>Da cosa deriva il costo</h3>
            <span className="economics-pill">{selected.company.name}</span>
          </header>
          <div className="economics-cost-list">
            {(Object.keys(labels) as CostKind[]).map((kind) => {
              const row = selected.rows.find((r) => r.kind === kind);
              const missing = Number(row?.missing_events ?? 0);
              return (
                <div className="economics-cost-row" key={kind}>
                  <div>
                    <strong>{labels[kind]}</strong>
                    <span>
                      {row
                        ? `${row.events} operazioni${row.estimated_events ? ` · ${row.estimated_events} con costo stimato` : ""}`
                        : "Nessuna attività nel registro"}
                      {missing ? ` · ${missing} costi non verificati` : ""}
                    </span>
                  </div>
                  <div>
                    <strong>
                      {!row || Number(row.recorded_eur) > 0 || !missing
                        ? euro(Number(row?.recorded_eur ?? 0))
                        : "Non misurato"}
                    </strong>
                    <span className={missing ? "economics-missing" : ""}>
                      {missing
                        ? "Da riconciliare"
                        : row?.estimated_events
                          ? "Include stime"
                          : "Registro"}
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="economics-cost-row economics-shared">
              <div>
                <strong>Quota infrastruttura e domini</strong>
                <span>1/{selected.denominator} dei costi comuni osservati</span>
              </div>
              <div>
                <strong>{euro(selected.shared)}</strong>
                <span>Ripartita · cambio indicativo</span>
              </div>
            </div>
          </div>
          <details className="economics-method">
            <summary>
              Come vengono calcolati i valori <ChevronDown size={14} />
            </summary>
            <p>
              I costi comuni sono divisi uniformemente tra le{" "}
              {selected.denominator} aziende e ambienti presenti alla data della
              rilevazione, inclusi omaggi e sospesi. È un criterio di riparto,
              non una misura del carico del database.
            </p>
            <p>
              I domini annuali sono ripartiti sui giorni trascorsi nel ciclo. Il
              Pro Supabase include una quota anticipata: il costo osservato è
              quanto indicato dal pannello, non un rateo contabile.
            </p>
            <p>
              I costi AI provengono dal registro principale. Il registro
              secondario ({data.legacy_ai.events} eventi,{" "}
              {euro(data.legacy_ai.recorded_eur)}) è escluso dalla somma per
              evitare duplicazioni. I render includono solo il costo API; il
              loro storage rientra già nell’infrastruttura.
            </p>
            <p>
              Le conversioni USD sono indicative, al cambio di riferimento
              riportato nelle fonti. Le previsioni non entrano nel costo
              attuale. Un margine positivo parziale non certifica la
              redditività.
            </p>
          </details>
        </section>
        <section className="economics-card">
          <header>
            <h3>Qualità e attribuzione</h3>
            <span className="economics-pill">Copertura parziale</span>
          </header>
          <div className="economics-quality">
            <CheckCircle2 size={18} />
            <div>
              <strong>Fornitori verificati nei pannelli</strong>
              <p>
                Importi originali in USD, data e fonte consultabili qui sotto.
              </p>
            </div>
          </div>
          <div className="economics-quality">
            <AlertCircle size={18} />
            <div>
              <strong>
                {selected.missing} costi da verificare nell’azienda
              </strong>
              <p>
                Gli importi mancanti non sono trasformati in costi gratuiti.
              </p>
            </div>
          </div>
          <div className="economics-quality">
            <Info size={18} />
            <div>
              <strong>Consumi della piattaforma o non attribuiti</strong>
              <p>
                {unassignedEvents} operazioni · {euro(unassignedEur)}{" "}
                registrati; {size(unassignedStorage)} di file. Restano separati
                dai costi diretti dei clienti.
              </p>
            </div>
          </div>
          {data.database_bytes != null && (
            <div className="economics-quality">
              <Database size={18} />
              <div>
                <strong>Database condiviso: {size(data.database_bytes)}</strong>
                <p>
                  File totali della piattaforma: {size(data.storage_bytes)}.
                  Misura del{" "}
                  {date(data.storage_measured_at ?? data.measured_at)}. I GB del
                  database non sono attribuibili fisicamente a una singola
                  azienda.
                </p>
              </div>
            </div>
          )}
          {onNavigateToTab && (
            <Button
              variant="outline"
              onClick={() => onNavigateToTab("billing")}
            >
              Gestisci crediti e tariffe <ArrowRight size={15} />
            </Button>
          )}
        </section>
      </div>
      <section className="economics-card">
        <header>
          <div>
            <h3>Fatture e rilevazioni dei fornitori</h3>
            <p>
              Importi originali, costo attuale e previsioni separati.
              Rilevazioni verificate manualmente; nessuna sincronizzazione
              automatica delle fatture.
            </p>
          </div>
        </header>
        <div className="economics-table-scroll">
          <table>
            <caption className="sr-only">
              Costi reali verificati dei fornitori della piattaforma
            </caption>
            <thead>
              <tr>
                <th>Fornitore / servizio</th>
                <th>Importo originale</th>
                <th>Nel ciclo a oggi</th>
                <th>Previsione ciclo</th>
                <th>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {data.providers.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.label}</strong>
                    <small>
                      {p.kind === "annual"
                        ? `${date(p.period_start)} – ${date(p.period_end)}`
                        : p.kind === "free"
                          ? "Piano gratuito verificato"
                          : `${date(p.period_start)} – ${date(p.period_end)}`}
                    </small>
                    <details>
                      <summary>Dettagli</summary>
                      <p>{p.note}</p>
                      {p.last_invoice_amount !== null && (
                        <p>
                          Ultima fattura: {usd(p.last_invoice_amount)} ·{" "}
                          {p.last_invoice_date && date(p.last_invoice_date)}
                        </p>
                      )}
                      <p>
                        Cambio di riferimento:{" "}
                        {p.eur_per_unit?.toLocaleString("it-IT", {
                          maximumFractionDigits: 6,
                        })}{" "}
                        EUR per USD · {p.fx_date && date(p.fx_date)} ·
                        conversione indicativa.
                      </p>
                    </details>
                  </td>
                  <td>
                    {p.currency === "USD"
                      ? usd(p.current_amount)
                      : euro(p.current_amount)}
                    <small>
                      {p.kind === "annual"
                        ? "annuale"
                        : p.kind === "free"
                          ? "nessun canone"
                          : "costi correnti del pannello"}
                    </small>
                  </td>
                  <td>
                    {euro(providerPeriodCost(p, data))}
                    <small>
                      {p.kind === "annual"
                        ? "Quota per giorni trascorsi"
                        : "Cambio indicativo"}
                    </small>
                  </td>
                  <td>
                    {euro(providerPeriodCost(p, data, true))}
                    <small>Stima, esclusa dai costi a oggi</small>
                  </td>
                  <td>
                    <a
                      href={p.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Apri fonte ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="economics-card">
        <header>
          <div>
            <h3>Confronta tutte le aziende</h3>
            <p>
              Canone mensile corrente, costi osservati nel ciclo e margine
              parziale per ciascuna azienda.
            </p>
          </div>
          <Button variant="outline" onClick={exportRows}>
            <ArrowDownToLine size={15} /> Esporta CSV
          </Button>
        </header>
        <div className="economics-filters">
          <Input
            aria-label="Cerca azienda nel confronto economico"
            placeholder="Cerca un’azienda…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label>
            Ordina per
            <select
              aria-label="Ordina confronto economico"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="cost">Costo più alto</option>
              <option value="margin">Margine più basso</option>
              <option value="name">Nome azienda</option>
            </select>
          </label>
          <span>
            {rows.length} di {data.companies.length} aziende
          </span>
        </div>
        <div className="economics-table-scroll">
          <table>
            <caption className="sr-only">
              Costi e margine per ogni azienda
            </caption>
            <thead>
              <tr>
                <th>Azienda</th>
                <th>Canone / mese</th>
                <th>Costi registrati</th>
                <th>Quota comune</th>
                <th>Margine parziale</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.company.id}
                  className={
                    r.company.id === companyId ? "economics-selected-row" : ""
                  }
                >
                  <td>
                    <strong>{r.company.name}</strong>
                    <small>
                      {r.company.plan_name ??
                        "Ambiente interno / piano assente"}{" "}
                      · {r.mrr === null ? "Canone non disponibile" : r.mrr === 0 ? "Non pagante" : "Canone attivo"}
                    </small>
                    <details>
                      <summary>Dettaglio costi</summary>
                      {r.rows.map((cost) => (
                        <p key={cost.kind}>
                          {labels[cost.kind]}: {cost.events} operazioni ·{" "}
                          {euro(Number(cost.recorded_eur))}
                          {cost.missing_events ? " · importi mancanti" : ""}
                        </p>
                      ))}
                      {!r.rows.length && (
                        <p>
                          Nessuna attività nei registri collegati. Altri servizi
                          da riconciliare.
                        </p>
                      )}
                      <p>File e backup attribuiti: {size(r.storage?.bytes)}</p>
                    </details>
                  </td>
                  <td>{euro(r.mrr)}</td>
                  <td>
                    {euro(r.direct)}
                    {r.missing > 0 && (
                      <small>{r.missing} costi da verificare</small>
                    )}
                  </td>
                  <td>
                    {euro(r.shared)}
                    <small>1/{r.denominator}</small>
                  </td>
                  <td>
                    <strong>{euro(r.margin)}</strong>
                    <small>Provvisorio · dati parziali</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="economics-empty">
              Nessuna azienda corrisponde alla ricerca.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
