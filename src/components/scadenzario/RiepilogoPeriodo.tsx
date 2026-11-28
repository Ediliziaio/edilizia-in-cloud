import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import type { RiepilogoPeriodo as Riepilogo, Somma } from "@/lib/finance/riepilogoPeriodoTipi";
import { saldoNettoAtteso, type SettimanaScadenzario } from "@/lib/finance/settimanaScadenzario";

const eur = (n: number) => new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true }).format(n);

export type RiquadroPeriodo = "scade" | "pagato" | "aperto" | "arretrato";

interface Props {
  riepilogo: Riepilogo | undefined;
  inErrore?: boolean;
  /** Il riquadro acceso, se la vista coincide con uno. */
  attivo: RiquadroPeriodo | null;
  /** Senza inizio di periodo non c'è arretrato da mostrare. */
  conArretrato: boolean;
  onScegli: (r: RiquadroPeriodo) => void;
  className?: string;
  /** I numeri sono quelli di prima mentre arrivano i nuovi: si attenuano e non si possono premere. */
  inAggiornamento?: boolean;
  /** «Personalizzato» senza date: niente da leggere finché non si scelgono. */
  inAttesaDate?: boolean;
  /** Da incassare / da pagare da oggi a domenica (stessi filtri, non il mese mostrato). */
  settimana?: SettimanaScadenzario;
  /** La lettura della settimana non è riuscita: lo si dice invece di restare su «—». */
  settimanaInErrore?: boolean;
}

function Riga({ nome, breve, s, tono, extra, extraTono, coperto }: { nome: string; breve: string; s: Somma; tono?: string; extra?: string; extraTono?: string; coperto?: string }) {
  return (
    <p className="flex min-w-0 items-baseline gap-1 text-xs leading-tight">
      <span className="w-[2.6rem] shrink-0 truncate text-[10px] text-muted-foreground sm:w-[4.2rem] sm:text-xs">
        <span className="sm:hidden">{breve}</span><span className="hidden sm:inline">{nome}</span>
      </span>
      <span className={cn("shrink-0 text-xs font-bold tabular-nums sm:text-sm", tono)}>{eur(s.importo)}</span>
      {/* Da telefono il numero delle scadenze e lo scaduto non c'entrano: restano nel titolo del riquadro e nell'elenco. */}
      <span className="hidden min-w-0 truncate text-[10px] text-muted-foreground sm:inline">{s.n}{extra ? <> · <span className={extraTono}>{extra}</span></> : ""}{coperto ? <> · <span data-testid="di-cui-effetti" className="text-sky-700 dark:text-sky-400">{coperto}</span></> : ""}</span>
    </p>
  );
}

const segno = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + eur(Math.abs(n));

/** Due numeri in fila bassa, sempre presenti (altezza fissa: nulla si sposta cambiando mese). */
function FilaSaldo({ r, settimana, settimanaInErrore, inAttesaDate }: { r: Riepilogo | undefined; settimana?: SettimanaScadenzario; settimanaInErrore?: boolean; inAttesaDate?: boolean }) {
  const t = useT();
  const saldo = r && !inAttesaDate ? saldoNettoAtteso(r) : null;
  const chip = (etichetta: string, valore: string | null, titolo: string) => (
    <p title={titolo} className="flex h-7 min-w-0 items-baseline gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs leading-5">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{etichetta}</span>
      <span className="min-w-0 truncate font-bold tabular-nums">{valore ?? "—"}</span>
    </p>
  );
  const sett = settimanaInErrore ? t("Non disponibile") : settimana
    ? `${eur(settimana.incassare.importo)} ${t("da incassare")} · ${eur(settimana.pagare.importo)} ${t("da pagare")}${settimana.troncato ? "+" : ""}`
    : null;
  return (
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label={t("Saldo e settimana")}>
      {/* Oltre il tetto di righe il saldo è parziale, come i riquadri: lo dice il «(parziale)». */}
      {chip(t("Saldo netto atteso"), saldo === null ? null : segno(saldo) + (r?.troncato ? ` (${t("parziale")})` : ""),
        t("Da incassare meno da pagare, sulle scadenze del periodo e dei filtri scelti (gli stessi dei riquadri). Non include le rate di commessa non ancora fatturate, che stanno nel Previsionale."))}
      {chip(t("Questa settimana"), sett,
        t("Ancora da incassare e da pagare con scadenza da oggi a domenica, con i filtri di fornitore, cantiere e modalità: non dipende dal mese mostrato. Lo scaduto è in «Arretrato»."))}
    </div>
  );
}

export function RiepilogoPeriodo(props: Props) {
  return <>
    <RiquadriPeriodo {...props} />
    <FilaSaldo r={props.riepilogo} settimana={props.settimana} settimanaInErrore={props.settimanaInErrore} inAttesaDate={props.inAttesaDate} />
  </>;
}

