import { UniformSelect } from "@/components/ui/uniform-select";
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";
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
  const t = useT();
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
      ? [t("Picco previsto dal piano"), t("Capitale investito alla rilevazione")]
      : [t("Budget previsto"), t("Stima finale")];
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
            toast.success(t("Fotografia di questo mese aggiornata")),
          onError: (e) => toast.error(messaggioPiano(e, "la fotografia")),
        })
      }
    >
      {scatta.isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Camera className="mr-2 h-4 w-4" />
      )}
      {t("Fotografa adesso")}
    </Button>
  );
  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (isError)
    return (
      <div role="alert" className="generale-toolbar">
        {t("Non riesco a leggere le fotografie del piano.")}{" "}
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          {t("Riprova")}
        </Button>
      </div>
    );
  return (
    <section
      className="generale-andamento space-y-4"
      aria-label={t("Andamento storico del piano")}
    >
      <IntestazioneScheda
        icona={History}
        titolo={t("Andamento dell’operazione")}
        descrizione={t("Fotografie mensili dei valori economici, al netto dell’IVA. Le rilevazioni storiche restano distinte dal piano corrente.")}
      >
        {azione}
      </IntestazioneScheda>
      {!foto.length ? (
        <div className="generale-panel generale-history-empty">
          <Camera aria-hidden="true" />
          <h3>{t("Lo storico parte dalla prima fotografia")}</h3>
          <p>
            {t("L’ultimo giorno di ogni mese viene rilevato il piano. Puoi aggiornare la fotografia del mese corrente con «Fotografa adesso»; i valori correnti non vengono trasformati in rilevazioni dei mesi passati.")}
          </p>
          {onInvestitori && (
            <Button variant="outline" onClick={() => onInvestitori()}>
              {t("Apri fonti e investitori")}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="generale-toolbar generale-history-filters">
            <label>
              {t("Rilevazioni")}
              <UniformSelect
                aria-label={t("Periodo dell’andamento")}
                value={periodo}
                onChange={(e) => setPeriodo(Number(e.target.value))}
              >
                <option value={0}>{t("Tutto lo storico")}</option>
                <option value={6}>{t("Ultime {n} rilevazioni", { n: 6 })}</option>
                <option value={12}>{t("Ultime {n} rilevazioni", { n: 12 })}</option>
              </UniformSelect>
            </label>
            <label>
              {t("Versione fotografata")}
              <UniformSelect
                aria-label={t("Stato delle fotografie")}
                value={stato}
                onChange={(e) => setStato(e.target.value)}
              >
                <option value="tutte">{t("Tutte le versioni")}</option>
                <option value="approvata">{t("Solo approvate")}</option>
                <option value="bozza">{t("Solo bozze")}</option>
              </UniformSelect>
            </label>
            <span>
              {t(
                foto.length === 1
                  ? "{n} di {totale} fotografia · valori del periodo selezionato"
                  : "{n} di {totale} fotografie · valori del periodo selezionato",
                { n: visibili.length, totale: foto.length },
              )}
            </span>
          </div>
          {ultima ? (
            <>
              <p className="generale-history-date">
                {t("Ultima fotografia in vista:")}{" "}
                <strong>{nomeMese(ultima.mese)}</strong> ·{" "}
                {t("versione {numero}", { numero: ultima.versioneNumero ?? t("non indicata") })}{" "}
                {ultima.versioneStato ? t(ultima.versioneStato) : ""}
              </p>
              <div
                className="generale-indicators"
                aria-label={t("Valori dell’ultima fotografia in vista")}
              >
                <IndicatoreScheda
                  titolo={t("Margine stimato nella fotografia")}
                  valore={formatCurrency(
                    ultima.ricaviStima - ultima.costiStima,
                  )}
                  tono={
                    ultima.ricaviStima < ultima.costiStima ? "rosso" : "verde"
                  }
                />
                <IndicatoreScheda
                  titolo={t("Scostamento dal budget del mese")}
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
                  nota={t("stima finale meno margine previsto")}
                />
                <IndicatoreScheda
                  titolo={t("Costi registrati alla rilevazione")}
                  valore={formatCurrency(ultima.costiReali)}
                />
                <IndicatoreScheda
                  titolo={t("Capitale investito alla rilevazione")}
                  valore={formatCurrency(ultima.capitaleInvestito)}
                  nota={t("base economica: costi registrati meno incassi")}
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
                        {metrica === "margine"
                          ? t("Come cambia il margine")
                          : metrica === "costi"
                            ? t("Come cambia la stima dei costi")
                            : t("Come cambia il capitale")}
                      </h3>
                      <p>
                        {t("{primo} e {secondo}", { primo: nomi[0], secondo: nomi[1].toLowerCase() })}
                      </p>
                    </div>
                  </div>
                  <div
                    className="generale-segmented"
                    role="group"
                    aria-label={t("Metrica dell’andamento")}
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
                        {t(nome)}
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
                      ? t("Una sola fotografia: il grafico mostra un punto, non una tendenza.") + " "
                      : ""}
                    {t("Il capitale investito è distinto dal capitale versato dalle fonti e dal saldo bancario.")}
                  </span>
                </footer>
              </div>
              <div className="generale-panel generale-cash-table">
                <table aria-label={t("Fotografie mensili del piano")}>
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
                        <th key={x}>{t(x)}</th>
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
                            aria-label={t("Apri fotografia di {mese}", { mese: nomeMese(f.mese) })}
                            onClick={() => setAperta(f)}
                          >
                            {nomeMese(f.mese)}{" "}
                            <ArrowUpRight aria-hidden="true" />
                          </button>
                          <small className="generale-history-meta">
                            v{f.versioneNumero ?? "—"} ·{" "}
                            {f.versioneStato ? t(f.versioneStato) : t("stato non indicato")} ·{" "}
                            {f.origine === "manuale" ? t("manuale") : t("automatica")}
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
                    <strong>{t("Dal periodo al rendiconto investitori")}</strong>
                    <p>
                      {t("Apri il rendiconto di {mese} con i controlli di completezza della fotografia.", { mese: nomeMese(ultima.mese) })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => onInvestitori(ultima.mese)}
                  >
                    {t("Rendiconto del periodo")}{" "}
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p role="status" className="generale-toolbar">
              {t("Nessuna fotografia corrisponde ai filtri selezionati.")}
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
            <DialogTitle>{t("Fotografia di {mese}", { mese: nomeMese(aperta?.mese) })}</DialogTitle>
            <DialogDescription>
              {t("Valori rilevati nel periodo, al netto dell’IVA. Versione {numero} · {stato}.", {
                numero: aperta?.versioneNumero ?? t("non indicata"),
                stato: aperta?.versioneStato ? t(aperta.versioneStato) : t("stato non indicato"),
              })}
            </DialogDescription>
          </DialogHeader>
          {aperta && (
            <>
              <div className="generale-cash-table">
                <table aria-label={t("Dettaglio della fotografia")}>
                  <thead>
                    <tr>
                      <th>{t("Valore")}</th>
                      <th>{t("Budget")}</th>
                      <th>{t("Stima finale")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>{t("Ricavi")}</th>
                      <td>{formatCurrency(aperta.ricaviPrevisti)}</td>
                      <td>{formatCurrency(aperta.ricaviStima)}</td>
                    </tr>
                    <tr>
                      <th>{t("Costi")}</th>
                      <td>{formatCurrency(aperta.costiPrevisti)}</td>
                      <td>{formatCurrency(aperta.costiStima)}</td>
                    </tr>
                    <tr>
                      <th>{t("Margine")}</th>
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
                  {t("Apri rendiconto investitori di {mese}", { mese: nomeMese(aperta.mese) })}
                </Button>
              )}
            </>
          )}
        </DialogContentOperativo>
      </Dialog>
    </section>
  );
}
