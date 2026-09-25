/**
 * ComeStiamoAndando — una schermata sola per la domanda che ci si fa la mattina.
 *
 * Oggi per farsi un'idea servono quattro pagine: cruscotto, tesoreria,
 * scadenzario, commesse. Nessuna delle quattro risponde da sola, e messe
 * insieme rispondono male: numeri uguali con nomi diversi, e nessun posto dove
 * si legga "cosa devo guardare oggi".
 *
 * Qui: incassi contro previsione, margine dei cantieri aperti, scaduto,
 * cantieri in ritardo, e un solo elenco di cose che richiedono attenzione.
 * I numeri arrivano da `useCruscottoData`, che c'era già: questa pagina non
 * rifà le query, le mette in fila.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCruscottoData } from "@/hooks/useCruscottoData";
import { formatCurrency } from "@/lib/formatters";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ArrowRight, Banknote, HardHat, Clock, TrendingDown, CheckCircle2, Info } from "lucide-react";
import { margineCantieriAperti, andamentoIncassi, ordinaAttenzioni, eInRitardo } from "@/lib/comeStiamoAndando";

/** Un numero grosso con la sua riga di contesto. Il contesto non è decorazione. */
function Numero({
  icona: Icona, etichetta, valore, contesto, tono = "neutro",
}: {
  icona: React.ElementType;
  etichetta: string;
  valore: string;
  contesto: React.ReactNode;
  tono?: "neutro" | "buono" | "attenzione" | "male";
}) {
  // Quattro scatole bianche identiche non si leggono a colpo d'occhio: bisogna
  // arrivare al numero per capire se e' una buona o una cattiva notizia. Il
  // colore sta sull'icona e sul filo di bordo a sinistra, cosi' lo stato si
  // vede prima di leggere, e il numero resta la cosa piu' grande della scheda.
  const stile = {
    neutro: { valore: "text-slate-900", chip: "bg-slate-100 text-slate-500", filo: "bg-slate-200" },
    buono: { valore: "text-emerald-700", chip: "bg-emerald-50 text-emerald-600", filo: "bg-emerald-400" },
    attenzione: { valore: "text-amber-700", chip: "bg-amber-50 text-amber-600", filo: "bg-amber-400" },
    male: { valore: "text-red-700", chip: "bg-red-50 text-red-600", filo: "bg-red-400" },
  }[tono];
  return (
    <div className="relative flex min-w-0 gap-2.5 overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${stile.filo}`} aria-hidden />
      {/* Mobile: niente icona (mandava l'etichetta su due righe) e niente riga
          di contesto: a colpo d'occhio servono nome e numero. */}
      <span className={`mt-0.5 hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:flex ${stile.chip}`}>
        <Icona className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        {/* L'etichetta va a capo invece di troncarsi: a 375px "Scaduto da
            incassare" diventava "SCADUTO DA IN...", che non dice cosa sia.
            Le schede stanno in una griglia, quindi si allineano comunque. */}
        <p className="text-[11px] font-medium uppercase leading-3.5 tracking-wide text-slate-500">{etichetta}</p>
        <p className={`mt-1 text-lg font-bold leading-none tabular-nums sm:text-xl md:text-[26px] ${stile.valore}`}>{valore}</p>
        <div className="mt-1 hidden text-[11px] leading-4 text-slate-500 sm:block">{contesto}</div>
      </div>
    </div>
  );
}

/**
 * `comeSezione` la monta dentro il Cruscotto Aziendale invece che come pagina
 * a se'. Nata come schermata separata, duplicava tre riquadri su quattro
 * (incassato, margine, da incassare) di una pagina che esisteva gia': la
 * risposta alla prima domanda va in cima al cruscotto, non accanto.
 */
