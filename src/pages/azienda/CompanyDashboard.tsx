/**
 * Dashboard Gestione (/azienda da computer) — la regia operativa.
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
import { it } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  HardHat,
  LayoutDashboard,
  Loader2,
  Package,
  RefreshCw,
  Truck,
  Users,
  Wrench,
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
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import {
  GIORNI_AGENDA,
  useRegiaOperativa,
  type CommessaDaSeguire,
} from "@/hooks/useRegiaOperativa";
import {
  giorniDaOggi,
  type EventoAgenda,
  type TipoEvento,
} from "@/lib/regia/agendaOperativa";
import { useAzioniRegia } from "@/hooks/useAzioniRegia";
import { SegnaFinita, SpostaData } from "@/components/regia/AzioniRegia";

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

function quando(giorno: string): string {
  const d = giorniDaOggi(giorno);
  if (d === 0) return "Oggi";
  if (d === 1) return "Domani";
  return format(parseISO(giorno), "EEEE d MMMM", { locale: it }).replace(
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
  lavoro: "text-blue-600 bg-blue-50",
  merce: "text-amber-700 bg-amber-50",
  appuntamento: "text-violet-600 bg-violet-50",
} as const;

function Numero({
  etichetta,
  valore,
  icona: Icona,
  to,
  colore,
}: {
  etichetta: string;
  valore: number;
  icona: typeof HardHat;
  to: string;
  colore: string;
}) {
  return (
    <Link
      to={to}
      className="group flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-4 transition hover:border-primary/30 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          colore,
        )}
      >
        <Icona className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-slate-500">
          {etichetta}
        </span>
        <span className="mt-1 block text-3xl font-semibold leading-none tracking-tight tabular-nums text-slate-900">
          {valore}
        </span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-primary" />
    </Link>
  );
}

const EVENTI_ANTEPRIMA = 4;

const FILTRI_AGENDA: Array<{ id: "tutti" | TipoEvento; nome: string }> = [
  { id: "tutti", nome: "Tutto" },
  { id: "lavoro", nome: "Cantieri" },
  { id: "merce", nome: "Consegne" },
  { id: "appuntamento", nome: "Appuntamenti" },
];

function RegiaOperativa() {
  const queryClient = useQueryClient();
  const { effectiveCompany, isImpersonating, impersonatedCompanyId } =
    useAuth();
  const permissions = usePermissions();
  const r = useRegiaOperativa();
  const azioni = useAzioniRegia();
  const [filtroAgenda, setFiltroAgenda] = useState<"tutti" | TipoEvento>(
    "tutti",
  );
  const [agendaEstesa, setAgendaEstesa] = useState(false);
  // le azioni dirette scrivono su commesse e ordini fornitore: stesso permesso dell'elenco commesse
  const puoModificare =
    permissions.isAdmin ||
    (permissions.canEditOrders && !permissions.solaLettura);

  if (!effectiveCompany?.id) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        {isImpersonating || impersonatedCompanyId ? (
          <>
            <Loader2 className="mb-4 h-8 w-8 animate-spin" />
            <p className="font-medium text-foreground">Caricamento azienda…</p>
          </>
        ) : (
          <>
            <Users className="mb-4 h-12 w-12 opacity-50" />
            <p className="font-medium text-foreground">
              Nessuna azienda selezionata
            </p>
          </>
        )}
      </div>
    );
  }

  const aggiorna = () =>
    queryClient.invalidateQueries({ queryKey: ["regia-operativa"] });
  const oggi = new Date().toLocaleDateString("it-IT", {
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
      titolo: `${r.daApprovare} da approvare dal cantiere`,
      dettaglio: "Rapportini, correzioni di timbratura e bolle in attesa",
      to: "/azienda/attivita",
      grave: true,
    });
  if (r.merceInRitardo.totale > 0)
    blocchi.push({
      id: "merce",
      grave: true,
      titolo: `${r.merceInRitardo.totale} ${r.merceInRitardo.totale === 1 ? "ordine fornitore in ritardo" : "ordini fornitore in ritardo"}`,
      dettaglio: r.merceInRitardo.voci
        .map(
          (v) =>
            `${v.suppliers?.name || v.oda_number || "Fornitore"} (dal ${format(parseISO(v.expected_delivery_date), "d MMM", { locale: it })})`,
        )
        .join(" · "),
      to: "/azienda/ordini?tab=acquisto",
      // con il permesso, ogni ordine ha la sua riga e la sua data da spostare
      voci: puoModificare ? r.merceInRitardo.voci : undefined,
    });
  if (r.cantieriInRitardo > 0)
    blocchi.push({
      id: "ritardo",
      titolo: `${r.cantieriInRitardo} ${r.cantieriInRitardo === 1 ? "cantiere oltre la fine lavori" : "cantieri oltre la fine lavori"}`,
      dettaglio: "Aggiorna la fase o sposta la data",
      to: "/azienda/ordini",
      grave: false,
    });
  if (r.numeri.ticket > 0)
    blocchi.push({
      id: "ticket",
      titolo: `${r.numeri.ticket} ${r.numeri.ticket === 1 ? "richiesta di assistenza aperta" : "richieste di assistenza aperte"}`,
      dettaglio: "Clienti in attesa di una risposta",
      to: "/azienda/assistenza",
      grave: false,
    });

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
      <header className="flex flex-col justify-between gap-4 pt-1 xl:flex-row xl:items-center">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span>Dashboard Gestione</span>
            <DashboardSelectorBar title="Dashboard Gestione" soloSelettore />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Panoramica operativa
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {effectiveCompany.name} ·{" "}
            <span>{oggi.replace(/^./, (c) => c.toUpperCase())}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardQuickActions fullLabels />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-white"
            onClick={aggiorna}
            aria-label="Aggiorna"
            title="Aggiorna dati"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {r.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          Non riesco a caricare una parte della regia. Riprova con il tasto
          aggiorna.
        </p>
      )}

      <section aria-label="Riepilogo operativo">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-500">
            Lavori, consegne e appuntamenti nei prossimi 7 giorni
          </p>
          {(permissions.isAdmin || permissions.canViewCruscotto) && (
            <Link
              to="/azienda/cruscotto/aziendale"
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-primary"
            >
              Cruscotto economico <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {r.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[94px] rounded-xl" />
            ))
          ) : (
            <>
              <Numero
                etichetta="Lavori programmati"
                valore={r.numeri.lavori}
                icona={HardHat}
                to="/azienda/calendario"
                colore="bg-blue-50 text-blue-600"
              />
              <Numero
                etichetta="Consegne in arrivo"
                valore={r.numeri.merce}
                icona={Package}
                to="/azienda/ordini-acquisto"
                colore="bg-amber-50 text-amber-700"
              />
              <Numero
                etichetta="Appuntamenti"
                valore={r.numeri.appuntamenti}
                icona={CalendarDays}
                to="/azienda/calendario"
                colore="bg-violet-50 text-violet-600"
              />
              <Numero
                etichetta="Assistenza aperta"
                valore={r.numeri.ticket}
                icona={Wrench}
                to="/azienda/assistenza"
                colore="bg-teal-50 text-teal-700"
              />
            </>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)] items-start">
        {/* Agenda: solo i giorni con qualcosa */}
        <Card className="overflow-hidden rounded-xl border-slate-200/80 shadow-none">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base font-semibold">
                Agenda dei prossimi giorni
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Prossimi {GIORNI_AGENDA} giorni · lavori, consegne e incontri
              </p>
            </div>
            <Link
              to="/azienda/calendario"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary/5 px-2.5 py-2 text-xs font-medium text-primary hover:bg-primary/10"
            >
              Calendario <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            <div
              className="mb-4 mt-2 flex flex-wrap gap-1 rounded-lg bg-slate-100/70 p-1"
              role="group"
              aria-label="Tipo di evento in agenda"
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
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900",
                  )}
                >
                  {f.nome}
                </button>
              ))}
            </div>
            {r.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : perGiorno.size === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center gap-2 text-center">
                <CalendarDays className="mb-1 h-7 w-7 text-slate-300" />
                <p className="text-sm font-medium text-slate-700">
                  {filtroAgenda === "tutti"
                    ? "Niente in programma"
                    : "Nessun evento di questo tipo"}
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {filtroAgenda === "tutti"
                    ? "I lavori, le consegne e gli appuntamenti compariranno qui."
                    : "Scegli un altro filtro o apri il calendario completo."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...perGiorno.entries()].map(([g, eventi]) => (
                  <div key={g}>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <span>{quando(g)}</span>
                      <span className="h-px flex-1 bg-slate-100" />
                      <span className="font-normal">
                        {eventi.length < (totaliPerGiorno.get(g) ?? 0)
                          ? `${eventi.length} di ${totaliPerGiorno.get(g)} eventi`
                          : `${eventi.length} ${eventi.length === 1 ? "evento" : "eventi"}`}
                      </span>
                    </p>
                    <ul className="divide-y divide-slate-100">
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
                                className="block truncate text-sm font-medium text-slate-800"
                                title={`${e.cosa} · ${e.riferimento}`}
                              >
                                {e.cosa}
                                <span className="font-normal text-slate-500">
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
                                className="group flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-slate-50"
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
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500">
                    {Math.min(eventiFiltrati.length, limiteAgenda)} di{" "}
                    {eventiFiltrati.length} eventi
                  </span>
                  {eventiFiltrati.length > EVENTI_ANTEPRIMA && !agendaEstesa ? (
                    <button
                      type="button"
                      onClick={() => setAgendaEstesa(true)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Mostra altri eventi{" "}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  ) : agendaEstesa ? (
                    <button
                      type="button"
                      onClick={() => setAgendaEstesa(false)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Mostra meno
                    </button>
                  ) : null}
                  {agendaEstesa && eventiFiltrati.length > 24 && (
                    <Link
                      to="/azienda/calendario"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Tutti gli eventi nel calendario
                    </Link>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden rounded-xl border-slate-200/80 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base font-semibold">
                  Da sbloccare
                </CardTitle>
                {!r.isLoading && blocchi.length > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {blocchi.length} aree
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Le situazioni che richiedono attenzione.
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              {r.isLoading ? (
                <Skeleton className="h-28 w-full" />
              ) : blocchi.length === 0 ? (
                <p className="flex items-center gap-2 py-3 text-sm text-slate-600">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Niente
                  di fermo.
                </p>
              ) : (
                <ul className="space-y-2">
                  {blocchi.map((b) => (
                    <li
                      key={b.id}
                      className={cn(
                        "rounded-lg border-l-2 px-3",
                        b.grave
                          ? "border-rose-300 bg-rose-50/40"
                          : "border-amber-300 bg-amber-50/40",
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
                          <span className="block text-sm font-medium text-slate-800">
                            {b.titolo}
                          </span>
                          {!b.voci && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {b.dettaglio}
                            </span>
                          )}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-500" />
                      </Link>
                      {b.voci && (
                        <details className="pb-2 pl-7">
                          <summary className="cursor-pointer text-xs font-medium text-slate-600">
                            Mostra i primi {b.voci.length} ordini
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {b.voci.map((v) => (
                              <li
                                key={v.id}
                                className="flex items-center gap-2"
                              >
                                <Link
                                  to={`/azienda/ordini-acquisto/${v.id}`}
                                  className="min-w-0 flex-1 truncate text-xs text-muted-foreground hover:text-slate-800 hover:underline"
                                  title="Apri l'ordine per registrare l'arrivo"
                                >
                                  {v.suppliers?.name ||
                                    v.oda_number ||
                                    "Fornitore"}{" "}
                                  · atteso il{" "}
                                  {format(
                                    parseISO(v.expected_delivery_date),
                                    "d MMM",
                                    { locale: it },
                                  )}
                                </Link>
                                <SpostaData
                                  etichetta="Sposta l'arrivo"
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
      <section aria-label="Commesse da seguire">
        <Card className="overflow-hidden rounded-xl border-slate-200/80 shadow-none">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-base font-semibold">
                Commesse da seguire
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Prima le scadenze superate, poi i prossimi lavori.
              </p>
            </div>
            <Link
              to="/azienda/ordini"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Commesse <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {r.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : r.daSeguire.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                Nessuna commessa aperta con lavori in programma.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {r.daSeguire.map((c: CommessaDaSeguire) => (
                  <li key={c.id} className="flex items-center gap-2 py-1.5">
                    <Link
                      to={`/azienda/ordini/${c.id}`}
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-1 py-2 hover:bg-slate-50 sm:flex-nowrap"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {c.cliente || c.codice}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {c.cliente ? c.codice : "Commessa"}
                        </span>
                      </span>
                      <span className="hidden min-w-0 flex-1 truncate text-xs text-slate-500 sm:block">
                        {c.fase || "Fase non indicata"}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-1 text-xs font-medium tabular-nums",
                          c.ritardo !== null
                            ? "bg-rose-50 text-rose-700"
                            : "bg-slate-100 text-slate-600",
                        )}
                      >
                        {c.ritardo !== null
                          ? `${c.ritardo} ${c.ritardo === 1 ? "giorno" : "gg"} di ritardo`
                          : c.prossima
                            ? quando(c.prossima)
                            : ""}
                      </span>
                    </Link>
                    {puoModificare && c.ritardo !== null && (
                      <>
                        <SpostaData
                          etichetta="Sposta la fine lavori"
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
