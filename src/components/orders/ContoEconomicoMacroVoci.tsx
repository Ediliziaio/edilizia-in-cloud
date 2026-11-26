/**
 * Conto economico della commessa per macro-voci: preventivo e consuntivo uno
 * accanto all'altro, incidenza di ogni voce sui ricavi, previsto ad oggi
 * secondo l'avanzamento dei lavori, scostamento, poi la scala dei tre margini
 * — lordo, diretto, netto — con la squadra e la struttura in mezzo. I numeri li calcola
 * contoEconomicoCommessa (src/lib/orders), con le fonti scritte lì.
 */
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { pctIt, type ContoEconomico, type RigaConto, type VoceConto } from "@/lib/orders/contoEconomicoCommessa";
import { cn } from "@/lib/utils";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const eur = (v: number | null | undefined) => (v == null ? "—" : formatCurrency(v));

function Scostamento({ v }: { v: number | null }) {
  const t = useT();
  if (v == null) return <span className="text-muted-foreground">—</span>;
  if (Math.abs(v) < 0.5) return <span className="text-muted-foreground">{t("in linea")}</span>;
  return <span className={v > 0 ? "font-medium text-red-700" : "font-medium text-emerald-700"}>{v > 0 ? "+" : "−"}{formatCurrency(Math.abs(v))}</span>;
}

/** Barra dell'incidenza: grigia la prevista, colorata la consuntiva. */
function Barra({ prev, cons }: { prev: number | null; cons: number | null }) {
  const max = Math.max(prev ?? 0, cons ?? 0, 1);
  const scala = Math.min(100, max) / max;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
      {prev != null && <div className="absolute inset-y-0 left-0 rounded-full bg-slate-300" style={{ width: `${Math.min(100, prev * scala)}%` }} />}
      {cons != null && <div className={cn("absolute inset-y-0 left-0 rounded-full", prev != null && cons > prev ? "bg-red-500" : "bg-orange-500")} style={{ width: `${Math.min(100, cons * scala)}%`, opacity: 0.85 }} />}
    </div>
  );
}

/** Una voce del dettaglio: da dove arriva il consuntivo di quella macro-voce. */
export interface DettaglioVoce { id: string; label: string; value: number; nota?: string }

