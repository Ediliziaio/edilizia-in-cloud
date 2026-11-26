/**
 * Dashboard Operativa (/azienda da computer) — la regia operativa.
 * Si chiamava «Dashboard Gestione» fino all'08/11/2026: si confondeva col
 * Controllo di Gestione, che parla di soldi.
 *
 * Risponde a una domanda sola: cosa succede in cantiere e in magazzino oggi e
 * nei prossimi giorni, e cosa è fermo. Niente soldi: venduto, incassi e costi
 * stanno nel Cruscotto, con le loro regole (un numero, un posto).
 *
 * Prima (fino al 22/10/2026) qui c'erano 2.916 px e 48 bottoni: il titolo tre
 * volte, otto periodi, le stesse 9 uscite in cinque riquadri, ticket e anomalie
 * in tre, un «saldo dopo costi» che era venduto meno costi pianificati, e un
 * calendario di 30 caselle quasi tutte «libero». Sul telefono /azienda apre
 * Attività: questa pagina è da scrivania.
 */
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  HardHat,
  Loader2,
  RefreshCw,
  Truck,
  Users,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { COMPANY_APP_HOME } from "@/lib/auth/appHome";
import { cn } from "@/lib/utils";
import { DashboardSelectorBar } from "@/components/dashboard/DashboardSelectorBar";
import { DashboardQuickActions } from "@/components/dashboard/DashboardQuickActions";
import { RiquadroNumero } from "@/components/dashboard/RiquadroNumero";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import {
  useRegiaOperativa,
  type CommessaDaSeguire,
} from "@/hooks/useRegiaOperativa";
import {
  giorniDaOggi,
  type EventoAgenda,
  type TipoEvento,
} from "@/lib/regia/agendaOperativa";
import { useAzioniRegia } from "@/hooks/useAzioniRegia";
import { CaricoSettimana, caricoSettimana } from "@/components/regia/CaricoSettimana";
import { Comparsa } from "@/components/charts/grafici/comune";
import { useIsMobile } from "@/hooks/use-mobile";
import { SegnaFinita, SpostaData } from "@/components/regia/AzioniRegia";
import { useT, intlCampo, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";
import type { Traduttore } from "@/lib/campo/lingua/traduttore";

export default function CompanyDashboard() {
  const {
    isModuleEnabled,
    currentPlan,
    isLoading: planLoading,
  } = useSubscriptionLimits({ includeUsageCounts: false });
  const soloMarketing =
    !planLoading && !!currentPlan && !isModuleEnabled("orders");
  if (soloMarketing) return <Navigate to={COMPANY_APP_HOME} replace />;
  return <RegiaOperativa />;
}

function quando(giorno: string, t: Traduttore): string {
  const d = giorniDaOggi(giorno);
  if (d === 0) return t("Oggi");
  if (d === 1) return t("Domani");
  return format(parseISO(giorno), "EEEE d MMMM", { locale: dateFnsCampo() }).replace(
    /^./,
    (c) => c.toUpperCase(),
  );
}

const ICONA_EVENTO = {
  lavoro: HardHat,
  merce: Truck,
  appuntamento: CalendarDays,
} as const;
const COLORE_EVENTO = {
  lavoro: "text-blue-600 bg-blue-500/10 dark:text-blue-400",
  merce: "text-amber-700 bg-amber-500/10 dark:text-amber-400",
  appuntamento: "text-violet-600 bg-violet-500/10 dark:text-violet-400",
} as const;

const EVENTI_ANTEPRIMA = 4;

const FILTRI_AGENDA: Array<{ id: "tutti" | TipoEvento; nome: string }> = [
  { id: "tutti", nome: "Tutto" },
  { id: "lavoro", nome: "Cantieri" },
  { id: "merce", nome: "Consegne" },
  { id: "appuntamento", nome: "Appuntamenti" },
];

function RegiaOperativa() {
  const tr = useT();
  const queryClient = useQueryClient();
  const { effectiveCompany, isImpersonating, impersonatedCompanyId } =
    useAuth();
  const permissions = usePermissions();
  const r = useRegiaOperativa();
  const azioni = useAzioniRegia();
  const isMobile = useIsMobile();
  const [filtroAgenda, setFiltroAgenda] = useState<"tutti" | TipoEvento>(
    "tutti",
  );
  const [agendaEstesa, setAgendaEstesa] = useState(false);
  // le azioni dirette scrivono su commesse e ordini fornitore: stesso permesso dell'elenco commesse
  const puoModificare =
    (permissions.isAdmin || permissions.canEditOrders) &&
    !permissions.solaLettura;

  if (!effectiveCompany?.id) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        {isImpersonating || impersonatedCompanyId ? (
          <>
            <Loader2 className="mb-4 h-8 w-8 animate-spin" />
            <p className="font-medium text-foreground">{tr("Caricamento azienda…")}</p>
          </>
        ) : (
          <>
            <Users className="mb-4 h-12 w-12 opacity-50" />
            <p className="font-medium text-foreground">
              {tr("Nessuna azienda selezionata")}
            </p>
          </>
        )}
      </div>
    );
  }

  const aggiorna = () =>
    queryClient.invalidateQueries({ queryKey: ["regia-operativa"] });
  const oggi = new Date().toLocaleDateString(intlCampo(), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Da sbloccare: in ordine di quanto fermano il lavoro
  const blocchi: Array<{
    id: string;
    titolo: string;
    dettaglio: string;
    to: string;
    grave: boolean;
    voci?: typeof r.merceInRitardo.voci;
  }> = [];
  if ((r.daApprovare ?? 0) > 0)
    blocchi.push({
      id: "approvare",
      titolo: tr("{n} da approvare dal cantiere", { n: r.daApprovare ?? 0 }),
      dettaglio: tr("Rapportini, correzioni di timbratura e bolle in attesa"),
      to: "/azienda/attivita",
      grave: true,
    });
  if (r.merceInRitardo.totale > 0)
    blocchi.push({
      id: "merce",
      grave: true,
      titolo: tr(r.merceInRitardo.totale === 1 ? "{n} ordine fornitore in ritardo" : "{n} ordini fornitore in ritardo", { n: r.merceInRitardo.totale }),
      dettaglio: r.merceInRitardo.voci
        .map(
          (v) =>
            tr("{fornitore} (dal {data})", { fornitore: v.suppliers?.name || v.oda_number || tr("Fornitore"), data: format(parseISO(v.expected_delivery_date), "d MMM", { locale: dateFnsCampo() }) }),
        )
        .join(" · "),
      to: "/azienda/ordini?tab=acquisto",
      // con il permesso, ogni ordine ha la sua riga e la sua data da spostare
      voci: puoModificare ? r.merceInRitardo.voci : undefined,
    });
  if (r.cantieriInRitardo > 0)
    blocchi.push({
      id: "ritardo",
      titolo: tr(r.cantieriInRitardo === 1 ? "{n} cantiere oltre la fine lavori" : "{n} cantieri oltre la fine lavori", { n: r.cantieriInRitardo }),
      dettaglio: tr("Aggiorna la fase o sposta la data"),
      to: "/azienda/ordini",
      grave: false,
    });
  if ((r.documentiDaConfermare ?? 0) > 0)
    blocchi.push({
      id: "documenti",
      titolo: tr(r.documentiDaConfermare === 1 ? "{n} documento dalle email da confermare" : "{n} documenti dalle email da confermare", { n: r.documentiDaConfermare ?? 0 }),
      dettaglio: tr("Fatture e bolle lette dagli allegati"),
      to: "/azienda/email/documenti",
      grave: false,
    });
  if (r.numeri.ticket > 0)
    blocchi.push({
      id: "ticket",
      titolo: tr(r.numeri.ticket === 1 ? "{n} richiesta di assistenza aperta" : "{n} richieste di assistenza aperte", { n: r.numeri.ticket }),
      dettaglio: "Clienti in attesa di una risposta",
      to: "/azienda/assistenza",
      grave: false,
    });

  // I sette giorni da oggi, per tipo: la linea nei riquadri e il grafico del carico.
  const settimana = caricoSettimana(r.agenda);
  const perGiornoTipo = (t: "lavoro" | "merce" | "appuntamento") => settimana.map((g) => g[t]);

  const eventiFiltrati = r.agenda.filter(
    (e) => filtroAgenda === "tutti" || e.tipo === filtroAgenda,
  );
  const limiteAgenda = agendaEstesa ? 24 : EVENTI_ANTEPRIMA;
  const totaliPerGiorno = new Map<string, number>();
  for (const e of eventiFiltrati)
    totaliPerGiorno.set(e.giorno, (totaliPerGiorno.get(e.giorno) ?? 0) + 1);
  const perGiorno = new Map<string, EventoAgenda[]>();
  for (const e of eventiFiltrati.slice(0, limiteAgenda))
    perGiorno.set(e.giorno, [...(perGiorno.get(e.giorno) ?? []), e]);

  return (
    <div className="space-y-5 pb-6">
      <OnboardingChecklist />
      {/* 25/11/2026: testata come il Controllo di Gestione: selettore e titolo da 20px sulla stessa riga,
          azienda e data accanto (da 1536px), «Cruscotto Economico» tra i comandi. Prima titolo da 30px, una riga
          sopra e una sotto, e una riga vuota prima dei numeri solo per quel collegamento. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <DashboardSelectorBar title={tr("Dashboard Operativa")} soloSelettore />
          <h1 className="text-xl font-bold leading-tight tracking-tight text-foreground">
            {tr("Panoramica operativa")}
          </h1>
          <p className="text-xs text-muted-foreground max-2xl:hidden">
            {effectiveCompany.name} ·{" "}
            <span>{oggi.replace(/^./, (c) => c.toUpperCase())}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(permissions.isAdmin || permissions.canViewCruscotto) && (
            <Link
              to="/azienda/cruscotto/aziendale"
              className="inline-flex items-center gap-1 px-1 text-xs font-medium text-muted-foreground hover:text-primary"
            >
              {tr("Cruscotto Economico")} <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
          <DashboardQuickActions fullLabels />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-card"
            onClick={aggiorna}
            aria-label={tr("Aggiorna")}
            title={tr("Aggiorna dati")}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {r.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {tr("Non riesco a caricare una parte della regia. Riprova con il tasto aggiorna.")}
        </p>
      )}

      <section aria-label={tr("Riepilogo operativo")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {r.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[96px] rounded-xl" />
            ))
          ) : (
            <>
              {/* 08/11/2026: lo stesso riquadro del Cruscotto Economico. Prima ogni
                  numero aveva il suo colore (blu, ambra, viola, verde acqua), che
                  diceva il tipo e non lo stato: un lavoro in calendario non è una
                  buona o una cattiva notizia. Il colore resta per l'assistenza,
                  dove un numero sopra zero è qualcuno che aspetta. */}
              <RiquadroNumero
                etichetta={tr("Lavori programmati")}
                tendenza={perGiornoTipo("lavoro")}
                etichettaTendenza={tr("Lavori programmati, giorno per giorno nei prossimi 7 giorni")}
                valore={String(r.numeri.lavori)}
                periodo={tr("Prossimi 7 giorni")}
                to="/azienda/calendario"
              />
              <RiquadroNumero
                etichetta={tr("Consegne in arrivo")}
                tendenza={perGiornoTipo("merce")}
                etichettaTendenza={tr("Consegne in arrivo, giorno per giorno nei prossimi 7 giorni")}
                valore={String(r.numeri.merce)}
                periodo={tr("Prossimi 7 giorni")}
                to="/azienda/ordini-acquisto"
              />
              <RiquadroNumero
                etichetta={tr("Appuntamenti")}
                tendenza={perGiornoTipo("appuntamento")}
                etichettaTendenza={tr("Appuntamenti, giorno per giorno nei prossimi 7 giorni")}
                valore={String(r.numeri.appuntamenti)}
                periodo={tr("Prossimi 7 giorni")}
                to="/azienda/calendario"
              />
              <RiquadroNumero
                etichetta={tr("Assistenza aperta")}
                valore={String(r.numeri.ticket)}
                periodo={tr("A oggi")}
                tono={r.numeri.ticket > 0 ? "attenzione" : "buono"}
                to="/azienda/assistenza"
              />
            </>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)] items-start">
        {/* Agenda: solo i giorni con qualcosa */}
        <Card className="overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base font-semibold">
                {tr("Agenda dei prossimi giorni")}
              </CardTitle>
            </div>
            <Link
              to="/azienda/calendario"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary/5 px-2.5 py-2 text-xs font-medium text-primary hover:bg-primary/10"
            >
              {tr("Calendario")} <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            <div
              className="mb-4 mt-2 flex flex-wrap gap-1 rounded-lg bg-muted/70 p-1"
              role="group"
              aria-label={tr("Tipo di evento in agenda")}
            >
              {FILTRI_AGENDA.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filtroAgenda === f.id}
                  onClick={() => {
                    setFiltroAgenda(f.id);
                    setAgendaEstesa(false);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    filtroAgenda === f.id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tr(f.nome)}
                </button>
              ))}
            </div>
            {r.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : perGiorno.size === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center gap-2 text-center">
                <CalendarDays className="mb-1 h-7 w-7 text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">
                  {filtroAgenda === "tutti"
                    ? tr("Niente in programma")
                    : tr("Nessun evento di questo tipo")}
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {filtroAgenda === "tutti"
                    ? tr("I lavori, le consegne e gli appuntamenti compariranno qui.")
                    : tr("Scegli un altro filtro o apri il calendario completo.")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...perGiorno.entries()].map(([g, eventi]) => (
                  <div key={g}>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <span>{quando(g, tr)}</span>
                      <span className="h-px flex-1 bg-muted" />
                      <span className="font-normal">
                        {eventi.length < (totaliPerGiorno.get(g) ?? 0)
                          ? tr("{n} di {totale} eventi", { n: eventi.length, totale: totaliPerGiorno.get(g) ?? 0 })
                          : `${eventi.length} ${eventi.length === 1 ? "evento" : "eventi"}`}
                      </span>
                    </p>
                    <ul className="divide-y divide-border/60">
                      {eventi.map((e) => {
                        const Icona = ICONA_EVENTO[e.tipo];
                        const riga = (
                          <>
                            <span
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                                COLORE_EVENTO[e.tipo],
                              )}
                            >
                              <Icona className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className="block truncate text-sm font-medium text-foreground"
                                title={`${e.cosa} · ${e.riferimento}`}
                              >
                                {e.cosa}
                                <span className="font-normal text-muted-foreground">
                                  {" "}
                                  · {e.riferimento}
                                </span>
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {[e.cliente, e.dettaglio]
                                  .filter(Boolean)
                                  .join(" · ") || " "}
                              </span>
                            </span>
                          </>
                        );
                        return (
                          <li key={e.id}>
                            {e.orderId ? (
                              <Link
                                to={`/azienda/ordini/${e.orderId}`}
                                className="group flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-muted/50"
                              >
                                {riga}
                              </Link>
                            ) : (
                              <div className="flex items-center gap-3 px-1 py-2">
                                {riga}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <span className="text-xs text-muted-foreground">{tr("{n} di {totale} eventi", { n: Math.min(eventiFiltrati.length, limiteAgenda), totale: eventiFiltrati.length })}</span>
                  {eventiFiltrati.length > EVENTI_ANTEPRIMA && !agendaEstesa ? (
                    <button
                      type="button"
                      onClick={() => setAgendaEstesa(true)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {tr("Mostra altri eventi")}{" "}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  ) : agendaEstesa ? (
                    <button
                      type="button"
                      onClick={() => setAgendaEstesa(false)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {tr("Mostra meno")}
                    </button>
                  ) : null}
                  {agendaEstesa && eventiFiltrati.length > 24 && (
                    <Link
                      to="/azienda/calendario"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {tr("Tutti gli eventi nel calendario")}
                    </Link>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Il carico della settimana: quanti impegni per giorno, per tipo. */}
          {!isMobile && !r.isLoading && (
            <Comparsa indice={2}>
              <Card className="overflow-hidden rounded-xl border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">{tr("Carico dei prossimi 7 giorni")}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <CaricoSettimana giorni={settimana} />
                </CardContent>
              </Card>
            </Comparsa>
          )}
          <Card className="overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base font-semibold">
                  {tr("Da sbloccare")}
                </CardTitle>
                {!r.isLoading && blocchi.length > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{tr("{n} aree", { n: blocchi.length })}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {tr("Le situazioni che richiedono attenzione.")}
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              {r.isLoading ? (
                <Skeleton className="h-28 w-full" />
              ) : blocchi.length === 0 ? (
                <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {tr("Niente di fermo.")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {blocchi.map((b) => (
                    <li
                      key={b.id}
                      className={cn(
                        "rounded-lg border-l-2 px-3",
                        b.grave
                          ? "border-rose-300 bg-rose-50/40 dark:border-rose-500/60 dark:bg-rose-500/10"
                          : "border-amber-300 bg-amber-50/40 dark:border-amber-500/60 dark:bg-amber-500/10",
                      )}
                    >
                      <Link
                        to={b.to}
                        className="group flex items-center gap-3 py-2.5"
                      >
                        {b.grave ? (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                        ) : (
                          <ClipboardCheck className="h-4 w-4 shrink-0 text-amber-500" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground">
                            {b.titolo}
                          </span>
                          {!b.voci && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {b.dettaglio}
                            </span>
                          )}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
                      </Link>
                      {b.voci && (
                        <details className="pb-2 pl-7">
                          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{tr("Mostra i primi {n} ordini", { n: b.voci.length })}</summary>
                          <ul className="mt-2 space-y-1">
                            {b.voci.map((v) => (
                              <li
                                key={v.id}
                                className="flex items-center gap-2"
                              >
                                <Link
                                  to={`/azienda/ordini-acquisto/${v.id}`}
                                  className="min-w-0 flex-1 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                                  title={tr("Apri l'ordine per registrare l'arrivo")}
                                >
                                  {v.suppliers?.name ||
                                    v.oda_number ||
                                    tr("Fornitore")}{" "}
                                  {tr("· atteso il")}{" "}
                                  {format(
                                    parseISO(v.expected_delivery_date),
                                    "d MMM",
                                    { locale: dateFnsCampo() },
                                  )}
                                </Link>
                                <SpostaData
                                  etichetta={tr("Sposta l'arrivo")}
                                  attuale={v.expected_delivery_date}
                                  inCorso={
                                    azioni.spostaArrivo.isPending &&
                                    azioni.spostaArrivo.variables?.odaId ===
                                      v.id
                                  }
                                  onScegli={(giorno) =>
                                    azioni.spostaArrivo.mutate({
                                      odaId: v.id,
                                      giorno,
                                    })
                                  }
                                />
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <section aria-label={tr("Commesse da seguire")}>
        <Card className="overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-base font-semibold">
                {tr("Commesse da seguire")}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {tr("Prima le scadenze superate, poi i prossimi lavori.")}
              </p>
            </div>
            <Link
              to="/azienda/ordini"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {tr("Commesse")} <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {r.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : r.daSeguire.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                {tr("Nessuna commessa aperta con lavori in programma.")}
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {r.daSeguire.map((c: CommessaDaSeguire) => (
                  <li key={c.id} className="flex items-center gap-2 py-1.5">
                    <Link
                      to={`/azienda/ordini/${c.id}`}
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-1 py-2 hover:bg-muted/50 sm:flex-nowrap"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {c.cliente || c.codice}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {c.cliente ? c.codice : tr("Commessa")}
                        </span>
                      </span>
                      <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">
                        {c.fase || tr("Fase non indicata")}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-1 text-xs font-medium tabular-nums",
                          c.ritardo !== null
                            ? "bg-rose-50 text-rose-700"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {c.ritardo !== null
                          ? tr(c.ritardo === 1 ? "{n} giorno di ritardo" : "{n} gg di ritardo", { n: c.ritardo })
                          : c.prossima
                            ? quando(c.prossima, tr)
                            : ""}
                      </span>
                    </Link>
                    {puoModificare && c.ritardo !== null && (
                      <>
                        <SpostaData
                          etichetta={tr("Sposta la fine lavori")}
                          attuale={c.scadenza}
                          inCorso={
                            azioni.spostaFineLavori.isPending &&
                            azioni.spostaFineLavori.variables?.orderId === c.id
                          }
                          onScegli={(giorno) =>
                            azioni.spostaFineLavori.mutate({
                              orderId: c.id,
                              giorno,
                            })
                          }
                        />
                        {r.faseFinale && (
                          <SegnaFinita
                            codice={c.codice}
                            fase={r.faseFinale.nome}
                            inCorso={
                              azioni.segnaFinita.isPending &&
                              azioni.segnaFinita.variables?.orderId === c.id
                            }
                            onConferma={() =>
                              azioni.segnaFinita.mutate({
                                orderId: c.id,
                                statusId: r.faseFinale!.id,
                              })
                            }
                          />
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
