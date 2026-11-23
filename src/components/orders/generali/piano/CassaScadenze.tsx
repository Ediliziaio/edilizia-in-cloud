import { UniformSelect } from "@/components/ui/uniform-select";
import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Landmark, Wallet } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCassaOperazione } from "@/hooks/useCassaOperazione";
import { useMovimentiFonti } from "@/hooks/useGeneraleInvestitori";
import { cassaOperazione } from "@/lib/orders/generali/cassaOperazione";
import {
  asseEuro,
  nelPeriodoCassa,
  serieCassaEffettiva,
  sommaMesi,
  type BaseCassa,
  type PeriodoCassa,
} from "@/lib/orders/generali/cassaLettura";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IndicatoreScheda } from "../design/ElementiScheda";
import { formatCurrency } from "@/lib/formatters";
import { nomeMese } from "./formato";
import { dayKey } from "@/lib/finance/forecastLedger";
import "./cassa-andamento.css";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function CassaScadenze({
  riepilogo,
  onInvestitori,
  onPagamenti,
  onPriorita,
  baseIniziale = "registrati",
  periodoIniziale = "tutto",
}: {
  riepilogo: RiepilogoGenerale;
  onInvestitori?: () => void;
  onPagamenti?: () => void;
  onPriorita?: () => void;
  baseIniziale?: BaseCassa;
  periodoIniziale?: PeriodoCassa;
}) {
  const t = useT();
  const q = useCassaOperazione(riepilogo);
  const movimenti = useMovimentiFonti(
    riepilogo.generale.id,
    riepilogo.permessi.margini,
  );
  const [ritardo, setRitardo] = useState(0);
  const [base, setBase] = useState<BaseCassa>(baseIniziale);
  const [periodo, setPeriodo] = useState<PeriodoCassa>(periodoIniziale);
  if (q.isError || movimenti.isError)
    return (
      <div role="alert" className="generale-toolbar">
        {t("Scadenze effettive non disponibili.")}{" "}
        <Button
          variant="link"
          onClick={() => {
            void q.refetch();
            void movimenti.refetch();
          }}
        >
          {t("Riprova")}
        </Button>
      </div>
    );
  if (q.isLoading || movimenti.isLoading)
    return <Skeleton className="h-40 w-full" />;
  const oggi = dayKey(new Date());
  const c = cassaOperazione({
    oggi,
    registrati: q.registrati,
    previsti: q.previsti,
    movimenti: movimenti.data ?? [],
    ritardoMesi: ritardo,
  });
  const somma = (chiave: Parameters<typeof sommaMesi>[1]) =>
    sommaMesi(c.righe, chiave) / 100;
  const incompleta = !!(c.senzaData || c.daRiconciliare || q.avvisi.length);
  const punti = serieCassaEffettiva(c.righe, base).filter((r) =>
    nelPeriodoCassa(r.mese, periodo, oggi),
  );
  return (
    <section
      aria-labelledby="cassa-scadenze"
      className="generale-cassa-effettiva space-y-4"
    >
      <header className="generale-sheet-header">
        <div className="generale-sheet-title">
          <span className="generale-section-icon">
            <Wallet aria-hidden="true" />
          </span>
          <div>
            <h2 id="cassa-scadenze">{t("Incassi, pagamenti e scadenze effettive")}</h2>
            <p>
              {t("Generale e commesse collegate · importi dei movimenti con IVA inclusa")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
        {onPriorita && <Button variant="ghost" size="sm" onClick={onPriorita}>
          Priorità di cassa <ArrowUpRight className="size-4" aria-hidden="true" />
        </Button>}
        {onPagamenti && (
          <Button variant="outline" size="sm" onClick={onPagamenti}>
            {t("Apri i pagamenti")} <ArrowUpRight className="ml-2 h-4 w-4" />
          </Button>
        )}
        </div>
      </header>
      <div
        className="generale-indicators"
        aria-label={t("Cassa registrata dell’intera operazione")}
      >
        <IndicatoreScheda
          titolo={t("Incassato in prima nota")}
          valore={formatCurrency(somma("incassato"))}
          tono="verde"
          nota={t("entrate registrate alla data del movimento")}
        />
        <IndicatoreScheda
          titolo={t("Pagato in prima nota")}
          valore={formatCurrency(somma("pagato"))}
          tono="ambra"
          nota={t("uscite registrate, IVA già compresa")}
        />
        <IndicatoreScheda
          titolo={t("Flusso netto registrato")}
          valore={formatCurrency(somma("incassato") - somma("pagato"))}
          tono={somma("incassato") < somma("pagato") ? "rosso" : "blu"}
          nota={t("prima nota, con fonti nel prospetto dedicato; non è un saldo bancario")}
        />
        <IndicatoreScheda
          titolo={t("Fabbisogno residuo da scadenze")}
          valore={
            incompleta ? t("Da completare") : formatCurrency(c.fabbisogno / 100)
          }
          nota={t("solo scadenze aperte, partendo da zero; i costi non ancora ordinati sono nel piano")}
        />
      </div>
      {incompleta && (
        <p role="status" className="generale-cash-notice">
          {t("Lettura parziale: movimenti senza data {senzaData}, possibili duplicati esclusi {daRiconciliare}.", { senzaData: c.senzaData, daRiconciliare: c.daRiconciliare })}{" "}
          {q.avvisi.join("; ")}
        </p>
      )}
      <div className="generale-panel">
        <header className="generale-panel-heading">
          <div className="generale-panel-title">
            <span className="generale-section-icon">
              <ArrowDownLeft aria-hidden="true" />
            </span>
            <div>
              <h3>{t("Movimenti nel tempo")}</h3>
              <p>
                {t("Il grafico e la tabella seguono il periodo; i quattro riepiloghi sopra restano sull’intera operazione.")}
              </p>
            </div>
          </div>
          <div
            className="generale-segmented"
            role="group"
            aria-label={t("Base dei movimenti di cassa")}
          >
            <button
              type="button"
              aria-pressed={base === "registrati"}
              onClick={() => setBase("registrati")}
            >
              {t("Registrati")}
            </button>
            <button
              type="button"
              aria-pressed={base === "attesi"}
              onClick={() => setBase("attesi")}
            >
              {t("Ancora attesi")}
            </button>
          </div>
        </header>
        <div className="generale-cash-toolbar">
          <label>
            {t("Periodo")}
            <UniformSelect
              aria-label={t("Periodo cassa effettiva")}
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as PeriodoCassa)}
            >
              <option value="tutto">{t("Intera operazione")}</option>
              <option value="passato">{t("Mesi precedenti")}</option>
              <option value="futuro">{t("Da questo mese")}</option>
            </UniformSelect>
          </label>
          <label>
            {t("Simula ritardo degli incassi attesi")}
            <UniformSelect
              aria-label={t("Ritardo incassi effettivi")}
              value={ritardo}
              onChange={(e) => {
                setRitardo(Number(e.target.value));
                setBase("attesi");
              }}
            >
              {[0, 1, 2, 3, 6, 12].map((m) => (
                <option key={m} value={m}>
                  {t("{n} mesi", { n: m })}
                </option>
              ))}
            </UniformSelect>
          </label>
          {ritardo > 0 && (
            <button
              type="button"
              className="generale-legend-link"
              onClick={() => setRitardo(0)}
            >
              {t("Azzera ritardo")}
            </button>
          )}
        </div>
        <div className="generale-cash-caption">
          <span className="generale-cash-in">
            {t("Entrate {importo}", { importo: formatCurrency(punti.reduce((s, p) => s + p.entrate, 0)) })}
          </span>
          <span className="generale-cash-out">
            {t("Uscite {importo}", { importo: formatCurrency(punti.reduce((s, p) => s + p.pagamenti, 0)) })}
          </span>
          <span>{t("Linea blu: flusso cumulato della base selezionata")}</span>
        </div>
        {punti.length ? (
          <div className="generale-cash-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={punti.map((p) => ({ ...p, etichetta: nomeMese(p.mese) }))}
                margin={{ top: 10, right: 16, bottom: 0, left: 0 }}
                stackOffset="sign"
              >
                <CartesianGrid
                  vertical={false}
                  stroke="hsl(var(--border))"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="etichetta"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={asseEuro}
                  fontSize={10}
                  width={64}
                  tickLine={false}
                  axisLine={false}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(v, n) => [
                    formatCurrency(Number(v)),
                    {
                      entrate: t("Entrate"),
                      uscite: t("Uscite"),
                      cumulato: t("Flusso cumulato"),
                    }[String(n)] ?? String(n),
                  ]}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="entrate"
                  fill="#059669"
                  stackId="mese"
                  maxBarSize={24}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="uscite"
                  fill="#f43f5e"
                  stackId="mese"
                  maxBarSize={24}
                />
                <Line
                  isAnimationActive={false}
                  dataKey="cumulato"
                  stroke="rgb(var(--brand-primary, 37 99 235))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="generale-chart-empty">
            {t("Nessun mese nel periodo selezionato.")}
          </p>
        )}
        <div className="generale-cash-table">
          <table aria-label={t("Movimenti di cassa per mese")}>
            <thead>
              <tr>
                {[
                  t("Mese"),
                  base === "registrati" ? t("Incassato") : t("Incassi attesi"),
                  base === "registrati" ? t("Pagato") : t("Uscite attese"),
                  t("Flusso del mese"),
                  t("Flusso cumulato"),
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {punti.map((p) => (
                <tr key={p.mese}>
                  <th scope="row">{nomeMese(p.mese)}</th>
                  <td>{formatCurrency(p.entrate)}</td>
                  <td>{formatCurrency(p.pagamenti)}</td>
                  <td>{formatCurrency(p.netto)}</td>
                  <td
                    className={p.cumulato < 0 ? "text-destructive" : undefined}
                  >
                    {formatCurrency(p.cumulato)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="generale-panel-footer">
          <span>
            {base === "registrati"
              ? t("Prima nota alla data del pagamento. Il cumulato conserva i mesi precedenti al filtro.")
              : t("Solo incassi e uscite ancora attesi alle scadenze conosciute, distinti dal budget completo.")}{" "}
            {t("Gli importi con IVA non si sommano ai costi netti del piano.")}
          </span>
        </footer>
      </div>
      <section className="generale-panel" aria-labelledby="cassa-fonti">
        <header className="generale-panel-heading">
          <div className="generale-panel-title">
            <span className="generale-section-icon">
              <Landmark aria-hidden="true" />
            </span>
            <div>
              <h3 id="cassa-fonti">{t("Capitale e investitori")}</h3>
              <p>
                {t("Movimenti delle fonti, separati dai ricavi e dai costi dell’operazione")}
              </p>
            </div>
          </div>
          {onInvestitori && (
            <Button variant="outline" size="sm" onClick={onInvestitori}>
              {t("Apri fonti e investitori")} <ArrowUpRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </header>
        <div className="generale-cash-funding">
          <div>
            <span>{t("Capitale versato")}</span>
            <strong>{formatCurrency(somma("versato"))}</strong>
          </div>
          <div>
            <span>{t("Capitale rimborsato")}</span>
            <strong>{formatCurrency(somma("rimborsato"))}</strong>
          </div>
          <div>
            <span>{t("Versamenti ancora attesi")}</span>
            <strong>{formatCurrency(somma("capitaleAtteso"))}</strong>
          </div>
          <div>
            <span>{t("Interessi, spese e utili pagati")}</span>
            <strong>{formatCurrency(somma("oneriFinanziari"))}</strong>
          </div>
        </div>
        <details className="generale-cash-funding-detail">
          <summary>{t("Calendario delle fonti")}</summary>
          <div className="generale-cash-table">
            <table aria-label={t("Movimenti delle fonti per mese")}>
              <thead>
                <tr>
                  {[
                    t("Mese"),
                    t("Versato"),
                    t("Rimborsato"),
                    t("Oneri e utili"),
                    t("Capitale atteso"),
                    t("Rimborsi attesi"),
                    t("Oneri e utili attesi"),
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.righe.map((m) => (
                  <tr key={m.mese}>
                    <th scope="row">{nomeMese(m.mese)}</th>
                    {[
                      m.versato,
                      m.rimborsato,
                      m.oneriFinanziari,
                      m.capitaleAtteso,
                      m.rimborsiAttesi,
                      m.finanziariAttesi,
                    ].map((n, i) => (
                      <td key={i}>{formatCurrency(n / 100)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <footer className="generale-panel-footer">
          <span>
            {t("I versamenti possono essere già presenti in prima nota: questo prospetto li descrive senza aggiungerli di nuovo al flusso. Gli accolli non generano cassa.")}
          </span>
        </footer>
      </section>
    </section>
  );
}
