/**
 * Scheda Cash Flow del Controllo di gestione: il RENDICONTO DI CASSA in una sola tabella.
 *
 * Colonne: i 12 mesi dell'anno + totale. Mesi passati = consuntivo (prima nota), mese in corso =
 * registrato fino a oggi + previsto, mesi futuri = previsione (stesso motore e stesse ipotesi
 * della pagina Previsionale). Righe a gruppi: saldo iniziale, incassi, uscite della gestione,
 * flusso operativo, investimenti, finanziamenti, flusso netto, saldo finale.
 * Un clic su un importo apre i movimenti che lo compongono.
 */
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { CashFlowManualiEditor } from "@/components/controllo-gestione/CashFlowManualiEditor";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";
import { euroIntero } from "@/lib/controlloGestione/formatoCG";
import { useRendicontoCassa } from "@/hooks/controlloGestione/useRendicontoCassa";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  costruisciRendiconto,
  dettagliCella,
  etichettaVoce,
  righeEsportazione,
  vociDelGruppo,
  type DettaglioCella,
  type IpotesiRendiconto,
  type RendicontoCassa,
  type TipoColonna,
} from "@/lib/controlloGestione/rendicontoCassa";
import { GRUPPI_CASSA, VOCE_PER_CHIAVE, type GruppoCassa, type VoceCassa } from "@/lib/controlloGestione/vociCassa";

interface Props {
  anno: number;
}

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const MESI_LUNGHI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const ETICHETTA_COLONNA: Record<TipoColonna, string> = {
  consuntivo: "Consuntivo",
  "in-corso": "In corso",
  previsione: "Previsione",
};
const SFONDO_COLONNA: Record<TipoColonna, string> = {
  consuntivo: "",
  "in-corso": "bg-amber-50/70",
  previsione: "bg-sky-50/70",
};

/** Stessa soglia di attenzione della pagina Previsionale (salvata su questo dispositivo). */
const SOGLIA_PREDEFINITA = 500000;
function sogliaSalvata(companyId: string | null | undefined): number {
  if (!companyId) return SOGLIA_PREDEFINITA;
  try {
    const v = localStorage.getItem(`forecast-threshold-v1:${companyId}`);
    if (v != null && Number(v) >= 0) return Number(v);
  } catch {
    /* preferenza facoltativa */
  }
  return SOGLIA_PREDEFINITA;
}

const euro = (cents: number | null | undefined) => (cents == null ? "—" : euroIntero(cents / 100));
const data = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("it-IT");

/** Cosa mostra il pannello laterale. */
interface Selezione {
  titolo: string;
  voci: VoceCassa[];
  mese: number | null;
}