function Riga({ r, nota, dettaglio }: { r: RigaConto; nota?: string; dettaglio?: DettaglioVoce[] }) {
  const t = useT();
  const [aperta, setAperta] = useState(false);
  const esplodibile = !!dettaglio && dettaglio.length > 0;
  const etichetta = (
    <>
      {t(r.label)}
      {nota && <span className="block text-[11px] font-normal text-muted-foreground">{nota}</span>}
    </>
  );
  return (
    <Fragment>
      <tr className="border-t align-top">
        <th scope="row" className="py-2 pr-3 text-left font-medium text-foreground">
          {esplodibile ? (
            <button type="button" className="flex items-start gap-1 text-left" aria-expanded={aperta} onClick={() => setAperta((v) => !v)}>
              {aperta ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span>{etichetta}</span>
            </button>
          ) : etichetta}
          <div className="mt-1 w-32 max-w-full"><Barra prev={r.incidenzaPreventivo} cons={r.incidenzaConsuntivo} /></div>
        </th>
        <td className="py-2 pr-3 text-right tabular-nums">{eur(r.preventivo)}</td>
        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{pctIt(r.incidenzaPreventivo)}</td>
        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{eur(r.previstoAOggi)}</td>
        <td className="py-2 pr-3 text-right font-semibold tabular-nums">{eur(r.consuntivo)}</td>
        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{pctIt(r.incidenzaConsuntivo)}</td>
        <td className="py-2 text-right tabular-nums"><Scostamento v={r.scostamento} /></td>
      </tr>
      {esplodibile && aperta && dettaglio!.map((d) => (
        <tr key={d.id} className="border-t bg-slate-50/60 text-[13px] dark:bg-muted/20">
          <th scope="row" className="py-1.5 pl-5 pr-3 text-left font-normal text-muted-foreground">
            {d.label}
            {d.nota && <span className="ml-1.5 text-[11px]">{d.nota}</span>}
          </th>
          <td /><td /><td />
          <td className="py-1.5 pr-3 text-right tabular-nums">{formatCurrency(d.value)}</td>
          <td /><td />
        </tr>
      ))}
    </Fragment>
  );
}

function Totale({ label, prev, prevPct, cons, consPct, forte, tono, nota }: {
  label: string; prev: number | null; prevPct?: number | null; cons: number | null; consPct?: number | null;
  forte?: boolean; tono?: "margine"; nota?: string;
}) {
  const colore = (v: number | null) => (tono !== "margine" || v == null ? "" : v >= 0 ? "text-emerald-700" : "text-red-700");
  return (
    <tr className={cn("border-t", forte && "border-t-2 border-slate-300 bg-slate-50/70")}>
      <th scope="row" className={cn("py-2 pr-3 text-left", forte ? "font-semibold" : "font-medium")}>
        {label}{nota && <span className="block text-[11px] font-normal text-muted-foreground">{nota}</span>}
      </th>
      <td className={cn("py-2 pr-3 text-right tabular-nums", forte && "font-semibold", colore(prev))}>{eur(prev)}</td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{prevPct === undefined ? "" : pctIt(prevPct)}</td>
      <td />
      <td className={cn("py-2 pr-3 text-right tabular-nums", forte && "font-semibold", colore(cons))}>{eur(cons)}</td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{consPct === undefined ? "" : pctIt(consPct)}</td>
      <td />
    </tr>
  );
}

const pctSu = (v: number | null, su: number) => (v == null || su <= 0 ? null : Math.round((v / su) * 1000) / 10);

/** I mezzi dell'azienda su questo cantiere: una stima, non un costo registrato. */
export interface MezziStimati {
  estimatedCost: number;
  vehiclesUsed: number;
  vehicleDays: number;
  vehiclesWithoutCost: number;
}

export function ContoEconomicoMacroVoci({ conto, mostraMargini, mezziStimati = null, dettagli }: {
  conto: ContoEconomico;
  mostraMargini: boolean;
  /** Mostrata sotto «Noleggi e mezzi»: non entra nel consuntivo, che è quello della vista del margine. */
  mezziStimati?: MezziStimati | null;
  /** Da dove arriva il consuntivo di ogni macro-voce: la riga si apre e lo mostra. */
  dettagli?: Partial<Record<VoceConto, DettaglioVoce[]>>;
}) {
  const t = useT();
  // I mezzi nostri non sono una voce a sé: stanno sotto i noleggi, come stima,
  // perché un riquadro per loro in mezzo ai margini spezzava la lettura.
  const notaMezzi = mezziStimati && mezziStimati.vehiclesUsed > 0
    ? t("mezzi nostri: {giorni} giorni-mezzo, {costo} stimati fuori dal consuntivo", {
        giorni: mezziStimati.vehicleDays,
        costo: formatCurrency(mezziStimati.estimatedCost),
      })
    : undefined;
  const { avanzamento } = conto;
  const righeDirette = conto.righe.filter((r) => r.gruppo === "diretti");
  // Con una stima dei mezzi ma nessun noleggio fatturato la riga non esisterebbe
  // (le voci vuote si nascondono) e la stima sparirebbe: la riga resta, a zero.
  const diretti = notaMezzi && !righeDirette.some((r) => r.key === "noleggi")
    ? [...righeDirette, {
        key: "noleggi" as const, label: "Noleggi e mezzi", gruppo: "diretti" as const,
        preventivo: null, consuntivo: 0, incidenzaPreventivo: null, incidenzaConsuntivo: 0,
        previstoAOggi: null, scostamento: null,
      }]
    : righeDirette;
  const commerciali = conto.righe.filter((r) => r.gruppo === "commerciali");
  const sforate = conto.righe.filter((r) => (r.scostamento ?? 0) > 0.5);
  return (
    <section aria-labelledby="ce-macro" className="rounded-xl border bg-white p-3 dark:bg-background">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="ce-macro" className="text-sm font-semibold">{t("Preventivo e consuntivo per voce")}</h3>
        <p className="text-[11px] text-muted-foreground">
          {avanzamento != null ? t("Lavori al {percentuale}%: il consuntivo si confronta col previsto a questo punto", { percentuale: avanzamento.toLocaleString(intlCampo(), { maximumFractionDigits: 0 }) }) : t("Avanzamento non indicato: il consuntivo si confronta col preventivo intero")}
          {t(" · importi senza IVA")}
        </p>
      </div>
      {!conto.haPreventivo && (
        <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          {t("Nessun costo previsto: le lavorazioni non hanno un costo preventivato (voci del preventivo, assegnazioni o costi delle righe). Il consuntivo resta completo.")}
        </p>
      )}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs sm:text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="pb-1.5 text-left font-medium">{t("Voce")}</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-medium">{t("Preventivo")}</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-medium">{t("Inc.")}</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-medium">{t("Previsto a oggi")}</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-medium">{t("Consuntivo")}</th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-medium">{t("Inc.")}</th>
              <th scope="col" className="pb-1.5 text-right font-medium">{t("Scostamento")}</th>
            </tr>
          </thead>
          <tbody>
            <Totale label={t("Ricavi")} nota={avanzamento != null ? t("Maturato al {percentuale}%: {importo}", { percentuale: avanzamento.toLocaleString(intlCampo(), { maximumFractionDigits: 0 }), importo: formatCurrency(conto.ricavoMaturato) }) : t("Contratto e varianti approvate")}
              prev={conto.ricavi} prevPct={100} cons={conto.ricavoMaturato} consPct={100} forte />
            {diretti.map((r) => <Riga key={r.key} r={r} nota={r.key === "noleggi" ? notaMezzi : undefined} dettaglio={dettagli?.[r.key]} />)}
            {commerciali.length > 0 && commerciali.map((r) => <Riga key={r.key} r={r} dettaglio={dettagli?.[r.key]} />)}
            <Totale label={t("Totale costi della commessa")} prev={conto.haPreventivo ? conto.costiPreventivo : null} prevPct={conto.haPreventivo ? pctSu(conto.costiPreventivo, conto.ricavi) : null}
              cons={conto.costiConsuntivo} consPct={pctSu(conto.costiConsuntivo, conto.ricavoMaturato)} />
            {mostraMargini && <>
              <Totale label={t("Margine lordo")} nota={t("Ricavi meno materiali, ditte e costi variabili")} tono="margine"
                prev={conto.margineContribuzione.preventivo} prevPct={pctSu(conto.margineContribuzione.preventivo, conto.ricavi)}
                cons={conto.margineContribuzione.maturato} consPct={pctSu(conto.margineContribuzione.maturato, conto.ricavoMaturato)} />
              <Totale label={t("La tua squadra sul cantiere")} nota={t("Ore degli operai interni, alla loro tariffa")}
                prev={conto.risorseDedicate.preventivo} prevPct={pctSu(conto.risorseDedicate.preventivo, conto.ricavi)}
                cons={conto.risorseDedicate.consuntivo} consPct={pctSu(conto.risorseDedicate.consuntivo, conto.ricavoMaturato)} />
              <Totale label={t("Margine diretto")} nota={t("Dopo i materiali, le ditte e la tua squadra, sul lavoro fatto finora")} tono="margine" forte
                prev={conto.haPreventivo ? conto.marginePreventivo : null} prevPct={conto.haPreventivo ? pctSu(conto.marginePreventivo, conto.ricavi) : null}
                cons={conto.margineMaturato} consPct={pctSu(conto.margineMaturato, conto.ricavoMaturato)} />
              <Totale label={t("Costi di struttura (quota)")} nota={t("Costi generali e ufficio divisi sui cantieri attivi, per i mesi della commessa")}
                prev={conto.struttura.preventivo} prevPct={pctSu(conto.struttura.preventivo, conto.ricavi)}
                cons={conto.struttura.consuntivo} consPct={pctSu(conto.struttura.consuntivo, conto.ricavoMaturato)} />
              <Totale label={t("Margine netto")} tono="margine" forte
                prev={conto.margineNettoPreventivo} prevPct={pctSu(conto.margineNettoPreventivo, conto.ricavi)}
                cons={conto.margineNettoMaturato} consPct={pctSu(conto.margineNettoMaturato, conto.ricavoMaturato)} />
            </>}
          </tbody>
        </table>
      </div>
      {sforate.length > 0 && (
        <p className="mt-2 text-xs text-red-700">
          {t("Sopra il previsto a questo punto dei lavori: {voci}.", { voci: sforate.map((r) => `${t(r.label)} (+${formatCurrency(r.scostamento ?? 0)})`).join(", ") })}
        </p>
      )}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {t("Preventivo: costo previsto delle lavorazioni (voci del preventivo, assegnazioni, costi delle righe). Consuntivo: costi registrati, gli stessi del Controllo di Gestione. Incidenza sui ricavi totali (preventivo) e sul maturato (consuntivo). La struttura è una stima gestionale: non cambia il consuntivo contabile.")}
        {" "}
        {t("Il margine diretto in cima alla pagina è calcolato sul contratto intero: qui, nella colonna Consuntivo, è sul lavoro fatto finora.")}
      </p>
    </section>
  );
}
