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

export function CassaScadenze({
  riepilogo,
  onInvestitori,
  onPagamenti,
}: {
  riepilogo: RiepilogoGenerale;
  onInvestitori?: () => void;
  onPagamenti?: () => void;
}) {
  const q = useCassaOperazione(riepilogo);
  const movimenti = useMovimentiFonti(
    riepilogo.generale.id,
    riepilogo.permessi.margini,
  );
  const [ritardo, setRitardo] = useState(0);
  const [base, setBase] = useState<BaseCassa>("registrati");
  const [periodo, setPeriodo] = useState<PeriodoCassa>("tutto");
  if (q.isError || movimenti.isError)
    return (
      <div role="alert" className="generale-toolbar">
        Scadenze effettive non disponibili.{" "}
        <Button
          variant="link"
          onClick={() => {
            void q.refetch();
            void movimenti.refetch();
          }}
        >
          Riprova
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
            <h2 id="cassa-scadenze">Incassi, pagamenti e scadenze effettive</h2>
            <p>
              Generale e commesse collegate · importi dei movimenti con IVA
              inclusa
            </p>
          </div>
        </div>
        {onPagamenti && (
          <Button variant="outline" size="sm" onClick={onPagamenti}>
            Apri i pagamenti <ArrowUpRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </header>
      <div
        className="generale-indicators"
        aria-label="Cassa registrata dell’intera operazione"
      >
        <IndicatoreScheda
          titolo="Incassato in prima nota"
          valore={formatCurrency(somma("incassato"))}
          tono="verde"
          nota="entrate registrate alla data del movimento"
        />
        <IndicatoreScheda
          titolo="Pagato in prima nota"
          valore={formatCurrency(somma("pagato"))}
          tono="ambra"
          nota="uscite registrate, IVA già compresa"
        />
        <IndicatoreScheda
          titolo="Flusso netto registrato"
          valore={formatCurrency(somma("incassato") - somma("pagato"))}
          tono={somma("incassato") < somma("pagato") ? "rosso" : "blu"}
          nota="prima nota, con fonti nel prospetto dedicato; non è un saldo bancario"
        />
        <IndicatoreScheda
          titolo="Fabbisogno residuo da scadenze"
          valore={
            incompleta ? "Da completare" : formatCurrency(c.fabbisogno / 100)
          }
          nota="solo scadenze aperte, partendo da zero; i costi non ancora ordinati sono nel piano"
        />
      </div>
      {incompleta && (
        <p role="status" className="generale-cash-notice">
          Lettura parziale: movimenti senza data {c.senzaData}, possibili
          duplicati esclusi {c.daRiconciliare}. {q.avvisi.join("; ")}
        </p>
      )}
      <div className="generale-panel">
        <header className="generale-panel-heading">
          <div className="generale-panel-title">
            <span className="generale-section-icon">
              <ArrowDownLeft aria-hidden="true" />
            </span>
            <div>
              <h3>Movimenti nel tempo</h3>
              <p>
                Il grafico e la tabella seguono il periodo; i quattro riepiloghi
                sopra restano sull’intera operazione.
              </p>
            </div>
          </div>
          <div
            className="generale-segmented"
            role="group"
            aria-label="Base dei movimenti di cassa"
          >
            <button
              type="button"
              aria-pressed={base === "registrati"}
              onClick={() => setBase("registrati")}
            >
              Registrati
            </button>
            <button
              type="button"
              aria-pressed={base === "attesi"}
              onClick={() => setBase("attesi")}
            >
              Ancora attesi
            </button>
          </div>
        </header>
        <div className="generale-cash-toolbar">
          <label>
            Periodo
            <select
              aria-label="Periodo cassa effettiva"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as PeriodoCassa)}
            >
              <option value="tutto">Intera operazione</option>
              <option value="passato">Mesi precedenti</option>
              <option value="futuro">Da questo mese</option>
            </select>
          </label>
          <label>
            Simula ritardo degli incassi attesi
            <select
              aria-label="Ritardo incassi effettivi"
              value={ritardo}
              onChange={(e) => {
                setRitardo(Number(e.target.value));
                setBase("attesi");
              }}
            >
              {[0, 1, 2, 3, 6, 12].map((m) => (
                <option key={m} value={m}>
                  {m} mesi
                </option>
              ))}
            </select>
          </label>
          {ritardo > 0 && (
            <button
              type="button"
              className="generale-legend-link"
              onClick={() => setRitardo(0)}
            >
              Azzera ritardo
            </button>
          )}
        </div>
        <div className="generale-cash-caption">
          <span className="generale-cash-in">
            Entrate {formatCurrency(punti.reduce((s, p) => s + p.entrate, 0))}
          </span>
          <span className="generale-cash-out">
            Uscite {formatCurrency(punti.reduce((s, p) => s + p.pagamenti, 0))}
          </span>
          <span>Linea blu: flusso cumulato della base selezionata</span>
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
                      entrate: "Entrate",
                      uscite: "Uscite",
                      cumulato: "Flusso cumulato",
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
            Nessun mese nel periodo selezionato.
          </p>
        )}
        <div className="generale-cash-table">
          <table aria-label="Movimenti di cassa per mese">
            <thead>
              <tr>
                {[
                  "Mese",
                  base === "registrati" ? "Incassato" : "Incassi attesi",
                  base === "registrati" ? "Pagato" : "Uscite attese",
                  "Flusso del mese",
                  "Flusso cumulato",
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
              ? "Prima nota alla data del pagamento. Il cumulato conserva i mesi precedenti al filtro."
              : "Solo incassi e uscite ancora attesi alle scadenze conosciute, distinti dal budget completo."}{" "}
            Gli importi con IVA non si sommano ai costi netti del piano.
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
              <h3 id="cassa-fonti">Capitale e investitori</h3>
              <p>
                Movimenti delle fonti, separati dai ricavi e dai costi
                dell’operazione
              </p>
            </div>
          </div>
          {onInvestitori && (
            <Button variant="outline" size="sm" onClick={onInvestitori}>
              Apri fonti e investitori <ArrowUpRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </header>
        <div className="generale-cash-funding">
          <div>
            <span>Capitale versato</span>
            <strong>{formatCurrency(somma("versato"))}</strong>
          </div>
          <div>
            <span>Capitale rimborsato</span>
            <strong>{formatCurrency(somma("rimborsato"))}</strong>
          </div>
          <div>
            <span>Versamenti ancora attesi</span>
            <strong>{formatCurrency(somma("capitaleAtteso"))}</strong>
          </div>
          <div>
            <span>Interessi, spese e utili pagati</span>
            <strong>{formatCurrency(somma("oneriFinanziari"))}</strong>
          </div>
        </div>
        <details className="generale-cash-funding-detail">
          <summary>Calendario delle fonti</summary>
          <div className="generale-cash-table">
            <table aria-label="Movimenti delle fonti per mese">
              <thead>
                <tr>
                  {[
                    "Mese",
                    "Versato",
                    "Rimborsato",
                    "Oneri e utili",
                    "Capitale atteso",
                    "Rimborsi attesi",
                    "Oneri e utili attesi",
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
            I versamenti possono essere già presenti in prima nota: questo
            prospetto li descrive senza aggiungerli di nuovo al flusso. Gli
            accolli non generano cassa.
          </span>
        </footer>
      </section>
    </section>
  );
}