export function TabCashFlow({ anno }: Props) {
  const q = useRendicontoCassa(anno);
  const companyId = useEffectiveCompanyId();
  const isMobile = useIsMobile();
  const [ipotesi, setIpotesi] = useState<IpotesiRendiconto>({
    includeOverdueIncome: false,
    includeOverdueExpense: false,
    includeEstimates: true,
  });
  const [chiusi, setChiusi] = useState<Set<GruppoCassa>>(() => new Set());
  const [selezione, setSelezione] = useState<Selezione | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const soglia = useMemo(() => sogliaSalvata(companyId), [companyId]);

  const r = useMemo<RendicontoCassa | null>(() => {
    if (!q.data) return null;
    return costruisciRendiconto({
      anno,
      today: q.data.today,
      saldoOggiCents: q.data.saldoOggiCents,
      saldoFonte: q.data.saldoFonte,
      saldoAggiornatoAl: q.data.saldoAggiornatoAl,
      registrati: q.data.registrati,
      flussoDopoAnnoCents: q.data.flussoDopoAnnoCents,
      previsti: q.data.previsti,
      manuali: q.data.manuali,
      mutui: q.data.mutui,
      ipotesi,
      sogliaCents: soglia,
    });
  }, [q.data, anno, ipotesi, soglia]);

  if (q.isLoading)
    return (
      <div className="space-y-3" aria-label="Caricamento del rendiconto di cassa">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  if (q.isError)
    return (
      <div className="space-y-2">
        <ErrorBlock onRetry={() => q.refetch()} />
        <p className="text-sm text-muted-foreground">
          {q.error instanceof Error ? q.error.message : "Riprova tra poco."}
        </p>
      </div>
    );
  if (!r || !q.data) return null;

  const haPrevisione = r.colonne.some((c) => c.tipo !== "consuntivo");
  const linkPrevisionale = (() => {
    const p = new URLSearchParams();
    if (ipotesi.includeOverdueIncome) p.set("incassi-scaduti", "1");
    if (ipotesi.includeOverdueExpense) p.set("uscite-scadute", "1");
    if (!ipotesi.includeEstimates) p.set("stime", "0");
    const s = p.toString();
    return `/azienda/previsionale${s ? `?${s}` : ""}`;
  })();
  const apri = (titolo: string, voci: VoceCassa[], mese: number | null) => setSelezione({ titolo, voci, mese });
  const toggleGruppo = (g: GruppoCassa) =>
    setChiusi((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const esporta = async () => {
    const righe = righeEsportazione(r);
    await exportXlsx({
      filename: `rendiconto_cassa_${anno}.xlsx`,
      brand: { title: "Rendiconto di cassa", subtitle: `Anno ${anno} · importi in euro` },
      sheets: [
        {
          name: `Cassa ${anno}`,
          columns: [
            { header: "Voce", key: "voce", width: 46 },
            ...r.colonne.map((c) => ({
              header: `${MESI[c.mese - 1]} (${ETICHETTA_COLONNA[c.tipo]})`,
              key: `m${c.mese}`,
              width: 16,
              type: "number" as const,
            })),
            { header: `Totale ${anno}`, key: "totale", width: 16, type: "number" as const },
          ],
          rows: righe.map((riga) => ({
            voce: riga.voce,
            ...Object.fromEntries(riga.valori.map((v, i) => [`m${i + 1}`, v])),
            totale: riga.totale,
          })),
        },
      ],
    });
  };

  return (
    <div className="space-y-4">
      {q.data.fontiNonLette.length > 0 && (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Non è stato possibile leggere: {q.data.fontiNonLette.join(", ")}. I numeri riguardano solo il resto.
        </p>
      )}

      <Riquadri r={r} haPrevisione={haPrevisione} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {haPrevisione ? (
          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <legend className="sr-only">Ipotesi della previsione</legend>
            <Interruttore
              id="cf-incassi-scaduti"
              label="Includi incassi scaduti"
              checked={ipotesi.includeOverdueIncome}
              onChange={(v) => setIpotesi((i) => ({ ...i, includeOverdueIncome: v }))}
            />
            <Interruttore
              id="cf-uscite-scadute"
              label="Includi uscite scadute"
              checked={ipotesi.includeOverdueExpense}
              onChange={(v) => setIpotesi((i) => ({ ...i, includeOverdueExpense: v }))}
            />
            <Interruttore
              id="cf-stime"
              label="Includi stime"
              checked={ipotesi.includeEstimates}
              onChange={(v) => setIpotesi((i) => ({ ...i, includeEstimates: v }))}
            />
          </fieldset>
        ) : (
          <p className="text-sm text-muted-foreground">Il {anno} è chiuso: tutti i mesi sono a consuntivo.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={linkPrevisionale}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Apri il previsionale completo
            </Link>
          </Button>
          <span className="max-sm:hidden">
            <ExportButton onExport={esporta} />
          </span>
          {haPrevisione && (
            <Button size="sm" variant="outline" onClick={() => setEditorOpen(true)} className="max-sm:hidden">
              <Plus className="mr-2 h-4 w-4" />
              Voci manuali
            </Button>
          )}
        </div>
      </div>

      <Avvisi r={r} />

      {isMobile ? (
        <VistaMese r={r} onApri={apri} />
      ) : (
        <TabellaRendiconto r={r} chiusi={chiusi} onToggle={toggleGruppo} onApri={apri} />
      )}

      <DettaglioSheet r={r} selezione={selezione} onClose={() => setSelezione(null)} />
      {haPrevisione && <CashFlowManualiEditor open={editorOpen} onOpenChange={setEditorOpen} anno={anno} />}
    </div>
  );
}

function Interruttore({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

// ── Riquadri ────────────────────────────────────────────────────────────────

function Riquadri({ r, haPrevisione }: { r: RendicontoCassa; haPrevisione: boolean }) {
  const { kpi, saldo } = r;
  const fonte =
    saldo.fonte === "banca"
      ? `Conti in Tesoreria${saldo.aggiornatoAl ? ` · al ${data(saldo.aggiornatoAl.slice(0, 10))}` : ""}`
      : saldo.fonte === "prima-nota"
        ? "Dalla prima nota (nessun conto)"
        : "Manca il saldo dei conti";
  const sottoSoglia = kpi.minimo != null && kpi.minimo.cents < r.sogliaCents;
  return (
    <div className="grid grid-cols-2 gap-3 max-sm:gap-2 lg:grid-cols-4">
      <Riquadro label="Saldo di cassa oggi" value={euro(kpi.saldoOggi)} sub={fonte} />
      <Riquadro
        label={`Flusso operativo ${r.anno}`}
        value={euro(kpi.flussoOperativoAnno)}
        sub="Incassi meno uscite della gestione"
        tone={kpi.flussoOperativoAnno < 0 ? "red" : "neutral"}
      />
      <Riquadro
        label={haPrevisione ? "Punto più basso previsto" : "Saldo più basso a fine mese"}
        value={kpi.minimo ? euro(kpi.minimo.cents) : "—"}
        sub={kpi.minimo ? `${kpi.minimo.giornaliero ? "il" : "a fine"} ${kpi.minimo.giornaliero ? data(kpi.minimo.data) : MESI_LUNGHI[Number(kpi.minimo.data.slice(5, 7)) - 1]}${sottoSoglia ? ` · sotto la soglia di ${euro(r.sogliaCents)}` : ""}` : "Saldo non disponibile"}
        tone={kpi.minimo && kpi.minimo.cents < 0 ? "red" : sottoSoglia ? "amber" : "neutral"}
      />
      <Riquadro
        label={haPrevisione ? `Saldo previsto a fine ${r.anno}` : `Saldo a fine ${r.anno}`}
        value={euro(kpi.saldoFineAnno)}
        sub={saldo.ricostruito && !haPrevisione ? "Ricostruito dal saldo di oggi" : undefined}
        tone={kpi.saldoFineAnno != null && kpi.saldoFineAnno < 0 ? "red" : "neutral"}
      />
    </div>
  );
}

function Riquadro({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "neutral" | "red" | "amber" }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border p-3 sm:p-4",
        tone === "red" ? "border-rose-200 bg-rose-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "bg-card",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 break-words text-lg font-bold tabular-nums sm:text-xl", tone === "red" && "text-rose-700")}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Avvisi ──────────────────────────────────────────────────────────────────

function Avvisi({ r }: { r: RendicontoCassa }) {
  const righe: { chiave: string; testo: ReactNode }[] = [];
  if (r.saldo.avviso) righe.push({ chiave: "saldo", testo: r.saldo.avviso });
  else if (r.saldo.ricostruito)
    righe.push({
      chiave: "ricostruito",
      testo:
        "Il saldo dei mesi passati è ricostruito all'indietro: saldo dei conti di oggi meno i movimenti registrati in prima nota dopo quella data. Se in prima nota manca qualche movimento di banca, è un valore indicativo.",
    });
  const e = r.esclusi;
  if (e.incassiScaduti.numero)
    righe.push({ chiave: "inc", testo: <>{e.incassiScaduti.numero} incassi già scaduti per {euro(e.incassiScaduti.cents)} sono fuori dalla previsione: li conti solo se accendi «Includi incassi scaduti».</> });
  if (e.usciteScadute.numero)
    righe.push({ chiave: "usc", testo: <>{e.usciteScadute.numero} pagamenti scaduti e non segnati pagati per {euro(-e.usciteScadute.cents)}: spesso sono già pagati, controllali nel <Link className="font-medium underline" to="/azienda/previsionale?uscite-scadute=1">Previsionale</Link>.</> });
  if (e.stime.numero)
    righe.push({ chiave: "stime", testo: <>{e.stime.numero} stime (netto {euro(e.stime.cents)}) sono fuori perché hai spento «Includi stime».</> });
  if (e.senzaData.numero)
    righe.push({ chiave: "data", testo: <>{e.senzaData.numero} movimenti senza data (netto {euro(e.senzaData.cents)}): mettigli una data per vederli nel mese giusto.</> });
  if (e.forseDoppi.numero)
    righe.push({ chiave: "doppi", testo: <>{e.forseDoppi.numero} incassi forse già compresi nelle rate (netto {euro(e.forseDoppi.cents)}) restano fuori: collegali alla rata giusta.</> });
  if (r.nonClassificati.numero)
    righe.push({
      chiave: "nc",
      testo: (
        <>
          {r.nonClassificati.numero} movimenti non classificati ({euro(r.nonClassificati.cents)}) sono in «Altri incassi» o «Altre uscite».{" "}
          <Link className="font-medium underline" to="/azienda/prima-nota">Dagli una categoria in Prima nota</Link>.
        </>
      ),
    });
  if (r.registratiScartati)
    righe.push({ chiave: "scartati", testo: `${r.registratiScartati} movimenti di prima nota con importo o data da verificare non sono contati.` });
  if (r.registratiFuturi)
    righe.push({ chiave: "futuri", testo: `${r.registratiFuturi} movimenti di prima nota con data futura non sono contati come registrati.` });
  if (r.mutuiGiaPrevisti)
    righe.push({ chiave: "mutui", testo: "Le rate dei mutui sembrano già tra le spese previste: non le aggiungo una seconda volta." });
  if (!righe.length) return null;
  return (
    <details className="rounded-lg border bg-card p-3 text-sm">
      <summary className="cursor-pointer font-medium">Come leggere i numeri ({righe.length})</summary>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-muted-foreground">
        {righe.map((x) => <li key={x.chiave}>{x.testo}</li>)}
      </ul>
    </details>
  );
}

// ── Tabella (da scrivania) ──────────────────────────────────────────────────

function TabellaRendiconto({ r, chiusi, onToggle, onApri }: {
  r: RendicontoCassa;
  chiusi: Set<GruppoCassa>;
  onToggle: (g: GruppoCassa) => void;
  onApri: (titolo: string, voci: VoceCassa[], mese: number | null) => void;
}) {
  const totale = (a: number[]) => a.reduce((s, c) => s + c, 0);
  const cellaImporto = (cents: number, onClick?: () => void, extra?: string) => (
    <span className={cn("tabular-nums", cents < 0 && "text-rose-700", extra)}>
      {cents === 0 ? <span className="text-muted-foreground">—</span> : onClick ? (
        <button type="button" onClick={onClick} className="rounded px-0.5 hover:bg-muted hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          {euro(cents)}
        </button>
      ) : euro(cents)}
    </span>
  );
  const td = (tipo: TipoColonna, extra?: string) => cn("whitespace-nowrap px-2 py-1.5 text-right text-xs", SFONDO_COLONNA[tipo], extra);
  const prima = "sticky left-0 z-10 min-w-[220px] max-w-[280px] px-3 py-1.5 text-left";

  const rigaImporti = (label: string, valori: number[], voci: VoceCassa[], classe: string, primaClasse: string, forte = false) => (
    <tr className={cn("border-t", classe)}>
      <th scope="row" className={cn(prima, "font-normal", primaClasse)}>{label}</th>
      {r.colonne.map((c, i) => (
        <td key={c.mese} className={td(c.tipo, forte ? "font-semibold" : undefined)}>
          {cellaImporto(valori[i], voci.length ? () => onApri(`${label} · ${MESI_LUNGHI[c.mese - 1]} ${r.anno}`, voci, c.mese) : undefined)}
        </td>
      ))}
      <td className="whitespace-nowrap bg-muted/50 px-2 py-1.5 text-right text-xs font-semibold">
        {cellaImporto(totale(valori), voci.length ? () => onApri(`${label} · ${r.anno}`, voci, null) : undefined)}
      </td>
    </tr>
  );
  const rigaSaldo = (label: string, valori: (number | null)[], totaleAnno: number | null, fine = false) => (
    <tr className={cn(fine ? "border-t-2 border-foreground/30 font-bold" : "border-t font-semibold", "bg-muted/40")}>
      <th scope="row" className={cn(prima, "bg-muted")}>{label}</th>
      {r.colonne.map((c, i) => {
        const v = valori[i];
        return (
          <td
            key={c.mese}
            className={cn(
              td(c.tipo),
              v != null && v < 0 ? "bg-rose-100 text-rose-800" : v != null && fine && v < r.sogliaCents ? "bg-amber-100 text-amber-900" : "",
            )}
            title={v == null ? r.saldo.avviso ?? undefined : undefined}
          >
            <span className="tabular-nums">{euro(v)}</span>
          </td>
        );
      })}
      <td className={cn("whitespace-nowrap bg-muted px-2 py-1.5 text-right text-xs tabular-nums", totaleAnno != null && totaleAnno < 0 && "text-rose-700")}>
        {euro(totaleAnno)}
      </td>
    </tr>
  );

  return (
    <div className="max-w-full overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Rendiconto di cassa {r.anno}: saldo, incassi, uscite, investimenti e finanziamenti per mese</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className={cn(prima, "z-20 bg-card py-2 text-xs font-medium text-muted-foreground")}>
              Importi in euro, IVA compresa
            </th>
            {r.colonne.map((c) => (
              <th key={c.mese} scope="col" className={cn("min-w-[96px] px-2 py-2 text-right text-xs font-semibold", SFONDO_COLONNA[c.tipo])}>
                <span className="block">{MESI[c.mese - 1]}</span>
                <span className={cn("block text-[10px] font-normal", c.tipo === "consuntivo" ? "text-muted-foreground" : c.tipo === "in-corso" ? "text-amber-800" : "text-sky-800")}>
                  {ETICHETTA_COLONNA[c.tipo]}
                </span>
              </th>
            ))}
            <th scope="col" className="min-w-[108px] bg-muted/50 px-2 py-2 text-right text-xs font-semibold">Totale {r.anno}</th>
          </tr>
        </thead>
        <tbody>
          {rigaSaldo("Saldo di cassa a inizio mese", r.saldoInizio, r.saldoInizio[0])}
          {GRUPPI_CASSA.map((g) => {
            const aperto = !chiusi.has(g.key);
            const voci = r.vociVisibili.filter((v) => VOCE_PER_CHIAVE.get(v)?.gruppo === g.key);
            return (
              <Fragment key={g.key}>
                <tr className="border-t bg-muted/20">
                  <th scope="rowgroup" colSpan={r.colonne.length + 2} className="p-0 text-left">
                    <button
                      type="button"
                      onClick={() => onToggle(g.key)}
                      aria-expanded={aperto}
                      className="sticky left-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-foreground/80 hover:text-foreground"
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !aperto && "-rotate-90")} aria-hidden />
                      {g.label}
                    </button>
                  </th>
                </tr>
                {aperto &&
                  voci.map((v) => (
                    <Fragment key={v}>
                      {rigaImporti(etichettaVoce(v), r.righe[v], [v], "", "bg-card pl-7")}
                    </Fragment>
                  ))}
                {rigaImporti(g.totale, r.gruppi[g.key], vociDelGruppo(g.key), "bg-muted/30", "bg-muted font-semibold", true)}
                {g.key === "uscite" &&
                  rigaImporti(
                    "Flusso della gestione operativa",
                    r.flussoOperativo,
                    [...vociDelGruppo("incassi"), ...vociDelGruppo("uscite")],
                    "border-t-2 bg-primary/5",
                    "bg-muted font-bold",
                    true,
                  )}
              </Fragment>
            );
          })}
          {rigaImporti(
            "Flusso netto del mese",
            r.flussoNetto,
            GRUPPI_CASSA.flatMap((g) => vociDelGruppo(g.key)),
            "border-t-2 bg-primary/5",
            "bg-muted font-bold",
            true,
          )}
          {rigaSaldo("Saldo di cassa a fine mese", r.saldoFine, r.saldoFine[11], true)}
        </tbody>
      </table>
    </div>
  );
}

// ── Vista per mese (telefono) ───────────────────────────────────────────────

function VistaMese({ r, onApri }: { r: RendicontoCassa; onApri: (titolo: string, voci: VoceCassa[], mese: number | null) => void }) {
  const meseIniziale = r.anno === Number(r.today.slice(0, 4)) ? Number(r.today.slice(5, 7)) : 1;
  const [mese, setMese] = useState(meseIniziale);
  const i = mese - 1;
  const col = r.colonne[i];
  const riga = (label: string, cents: number | null, voci: VoceCassa[], forte = false, rientro = false) => (
    <li key={label} className={cn("flex items-center justify-between gap-3 px-3 py-2", forte && "bg-muted/40 font-semibold", rientro && "pl-6")}>
      <span className="min-w-0 text-[13px]">{label}</span>
      {cents == null || cents === 0 || !voci.length ? (
        <span className={cn("shrink-0 text-[13px] tabular-nums", cents != null && cents < 0 && "text-rose-700")}>{cents === 0 ? "—" : euro(cents)}</span>
      ) : (
        <button
          type="button"
          onClick={() => onApri(`${label} · ${MESI_LUNGHI[i]} ${r.anno}`, voci, mese)}
          className={cn("shrink-0 text-[13px] tabular-nums underline-offset-2 hover:underline", cents < 0 && "text-rose-700")}
        >
          {euro(cents)}
        </button>
      )}
    </li>
  );
  const fine = r.saldoFine[i];
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className={cn("flex items-center gap-2 border-b px-2 py-2", SFONDO_COLONNA[col.tipo])}>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={mese === 1} onClick={() => setMese(mese - 1)} aria-label="Mese precedente">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Select value={String(mese)} onValueChange={(v) => setMese(Number(v))}>
          <SelectTrigger className="h-8 flex-1" aria-label="Mese"><SelectValue /></SelectTrigger>
          <SelectContent>
            {r.colonne.map((c) => (
              <SelectItem key={c.mese} value={String(c.mese)}>
                {MESI_LUNGHI[c.mese - 1]} · {ETICHETTA_COLONNA[c.tipo]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={mese === 12} onClick={() => setMese(mese + 1)} aria-label="Mese successivo">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <ul className="divide-y">
        {riga("Saldo a inizio mese", r.saldoInizio[i], [], true)}
        {GRUPPI_CASSA.map((g) => (
          <Fragment key={g.key}>
            {r.vociVisibili
              .filter((v) => VOCE_PER_CHIAVE.get(v)?.gruppo === g.key)
              .map((v) => riga(etichettaVoce(v), r.righe[v][i], [v], false, true))}
            {riga(g.totale, r.gruppi[g.key][i], vociDelGruppo(g.key), true)}
            {g.key === "uscite" && riga("Flusso della gestione operativa", r.flussoOperativo[i], [...vociDelGruppo("incassi"), ...vociDelGruppo("uscite")], true)}
          </Fragment>
        ))}
        {riga("Flusso netto del mese", r.flussoNetto[i], GRUPPI_CASSA.flatMap((g) => vociDelGruppo(g.key)), true)}
        <li className={cn("flex items-center justify-between gap-3 px-3 py-2.5 font-bold", fine != null && fine < 0 ? "bg-rose-100 text-rose-800" : "bg-muted/60")}>
          <span>Saldo a fine mese</span>
          <span className="tabular-nums">{euro(fine)}</span>
        </li>
      </ul>
    </div>
  );
}

// ── Pannello dei movimenti ──────────────────────────────────────────────────

function DettaglioSheet({ r, selezione, onClose }: { r: RendicontoCassa; selezione: Selezione | null; onClose: () => void }) {
  const righe: DettaglioCella[] = selezione ? dettagliCella(r, selezione.voci, selezione.mese) : [];
  const totale = righe.reduce((s, d) => s + d.cents, 0);
  return (
    <Sheet open={!!selezione} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="pr-6 text-base">{selezione?.titolo}</SheetTitle>
          <SheetDescription>
            {righe.length} movimenti · totale <span className={cn("font-semibold tabular-nums", totale < 0 && "text-rose-700")}>{euro(totale)}</span>
          </SheetDescription>
        </SheetHeader>
        {righe.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Nessun movimento.</p>
        ) : (
          <ul className="mt-4 divide-y rounded-lg border">
            {righe.map((d) => (
              <li key={`${d.id}:${d.data}`} className="space-y-1 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium">{d.descrizione}</p>
                  <p className={cn("shrink-0 font-semibold tabular-nums", d.cents < 0 && "text-rose-700")}>{euro(d.cents)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">{data(d.data)}</span>
                  {d.controparte && <span>· {d.controparte}</span>}
                  <span>· {d.fonte}</span>
                  <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", d.tipo === "previsto" ? "border-sky-300 text-sky-800" : "")}>
                    {d.tipo === "registrato" ? "Registrato" : d.stimato ? "Stima" : "Previsto"}
                  </Badge>
                  {d.href && (
                    <Link to={d.href} className="font-medium text-blue-700 underline">
                      Apri
                    </Link>
                  )}
                </div>
                {d.nota && <p className="text-[11px] text-muted-foreground">{d.nota}</p>}
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