/** Quattro riquadri del periodo: cosa scade, cosa è saldato, cosa resta, cosa è rimasto indietro. Ognuno è un filtro. */
function RiquadriPeriodo({ riepilogo: r, inErrore, attivo, conArretrato, onScegli, className, inAggiornamento, inAttesaDate }: Props) {
  const t = useT();
  const vuoto = (s?: Somma) => s ?? { n: 0, importo: 0 };
  const riquadro = (id: RiquadroPeriodo, titolo: string, corpo: ReactNode, disabilitato = false, avviso?: string) => (
    <button type="button" key={id} disabled={disabilitato || inAggiornamento} aria-busy={inAggiornamento || undefined} aria-pressed={attivo === id} onClick={() => onScegli(id)}
      className={cn("flex h-[78px] min-w-0 flex-col justify-between rounded-xl border bg-card px-3 py-2 text-left transition-colors enabled:hover:bg-muted/50 disabled:opacity-60", inAggiornamento && "opacity-50",
        attivo === id && "border-foreground/40 bg-muted/60 ring-1 ring-foreground/20")}>
      <span className="flex items-baseline gap-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titolo.includes("|") ? <><span className="sm:hidden">{titolo.split("|")[0]}</span><span className="hidden sm:inline">{titolo.split("|")[1]}</span></> : titolo}{avviso && <span className="font-medium normal-case text-muted-foreground">{avviso}</span>}
      </span>
      {corpo}
    </button>
  );
  const caricamento = !r;
  const segnaposto = (id: RiquadroPeriodo, titolo: string) => riquadro(id, titolo, inAttesaDate
    ? <span className="text-xs text-muted-foreground">{t("Scegli le date")}</span>
    : inErrore ? <span className="text-xs text-destructive">{t("Non disponibile")}</span>
    : <span className="space-y-1.5" aria-busy="true"><span className="block h-3 w-3/4 animate-pulse rounded bg-muted" /><span className="block h-3 w-2/3 animate-pulse rounded bg-muted" /></span>, true);
  if (caricamento) {
    return <div role="group" aria-label={t("Riepilogo del periodo")} className={cn("grid grid-cols-2 gap-2 lg:grid-cols-4", className)}>
      {segnaposto("scade", t("Scade")+"|"+t("Scade nel periodo"))}{segnaposto("pagato", t("Pagato")+"|"+t("Pagato / incassato"))}
      {segnaposto("aperto", t("Aperto")+"|"+t("Da incassare / pagare"))}{segnaposto("arretrato", t("Arretrato")+"|"+t("Arretrato"))}
    </div>;
  }
  const avviso = r.troncato ? t("parziale") : undefined;
  // «di cui X in assegni»: la quota aperta già coperta da effetti non scaduti (non è pagata, non è scaduta).
  const diCuiEffetti = (c?: Somma) => (c && c.importo > 0 ? t("di cui {importo} in assegni", { importo: eur(c.importo) }) : undefined);
  return (
    <div role="group" aria-label={t("Riepilogo del periodo")} className={cn("grid grid-cols-2 gap-2 lg:grid-cols-4", className)}>
      {riquadro("scade", t("Scade")+"|"+t("Scade nel periodo"), <>
        <Riga nome={t("Entrate")} breve={t("Entr.")} s={r.entrate.totale} />
        <Riga nome={t("Uscite")} breve={t("Usc.")} s={r.uscite.totale} />
      </>, false, avviso)}
      {riquadro("pagato", t("Pagato")+"|"+t("Pagato / incassato"), <>
        <Riga nome={t("Incassato")} breve={t("Incass.")} s={r.entrate.saldato} />
        <Riga nome={t("Pagato")} breve={t("Pagato")} s={r.uscite.saldato} />
      </>, false, avviso)}
      {riquadro("aperto", t("Aperto")+"|"+t("Da incassare / pagare"), <>
        <Riga nome={t("Incassare")} breve={t("Incass.")} s={r.entrate.aperto} extra={r.entrate.scaduto.importo > 0 ? t("scaduto {importo}", { importo: eur(r.entrate.scaduto.importo) }) : undefined} extraTono="font-medium text-rose-600 dark:text-rose-400" coperto={diCuiEffetti(r.entrate.coperto)} />
        <Riga nome={t("Pagare")} breve={t("Pagare")} s={r.uscite.aperto} extra={r.uscite.scaduto.importo > 0 ? t("scaduto {importo}", { importo: eur(r.uscite.scaduto.importo) }) : undefined} extraTono="font-medium text-rose-600 dark:text-rose-400" coperto={diCuiEffetti(r.uscite.coperto)} />
      </>, false, avviso)}
      {conArretrato && r.arretrato
        ? riquadro("arretrato", t("Arretrato")+"|"+t("Arretrato dai mesi prima"), <>
            <Riga nome={t("Incassare")} breve={t("Incass.")} s={vuoto(r.arretrato.entrate)} tono={r.arretrato.entrate.importo > 0 ? "text-rose-600 dark:text-rose-400" : undefined} />
            <Riga nome={t("Pagare")} breve={t("Pagare")} s={vuoto(r.arretrato.uscite)} tono={r.arretrato.uscite.importo > 0 ? "text-rose-600 dark:text-rose-400" : undefined} />
          </>, false, avviso)
        : riquadro("arretrato", t("Arretrato")+"|"+t("Arretrato dai mesi prima"), <span className="text-xs text-muted-foreground">{t("Scegli un mese o un anno")}</span>, true)}
    </div>
  );
}
