/**
 * ComeStiamoAndando — una schermata sola per la domanda che ci si fa la mattina.
 *
 * Oggi per farsi un'idea servono quattro pagine: cruscotto, tesoreria,
 * scadenzario, commesse. Nessuna delle quattro risponde da sola, e messe
 * insieme rispondono male: numeri uguali con nomi diversi, e nessun posto dove
 * si legga "cosa devo guardare oggi".
 *
 * Qui: incassi contro previsione, margine dei cantieri aperti, scaduto, saldo
 * delle scadenze del mese, e un solo elenco di cose che richiedono attenzione.
 *
 * Solo soldi (08/11/2026). Cantieri in ritardo e richieste di assistenza
 * stavano anche qui, ma sono il mestiere della Dashboard Operativa (/azienda),
 * che li mostra due volte: qui li ripetevano una terza e una quarta.
 * I numeri arrivano da `useCruscottoData`, che c'era già: questa pagina non
 * rifà le query, le mette in fila.
 */
import { readAllOrderRows } from "@/lib/orders/listScope";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { loadArchivedOrderIds, excludeArchivedOrders } from "@/lib/orders/archivedOrderScope";
import { useCruscottoData } from "@/hooks/useCruscottoData";
import { useDashboardBillingKPI } from "@/hooks/billing/useDashboardBillingKPI";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import { RiquadroNumero } from "@/components/dashboard/RiquadroNumero";
import { margineCantieriAperti, andamentoIncassi, ordinaAttenzioni, type CantiereMargine, type VoceAttenzione } from "@/lib/comeStiamoAndando";

/**
 * `comeSezione` la monta dentro il Cruscotto Aziendale invece che come pagina
 * a se'. Nata come schermata separata, duplicava tre riquadri su quattro
 * (incassato, margine, da incassare) di una pagina che esisteva gia': la
 * risposta alla prima domanda va in cima al cruscotto, non accanto.
 */
export default function ComeStiamoAndando({ comeSezione = false }: { comeSezione?: boolean }) {
  const dati = useCruscottoData();
  return <ComeStiamoAndandoVista comeSezione={comeSezione} dati={dati} />;
}

/**
 * La vista con i dati già letti: il Cruscotto le passa i suoi, così in cima e
 * sotto i numeri vengono dalla stessa lettura e dallo stesso periodo (prima
 * useCruscottoData girava due volte, ognuna col suo filtro).
 */
/** Lo scaduto con la regola del Previsionale di cassa (vedi lib/finance/incassiScaduti). */
export interface ScadutoPrevisionale {
  totale: number;
  quanti: number;
  caricando: boolean;
  /** Le fonti che il Previsionale non è riuscito a leggere: lo scaduto può essere più alto. */
  fontiMancanti: string[];
  /** Dove si vedono le voci: il Previsionale, se lo si può aprire. */
  url?: string;
}