export default function ComeStiamoAndando({ comeSezione = false }: { comeSezione?: boolean }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { operations, finance, todayData, companyTargets, isLoading, error } = useCruscottoData();

  // Marginalità dei cantieri: la vista esiste già ed è quella che alimenta
  // Marginalità cantieri. Qui serve solo per i cantieri APERTI.
  const { data: cantieri = [], isLoading: cantieriLoading, error: cantieriError } = useQuery<CantiereMargine[]>({
    queryKey: ["come-stiamo-andando-marginalita", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("v_ordine_marginalita")
        .select("id, order_code, description, cliente_nome, margine, margine_perc, preventivo_totale, work_start_date, work_end_date")
        .eq("company_id", companyId!)
        .limit(1000);
      if (err) throw err;
      return (data ?? []) as CantiereMargine[];
    },
  });

  const margini = useMemo(() => margineCantieriAperti(cantieri), [cantieri]);
  const inRitardo = useMemo(() => cantieri.filter((c) => eInRitardo(c)), [cantieri]);

  const incassi = useMemo(
    () => andamentoIncassi(
      finance.thisMonthIncome ?? 0,
      companyTargets?.monthly_revenue_target ?? null,
    ),
    [finance.thisMonthIncome, companyTargets?.monthly_revenue_target],
  );

  /** L'unico elenco: cosa richiede attenzione oggi, e dove si va a rimediare. */
  const attenzioni = useMemo(() => {
    const voci: VoceAttenzione[] = [];

    const scadutoEuro = todayData?.overdueAmount ?? operations.overdueAmount ?? 0;
    const scadutoQuanti = todayData?.overdueCount ?? operations.overduePayments ?? 0;
    if (scadutoQuanti > 0) {
      voci.push({
        id: "scaduto",
        gravita: "urgente",
        titolo: `${scadutoQuanti} ${scadutoQuanti === 1 ? "pagamento scaduto" : "pagamenti scaduti"}`,
        dettaglio: `${formatCurrency(scadutoEuro)} che i clienti dovevano già averti pagato.`,
        url: "/azienda/scadenzario",
        importo: scadutoEuro,
      });
    }

    if (inRitardo.length > 0) {
      voci.push({
        id: "cantieri-ritardo",
        gravita: "urgente",
        titolo: `${inRitardo.length} ${inRitardo.length === 1 ? "cantiere ha" : "cantieri hanno"} superato la data di fine`,
        dettaglio: inRitardo.slice(0, 3).map((c) => c.order_code || c.description || "senza codice").join(", ")
          + (inRitardo.length > 3 ? ` e altri ${inRitardo.length - 3}` : ""),
        url: "/azienda/ordini",
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

    const ticket = operations.openTickets ?? 0;
    const sogliaTicket = companyTargets?.alert_open_tickets_threshold ?? 0;
    if (sogliaTicket > 0 && ticket > sogliaTicket) {
      voci.push({
        id: "ticket",
        gravita: "attenzione",
        titolo: `${ticket} richieste di assistenza aperte`,
        dettaglio: `Sopra la soglia che hai impostato (${sogliaTicket}).`,
        url: "/azienda/assistenza",
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
  }, [todayData, operations, inRitardo, margini.peggiori, companyTargets, finance.supplierDebt, incassi]);

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

  const caricando = isLoading || cantieriLoading;

  return (
    <div className={comeSezione ? "space-y-4" : "space-y-4 p-3 md:p-6"}>
      {!comeSezione && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Come stiamo andando</h1>
          <p className="text-sm text-muted-foreground">
            Quello che serve sapere stamattina, in una schermata sola.
          </p>
        </div>
      )}

      {caricando ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
          <Numero
            icona={Banknote}
            etichetta="Incassato questo mese"
            valore={formatCurrency(incassi.incassato)}
            tono={incassi.sottoRitmo === true ? "attenzione" : incassi.sottoRitmo === false ? "buono" : "neutro"}
            contesto={
              incassi.previsione == null ? (
                <Link to="/azienda/impostazioni/margini" className="underline underline-offset-2">
                  Nessuna previsione impostata
                </Link>
              ) : (
                <>
                  <Progress value={Math.min(100, incassi.percentuale ?? 0)} className="my-1 h-1.5" />
                  {Math.round(incassi.percentuale ?? 0)}% di {formatCurrency(incassi.previsione)}
                  {" · "}mese al {Math.round(incassi.meseTrascorso * 100)}%
                </>
              )
            }
          />
          <Numero
            icona={HardHat}
            etichetta="Margine cantieri aperti"
            valore={margini.marginePerc == null ? "—" : `${margini.marginePerc.toFixed(1)}%`}
            tono={
              margini.marginePerc == null ? "neutro"
                : margini.marginePerc < (companyTargets?.alert_margin_min_pct ?? 0) ? "male"
                : "buono"
            }
            contesto={
              cantieriError ? "Marginalità non disponibile"
                : margini.quanti === 0 ? "Nessun cantiere aperto"
                : <>{formatCurrency(margini.margineEuro)} su {margini.quanti} {margini.quanti === 1 ? "cantiere" : "cantieri"}</>
            }
          />
          <Numero
            icona={TrendingDown}
            etichetta="Scaduto da incassare"
            valore={formatCurrency(todayData?.overdueAmount ?? operations.overdueAmount ?? 0)}
            tono={(todayData?.overdueCount ?? operations.overduePayments ?? 0) > 0 ? "male" : "buono"}
            contesto={`${todayData?.overdueCount ?? operations.overduePayments ?? 0} scadenze oltre il termine`}
          />
          <Numero
            icona={Clock}
            etichetta="Cantieri in ritardo"
            valore={String(inRitardo.length)}
            tono={inRitardo.length > 0 ? "attenzione" : "buono"}
            contesto={
              cantieriError ? "Dato non disponibile"
                : inRitardo.length === 0 ? "Nessuno oltre la data di fine"
                // Su telefono la spiegazione di cosa vuol dire «in ritardo» no.
                : <span className="hidden sm:inline">Oltre la data di fine pianificata</span>
            }
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
            Niente che richieda attenzione: nessuno scaduto, nessun cantiere oltre la data.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {attenzioni.map((v) => (
              <li key={v.id}>
                <Link
                  to={v.url}
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
          dire una cosa che il primo dei quattro numeri gia' dice, con lo stesso
          collegamento: "Nessuna previsione impostata". Una riga di schermo per
          ripetere un invito rende meno probabile che venga accolto, non piu'. */}
    </div>
  );
}
