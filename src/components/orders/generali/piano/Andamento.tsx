import { useState } from "react";
import {
  ArrowUpRight,
  Camera,
  ChartNoAxesCombined,
  History,
  Landmark,
  Loader2,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogContentOperativo } from "../design/ContestoOperativo";
import { IndicatoreScheda, IntestazioneScheda } from "../design/ElementiScheda";
import { formatCurrency } from "@/lib/formatters";
import { euroSegno, nomeMese, tonoScostamento } from "./formato";
import {
  messaggioPiano,
  useFotografaOra,
  useFotografieGenerale,
} from "@/hooks/useGeneralePiano";
import type { FotografiaPiano } from "@/lib/orders/generali/pianoLettura";
import { asseEuro } from "@/lib/orders/generali/cassaLettura";
import "./cassa-andamento.css";

type Metrica = "margine" | "costi" | "capitale";
export function Andamento({
  generaleId,
  puoModificare,
  onInvestitori,
}: {
  generaleId: string;
  puoModificare: boolean;
  onInvestitori?: (mese?: string) => void;
}) {
  const { data, isLoading, isError, refetch } =
    useFotografieGenerale(generaleId);
  const scatta = useFotografaOra(generaleId);
  const [metrica, setMetrica] = useState<Metrica>("margine");
  const [periodo, setPeriodo] = useState(0);
  const [stato, setStato] = useState("tutte");
  const [aperta, setAperta] = useState<FotografiaPiano | null>(null);
  const foto = [...(data ?? [])].sort((a, b) => a.mese.localeCompare(b.mese));
  const filtrate = foto.filter(
    (f) => stato === "tutte" || f.versioneStato === stato,
  );
  const visibili = periodo ? filtrate.slice(-periodo) : filtrate;
  const ultima = visibili.at(-1);
  const nomi =
    metrica === "capitale"
      ? ["Picco previsto dal piano", "Capitale investito alla rilevazione"]
      : ["Budget previsto", "Stima finale"];
  const dati = visibili.map((f) => ({
    mese: f.mese,
    etichetta: nomeMese(f.mese),
    previsto:
      metrica === "margine"
        ? f.ricaviPrevisti - f.costiPrevisti
        : metrica === "costi"
          ? f.costiPrevisti
          : f.capitaleMassimoPrevisto,
    rilevato:
      metrica === "margine"
        ? f.ricaviStima - f.costiStima
        : metrica === "costi"
          ? f.costiStima
          : f.capitaleInvestito,
  }));
  const azione = puoModificare && (
    <Button
      variant="outline"
      size="sm"
      disabled={scatta.isPending}
      onClick={() =>
        scatta.mutate(undefined, {
          onSuccess: () =>
            toast.success("Fotografia di questo mese aggiornata"),
          onError: (e) => toast.error(messaggioPiano(e, "la fotografia")),
        })
      }
    >
      {scatta.isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Camera className="mr-2 h-4 w-4" />
      )}
      Fotografa adesso
    </Button>
  );
  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (isError)
    return (
      <div role="alert" className="generale-toolbar">
        Non riesco a leggere le fotografie del piano.{" "}
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Riprova
        </Button>
      </div>
    );
  return (
    <section
      className="generale-andamento space-y-4"
      aria-label="Andamento storico del piano"
    >
      <IntestazioneScheda
        icona={History}
        titolo="Andamento dell’operazione"
        descrizione="Fotografie mensili dei valori economici, al netto dell’IVA. Le rilevazioni storiche restano distinte dal piano corrente."
      >
        {azione}
      </IntestazioneScheda>
      {!foto.length ? (
        <div className="generale-panel generale-history-empty">
          <Camera aria-hidden="true" />
          <h3>Lo storico parte dalla prima fotografia</h3>
          <p>
            L’ultimo giorno di ogni mese viene rilevato il piano. Puoi
            aggiornare la fotografia del mese corrente con «Fotografa adesso»; i
            valori correnti non vengono trasformati in rilevazioni dei mesi
            passati.
          </p>
          {onInvestitori && (
            <Button variant="outline" onClick={() => onInvestitori()}>
              Apri fonti e investitori
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="generale-toolbar generale-history-filters">
            <label>
              Rilevazioni
              <select
                aria-label="Periodo dell’andamento"
                value={periodo}
                onChange={(e) => setPeriodo(Number(e.target.value))}
              >
                <option value={0}>Tutto lo storico</option>
                <option value={6}>Ultime 6 rilevazioni</option>
                <option value={12}>Ultime 12 rilevazioni</option>
              </select>
            </label>
            <label>
              Versione fotografata
              <select
                aria-label="Stato delle fotografie"
                value={stato}
                onChange={(e) => setStato(e.target.value)}
              >
                <option value="tutte">Tutte le versioni</option>
                <option value="approvata">Solo approvate</option>
                <option value="bozza">Solo bozze</option>
              </select>
            </label>
            <span>
              {visibili.length} di {foto.length}{" "}
              {foto.length === 1 ? "fotografia" : "fotografie"} · valori del
              periodo selezionato
            </span>
          </div>
          {ultima ? (
            <>
              <p className="generale-history-date">
                Ultima fotografia in vista:{" "}
                <strong>{nomeMese(ultima.mese)}</strong> · versione{" "}
                {ultima.versioneNumero ?? "non indicata"}{" "}
                {ultima.versioneStato ?? ""}
              </p>
              <div
                className="generale-indicators"
                aria-label="Valori dell’ultima fotografia in vista"
              >
                <IndicatoreScheda
                  titolo="Margine stimato nella fotografia"
                  valore={formatCurrency(
                    ultima.ricaviStima - ultima.costiStima,
                  )}
                  tono={
                    ultima.ricaviStima < ultima.costiStima ? "rosso" : "verde"
                  }
                />
                <IndicatoreScheda
                  titolo="Scostamento dal budget del mese"
                  tono={
                    ultima.ricaviStima - ultima.costiStima <
                    ultima.ricaviPrevisti - ultima.costiPrevisti
                      ? "rosso"
                      : "blu"
                  }
                  valore={euroSegno(
                    ultima.ricaviStima -
                      ultima.costiStima -
                      ultima.ricaviPrevisti +
                      ultima.costiPrevisti,
                  )}
                  nota="stima finale meno margine previsto"
                />
                <IndicatoreScheda
                  titolo="Costi registrati alla rilevazione"
                  valore={formatCurrency(ultima.costiReali)}
                />
                <IndicatoreScheda
                  titolo="Capitale investito alla rilevazione"
                  valore={formatCurrency(ultima.capitaleInvestito)}
                  nota="base economica: costi registrati meno incassi"
                />
              </div>
              <div className="generale-panel">
                <header className="generale-panel-heading">
                  <div className="generale-panel-title">
                    <span className="generale-section-icon">
                      <ChartNoAxesCombined aria-hidden="true" />
                    </span>
                    <div>
                      <h3 id="andamento-titolo">
                        Come cambia{" "}
                        {metrica === "margine"
                          ? "il margine"
                          : metrica === "costi"
                            ? "la stima dei costi"
                            : "il capitale"}
                      </h3>
                      <p>
                        {nomi[0]} e {nomi[1].toLowerCase()}
                      </p>
                    </div>
                  </div>
                  <div
                    className="generale-segmented"
                    role="group"
                    aria-label="Metrica dell’andamento"
                  >
                    {(
                      [
                        ["margine", "Margine"],
                        ["costi", "Costi"],
                        ["capitale", "Capitale"],
                      ] as const
                    ).map(([id, nome]) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={metrica === id}
                        onClick={() => setMetrica(id)}
                      >
                        {nome}
                      </button>
                    ))}
                  </div>
                </header>
                <div className="generale-cash-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={dati}
                      margin={{ top: 16, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="hsl(var(--border))"
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="etichetta"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                      />
                      <YAxis
                        tickFormatter={asseEuro}
                        tickLine={false}
                        axisLine={false}
                        fontSize={10}
                        width={64}
                      />
                      <ReferenceLine
                        y={0}
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <Tooltip
                        formatter={(v, n) => [
                          formatCurrency(Number(v)),
                          n === "previsto" ? nomi[0] : nomi[1],
                        ]}
                      />
                      <Line
                        isAnimationActive={false}
                        dataKey="previsto"
                        stroke="#94a3b8"
                        strokeDasharray="5 4"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        isAnimationActive={false}
                        dataKey="rilevato"
                        stroke="rgb(var(--brand-primary, 37 99 235))"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <footer className="generale-panel-footer">
                  <span>
                    {visibili.length === 1
                      ? "Una sola fotografia: il grafico mostra un punto, non una tendenza. "
                      : ""}
                    Il capitale investito è distinto dal capitale versato dalle
                    fonti e dal saldo bancario.
                  </span>
                </footer>
              </div>
              <div className="generale-panel generale-cash-table">
                <table aria-label="Fotografie mensili del piano">
                  <thead>
                    <tr>
                      {[
                        "Mese e versione",
                        "Margine previsto",
                        "Margine stimato",
                        "Scostamento",
                        "Costi registrati",
                        "Capitale investito",
                      ].map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...visibili].reverse().map((f) => (
                      <tr key={f.mese}>
                        <th scope="row">
                          <button
                            type="button"
                            className="generale-legend-link"
                            aria-label={`Apri fotografia di ${nomeMese(f.mese)}`}
                            onClick={() => setAperta(f)}
                          >
                            {nomeMese(f.mese)}{" "}
                            <ArrowUpRight aria-hidden="true" />
                          </button>
                          <small className="generale-history-meta">
                            v{f.versioneNumero ?? "—"} ·{" "}
                            {f.versioneStato ?? "stato non indicato"} ·{" "}
                            {f.origine === "manuale" ? "manuale" : "automatica"}
                          </small>
                        </th>
                        <td>
                          {formatCurrency(f.ricaviPrevisti - f.costiPrevisti)}
                        </td>
                        <td>{formatCurrency(f.ricaviStima - f.costiStima)}</td>
                        <td
                          className={tonoScostamento(
                            f.ricaviStima -
                              f.costiStima -
                              f.ricaviPrevisti +
                              f.costiPrevisti,
                            "margine",
                          )}
                        >
                          {euroSegno(
                            f.ricaviStima -
                              f.costiStima -
                              f.ricaviPrevisti +
                              f.costiPrevisti,
                          )}
                        </td>
                        <td>{formatCurrency(f.costiReali)}</td>
                        <td>{formatCurrency(f.capitaleInvestito)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {onInvestitori && (
                <div className="generale-toolbar generale-history-link">
                  <Landmark aria-hidden="true" />
                  <div>
                    <strong>Dal periodo al rendiconto investitori</strong>
                    <p>
                      Apri il rendiconto di {nomeMese(ultima.mese)} con i
                      controlli di completezza della fotografia.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => onInvestitori(ultima.mese)}
                  >
                    Rendiconto del periodo{" "}
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p role="status" className="generale-toolbar">
              Nessuna fotografia corrisponde ai filtri selezionati.
            </p>
          )}
        </>
      )}
      <Dialog
        open={!!aperta}
        onOpenChange={(o) => {
          if (!o) setAperta(null);
        }}
      >
        <DialogContentOperativo className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fotografia di {nomeMese(aperta?.mese)}</DialogTitle>
            <DialogDescription>
              Valori rilevati nel periodo, al netto dell’IVA. Versione{" "}
              {aperta?.versioneNumero ?? "non indicata"} ·{" "}
              {aperta?.versioneStato ?? "stato non indicato"}.
            </DialogDescription>
          </DialogHeader>
          {aperta && (
            <>
              <div className="generale-cash-table">
                <table aria-label="Dettaglio della fotografia">
                  <thead>
                    <tr>
                      <th>Valore</th>
                      <th>Budget</th>
                      <th>Stima finale</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Ricavi</th>
                      <td>{formatCurrency(aperta.ricaviPrevisti)}</td>
                      <td>{formatCurrency(aperta.ricaviStima)}</td>
                    </tr>
                    <tr>
                      <th>Costi</th>
                      <td>{formatCurrency(aperta.costiPrevisti)}</td>
                      <td>{formatCurrency(aperta.costiStima)}</td>
                    </tr>
                    <tr>
                      <th>Margine</th>
                      <td>
                        {formatCurrency(
                          aperta.ricaviPrevisti - aperta.costiPrevisti,
                        )}
                      </td>
                      <td>
                        {formatCurrency(aperta.ricaviStima - aperta.costiStima)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {onInvestitori && (
                <Button
                  variant="outline"
                  onClick={() => onInvestitori(aperta.mese)}
                >
                  Apri rendiconto investitori di {nomeMese(aperta.mese)}
                </Button>
              )}
            </>
          )}
        </DialogContentOperativo>
      </Dialog>
    </section>
  );
}