export function ComeStiamoAndandoVista({ comeSezione = false, dati, tendenzaIncassato, scaduto }: {
  comeSezione?: boolean;
  dati: ReturnType<typeof useCruscottoData>;
  /** Incassato degli ultimi mesi, dal più vecchio: la mini-linea del primo numero. */
  tendenzaIncassato?: number[];
  /** Dal 08/11/2026 lo scaduto è quello del Previsionale. Senza, si ripiega sulle sole rate. */
  scaduto?: ScadutoPrevisionale;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { operations, finance, todayData, companyTargets, workOrders, isLoading, error } = dati;
  const { isNative } = useBillingMode();
  const { data: fatturazione } = useDashboardBillingKPI(companyId ?? null, isNative);

  // Marginalità dei cantieri: la vista esiste già ed è quella che alimenta
  // Marginalità cantieri. Qui serve solo per i cantieri APERTI.
  const { data: cantieriRaw = [], isLoading: cantieriLoading, error: cantieriError } = useQuery<Omit<CantiereMargine, "work_state">[]>({
    queryKey: ["come-stiamo-andando-marginalita", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const archivedIds = await loadArchivedOrderIds(companyId!);
      return readAllOrderRows<Omit<CantiereMargine, "work_state">>((from, to) => excludeArchivedOrders(supabase
        .from("v_ordine_marginalita")
        .select("id, order_code, description, cliente_nome, margine, margine_perc, preventivo_totale, consuntivo, work_start_date, work_end_date")
        .eq("company_id", companyId!).order("id").range(from, to), archivedIds));
    },
  });

  const cantieri = useMemo<CantiereMargine[]>(() => {
    const byId = new Map(workOrders.map(o => [o.id, o]));
    return cantieriRaw.map(c => ({ ...c, work_state: byId.get(c.id ?? "")?.work_state ?? "unknown" }));
  }, [cantieriRaw, workOrders]);
  const margini = useMemo(() => margineCantieriAperti(cantieri), [cantieri]);

  const incassi = useMemo(
    () => andamentoIncassi(
      finance.collectedThisMonth ?? 0,
      null, // A revenue target is not a collection forecast.
    ),
    [finance.collectedThisMonth],
  );

  // Lo scaduto: quello del Previsionale (rate, scadenze e fatture, una volta sola). Prima qui
  // c'erano le sole rate delle commesse, e lo Scadenzario a cui rimandava diceva un'altra cifra.
  const scadutoEuro = scaduto ? scaduto.totale : (operations.overdueAmount ?? 0);
  const scadutoQuanti = scaduto ? scaduto.quanti : (operations.overduePayments ?? 0);
  const scadutoUrl = scaduto ? scaduto.url : "/azienda/scadenzario";

  /** L'unico elenco: cosa richiede attenzione oggi, e dove si va a rimediare. */
  const attenzioni = useMemo(() => {
    const voci: VoceAttenzione[] = [];

    if (scadutoQuanti > 0) {
      voci.push({
        id: "scaduto",
        gravita: "urgente",
        titolo: `${scadutoQuanti} ${scadutoQuanti === 1 ? "incasso scaduto" : "incassi scaduti"} da sollecitare`,
        dettaglio: `${formatCurrency(scadutoEuro)} che i clienti dovevano già averti pagato.`,
        url: scadutoUrl ?? "/azienda/cruscotto/aziendale",
        importo: scadutoEuro,
      });
    }

    const soglia = companyTargets?.alert_margin_min_pct ?? 0;
    const sottoSoglia = margini.peggiori.filter((c) => (c.margine_perc ?? 100) < soglia);
    if (soglia > 0 && sottoSoglia.length > 0) {
      voci.push({
        id: "margine-basso",
        gravita: "attenzione",
        titolo: `${sottoSoglia.length} ${sottoSoglia.length === 1 ? "cantiere aperto è" : "cantieri aperti sono"} sotto il margine minimo (${soglia}%)`,
        dettaglio: sottoSoglia.map((c) => `${c.order_code || c.description || "—"} al ${(c.margine_perc ?? 0).toFixed(1)}%`).join(" · "),
        url: "/azienda/ordini?tab=marginalita",
      });
    }

    const senzaCosti = margini.quanti - margini.quantiValutabili;
    if (senzaCosti > 0) {
      voci.push({
        id: "costi-da-completare",
        gravita: "attenzione",
        titolo: `${senzaCosti} ${senzaCosti === 1 ? "cantiere aperto non ha" : "cantieri aperti non hanno"} costi registrati`,
        dettaglio: "Il margine resta nascosto finché il consuntivo non è iniziato.",
        url: "/azienda/ordini?tab=marginalita",
      });
    }

    const debito = finance.supplierDebt ?? 0;
    const daPagare = todayData?.suppliersDueAmount ?? 0;
    if (daPagare > 0) {
      voci.push({
        id: "fornitori",
        gravita: "attenzione",
        titolo: "Fornitori da pagare a breve",
        dettaglio: `${formatCurrency(daPagare)} in scadenza${debito > 0 ? ` su ${formatCurrency(debito)} di debito totale` : ""}.`,
        url: "/azienda/scadenzario",
        importo: daPagare,
      });
    }

    // Fatture da emettere: lavoro fatto che non è ancora un credito. Stava
    // nel pannello degli avvisi più in basso, tolto perché il resto era
    // commerciale (lead, appuntamenti, pipeline) e vive nella Dashboard Marketing.
    const bozze = fatturazione?.fatture_in_bozza ?? 0;
    const proforma = fatturazione?.proforma_aperti ?? 0;
    if (bozze + proforma > 0) {
      voci.push({
        id: "fatture-da-emettere",
        gravita: "attenzione",
        titolo: bozze > 0
          ? `${bozze} ${bozze === 1 ? "fattura in bozza" : "fatture in bozza"} da emettere`
          : `${proforma} ${proforma === 1 ? "proforma da convertire" : "proforma da convertire"} in fattura`,
        dettaglio: bozze > 0 && proforma > 0
          ? `E ${proforma} ${proforma === 1 ? "proforma da convertire" : "proforma da convertire"}. Finché non le emetti, il cliente non deve niente.`
          : "Finché non le emetti, il cliente non deve niente.",
        url: bozze > 0 ? "/azienda/documenti?stato=bozza" : "/azienda/documenti",
      });
    }

    if (incassi.sottoRitmo === true) {
      voci.push({
        id: "incassi",
        gravita: "attenzione",
        titolo: "Gli incassi del mese sono sotto il ritmo",
        dettaglio: `${formatCurrency(incassi.incassato)} su ${formatCurrency(incassi.previsione ?? 0)} previsti, a mese trascorso al ${Math.round(incassi.meseTrascorso * 100)}%.`,
        url: "/azienda/tesoreria",
        importo: incassi.mancante ?? 0,
      });
    }

    return ordinaAttenzioni(voci);
  }, [todayData, scadutoEuro, scadutoQuanti, scadutoUrl, margini.peggiori, margini.quanti, margini.quantiValutabili, companyTargets, finance.supplierDebt, incassi, fatturazione]);

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Non riesco a caricare i numeri</AlertTitle>
          <AlertDescription>
            {error.message} — ricarica la pagina. Meglio nessun numero che un numero sbagliato.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const caricando = isLoading || cantieriLoading || !!scaduto?.caricando;

  return (
    <div className={comeSezione ? "space-y-3" : "space-y-4 p-3 md:p-6"}>
      {!comeSezione && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Come stiamo andando</h1>
          <p className="text-sm text-muted-foreground">
            Quello che serve sapere stamattina, in una schermata sola.
          </p>
        </div>
      )}

      {caricando ? (
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        // Quattro per riga da 1280px: a 1024 le schede erano di 170px e le
        // cifre a 26px uscivano dal riquadro («319.058,0…»).
        <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
          <RiquadroNumero
            etichetta="Incassato commesse"
            periodo="Questo mese"
            to="/azienda/tesoreria"
            tendenza={tendenzaIncassato}
            etichettaTendenza="Incassato degli ultimi sei mesi"
            valore={formatCurrency(incassi.incassato)}
            tono={incassi.sottoRitmo === true ? "attenzione" : incassi.sottoRitmo === false ? "buono" : "neutro"}
            contesto={
              incassi.previsione == null ? (
                // Nessuna pagina delle impostazioni scrive la previsione (companies.monthly_revenue_target): finché non
                // c'è un posto dove metterla, qui è solo una constatazione, senza rimando.
                finance.collectedUndatedCount ? `${finance.collectedUndatedCount} rate pagate senza data, contate alla data prevista · IVA inclusa` : "Rate registrate per data pagamento · IVA inclusa"
              ) : (
                <>
                  <Progress value={Math.min(100, incassi.percentuale ?? 0)} className="my-1 h-1.5" />
                  {Math.round(incassi.percentuale ?? 0)}% di {formatCurrency(incassi.previsione)}
                  {" · "}mese al {Math.round(incassi.meseTrascorso * 100)}%
                </>
              )
            }
          />
          <RiquadroNumero
            etichetta="Margine cantieri avviati"
            periodo="Cantieri aperti, a oggi"
            to="/azienda/ordini?tab=marginalita"
            valore={margini.marginePerc == null ? "—" : `${margini.marginePerc.toFixed(1)}%`}
            tono={
              margini.marginePerc == null ? "neutro"
                : margini.marginePerc < (companyTargets?.alert_margin_min_pct ?? 0) ? "male"
                : "buono"
            }
            contesto={
              cantieriError ? "Marginalità non disponibile"
                : margini.quanti === 0 ? "Nessun cantiere aperto"
                : margini.quantiValutabili === 0 ? "Costi da completare sui cantieri aperti"
                : <>{formatCurrency(margini.margineEuro)} · {margini.quantiValutabili} di {margini.quanti} cantieri valutabili</>
            }
          />
          <RiquadroNumero
            etichetta="Scaduto da incassare"
            periodo="A oggi"
            to={scadutoUrl}
            valore={formatCurrency(scadutoEuro)}
            tono={scadutoQuanti > 0 ? "male" : "buono"}
            contesto={
              scaduto?.fontiMancanti.length
                ? `${scadutoQuanti} incassi oltre la scadenza · non letti: ${scaduto.fontiMancanti.join(", ")}`
                : `${scadutoQuanti} ${scadutoQuanti === 1 ? "incasso" : "incassi"} oltre la scadenza · rate, scadenze e fatture`
            }
          />
          {/* Qui stava «Cantieri in ritardo»: un numero di cantiere, non di soldi,
              già due volte nella Dashboard Operativa. Al suo posto quanto resta
              fra rate da incassare e costi da pagare nel mese: non è la cassa
              (il saldo in banca non entra), ed è scritto. */}
          <RiquadroNumero
            etichetta="Saldo delle scadenze"
            periodo="Questo mese"
            to="/azienda/scadenzario"
            valore={formatCurrency(finance.cashFlowNet ?? 0)}
            tono={(finance.cashFlowNet ?? 0) < 0 ? "male" : "buono"}
            contesto={`${formatCurrency(finance.thisMonthIncome ?? 0)} da incassare − ${formatCurrency(finance.thisMonthOutflow ?? 0)} da pagare · non è il saldo di cassa`}
          />
        </div>
      )}

      {cantieriError && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Il margine dei cantieri non è disponibile in questo momento: gli altri
            numeri qui sopra sono validi, quelli sui cantieri no. Non li stimo.
          </AlertDescription>
        </Alert>
      )}

      {/* Prima: intestazione su tre righe, poi quattro righe alte con la
          freccia buttata all'estremo destro, lontana dal testo a cui si
          riferisce. Mezzo schermo per quattro voci. Ora titolo e spiegazione
          stanno sulla stessa riga, le voci sono righe di un elenco separate da
          un filo, e la gravita' si legge dal colore del bordo sinistro invece
          che da un'etichetta ripetuta quattro volte. */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Da guardare oggi</h2>
          <p className="hidden text-xs text-slate-500 sm:block">in ordine di quanto costa non farlo</p>
        </div>

        {caricando ? (
          <div className="p-3"><Skeleton className="h-20" /></div>
        ) : attenzioni.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-slate-600">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            Niente che richieda attenzione: nessuno scaduto, nessun fornitore in scadenza.
          </div>
        ) : (
          <ul className={comeSezione ? "grid grid-cols-1 divide-y divide-slate-100 lg:grid-cols-2 lg:divide-y-0" : "divide-y divide-slate-100"}>
            {/* telefono: le prime tre, quelle che costano di più non fare */}
            {attenzioni.map((v, i) => (
              <li key={v.id} className={cn(comeSezione && "lg:border-b lg:border-slate-100 lg:odd:border-r", i >= 3 && "max-sm:hidden")}>
                <Link
                  to={v.url}
                  title={`${v.titolo} — ${v.dettaglio}`}
                  className="group flex items-center gap-3 border-l-[3px] px-4 py-2.5 transition-colors hover:bg-slate-50"
                  style={{
                    borderLeftColor:
                      v.gravita === "urgente" ? "rgb(239 68 68)"
                      : v.gravita === "attenzione" ? "rgb(245 158 11)"
                      : "rgb(148 163 184)",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-snug text-slate-900">{v.titolo}</p>
                    <p className="truncate text-xs leading-4 text-slate-500">{v.dettaglio}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-600" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Qui stava un riquadro intero — titolo, spiegazione e un bottone — per
          dire una cosa che il primo dei quattro numeri gia' dice: "Nessuna
          previsione impostata". Una riga di schermo per ripetere un invito
          rende meno probabile che venga accolto, non piu'. */}
    </div>
  );
}
