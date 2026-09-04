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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, ArrowRight, Banknote, HardHat, Clock, TrendingDown,
  CheckCircle2, Settings2, Info,
} from "lucide-react";
import {
  margineCantieriAperti,
  andamentoIncassi,
  ordinaAttenzioni,
  eInRitardo,
  type CantiereMargine,
  type VoceAttenzione,
} from "@/lib/comeStiamoAndando";

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
  const colore = {
    neutro: "text-foreground",
    buono: "text-emerald-600",
    attenzione: "text-amber-600",
    male: "text-destructive",
  }[tono];
  return (
    <Card>
      <CardContent className="space-y-1 px-3 py-3 md:px-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icona className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{etichetta}</span>
        </div>
        <p className={`text-xl font-bold leading-none tabular-nums md:text-2xl ${colore}`}>{valore}</p>
        <div className="text-[11px] leading-4 text-muted-foreground">{contesto}</div>
      </CardContent>
    </Card>
  );
}

export default function ComeStiamoAndando() {
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
    <div className="space-y-4 p-3 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Come stiamo andando</h1>
        <p className="text-sm text-muted-foreground">
          Quello che serve sapere stamattina, in una schermata sola.
        </p>
      </div>

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
                : "Oltre la data di fine pianificata"
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Da guardare oggi</CardTitle>
          <CardDescription>
            Un solo elenco, in ordine di quanto costa non farlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {caricando ? (
            <Skeleton className="h-20" />
          ) : attenzioni.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Niente che richieda attenzione: nessuno scaduto, nessun cantiere oltre la data.
            </div>
          ) : (
            attenzioni.map((v) => (
              <Link
                key={v.id}
                to={v.url}
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <Badge
                  variant={v.gravita === "urgente" ? "destructive" : "secondary"}
                  className="mt-0.5 shrink-0 text-[10px]"
                >
                  {v.gravita === "urgente" ? "Urgente" : v.gravita === "attenzione" ? "Attenzione" : "Info"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{v.titolo}</p>
                  <p className="text-xs leading-4 text-muted-foreground">{v.dettaglio}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {!caricando && companyTargets?.monthly_revenue_target == null && (
        <Alert>
          <Settings2 className="h-4 w-4" />
          <AlertTitle>Manca la previsione di incasso</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-xs">
              Senza un obiettivo mensile, "incassato" è solo un numero: non si può
              dire se è tanto o poco, né se si è avanti o indietro col mese.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/azienda/impostazioni/margini">Imposta l'obiettivo</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
