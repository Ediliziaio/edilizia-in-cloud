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
import { Link, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, HardHat, LayoutDashboard,
  Loader2, Package, RefreshCw, Truck, Users, Wrench,
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
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardQuickActions } from "@/components/dashboard/DashboardQuickActions";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { GIORNI_AGENDA, useRegiaOperativa, type CommessaDaSeguire } from "@/hooks/useRegiaOperativa";
import { giorniDaOggi, type EventoAgenda } from "@/lib/regia/agendaOperativa";
import { useAzioniRegia } from "@/hooks/useAzioniRegia";
import { SegnaFinita, SpostaData } from "@/components/regia/AzioniRegia";

export default function CompanyDashboard() {
  const { isModuleEnabled, currentPlan, isLoading: planLoading } = useSubscriptionLimits({ includeUsageCounts: false });
  const soloMarketing = !planLoading && !!currentPlan && !isModuleEnabled("orders");
  if (soloMarketing) return <Navigate to={COMPANY_APP_HOME} replace />;
  return <RegiaOperativa />;
}

function quando(giorno: string): string {
  const d = giorniDaOggi(giorno);
  if (d === 0) return "Oggi";
  if (d === 1) return "Domani";
  return format(parseISO(giorno), "EEEE d MMMM", { locale: it }).replace(/^./, (c) => c.toUpperCase());
}

const ICONA_EVENTO = { lavoro: HardHat, merce: Truck, appuntamento: CalendarDays } as const;
const COLORE_EVENTO = { lavoro: "text-blue-600 bg-blue-50", merce: "text-amber-700 bg-amber-50", appuntamento: "text-violet-600 bg-violet-50" } as const;

function Numero({ etichetta, valore, icona: Icona, to }: { etichetta: string; valore: number; icona: typeof HardHat; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-primary/40 hover:shadow">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icona className="h-4 w-4" /></span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">{etichetta}</span>
        <span className="block text-2xl font-bold tabular-nums text-slate-900">{valore}</span>
      </span>
    </Link>
  );
}

function RegiaOperativa() {
  const queryClient = useQueryClient();
  const { effectiveCompany, isImpersonating, impersonatedCompanyId } = useAuth();
  const permissions = usePermissions();
  const r = useRegiaOperativa();
  const azioni = useAzioniRegia();
  // le azioni dirette scrivono su commesse e ordini fornitore: stesso permesso dell'elenco commesse
  const puoModificare = permissions.isAdmin || (permissions.canEditOrders && !permissions.solaLettura);

  if (!effectiveCompany?.id) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        {isImpersonating || impersonatedCompanyId
          ? <><Loader2 className="mb-4 h-8 w-8 animate-spin" /><p className="font-medium text-foreground">Caricamento azienda…</p></>
          : <><Users className="mb-4 h-12 w-12 opacity-50" /><p className="font-medium text-foreground">Nessuna azienda selezionata</p></>}
      </div>
    );
  }

  const aggiorna = () => queryClient.invalidateQueries({ queryKey: ["regia-operativa"] });
  const oggi = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  // Da sbloccare: in ordine di quanto fermano il lavoro
  const blocchi: Array<{ id: string; titolo: string; dettaglio: string; to: string; grave: boolean; voci?: typeof r.merceInRitardo.voci }> = [];
  if ((r.daApprovare ?? 0) > 0) blocchi.push({ id: "approvare", titolo: `${r.daApprovare} da approvare dal cantiere`, dettaglio: "Rapportini, correzioni di timbratura e bolle in attesa", to: "/azienda/attivita", grave: true });
  if (r.merceInRitardo.totale > 0) blocchi.push({
    id: "merce", grave: true,
    titolo: `${r.merceInRitardo.totale} ${r.merceInRitardo.totale === 1 ? "ordine fornitore in ritardo" : "ordini fornitore in ritardo"}`,
    dettaglio: r.merceInRitardo.voci.map((v) => `${v.suppliers?.name || v.oda_number || "Fornitore"} (dal ${format(parseISO(v.expected_delivery_date), "d MMM", { locale: it })})`).join(" · "),
    to: "/azienda/ordini?tab=acquisto",
    // con il permesso, ogni ordine ha la sua riga e la sua data da spostare
    voci: puoModificare ? r.merceInRitardo.voci : undefined,
  });
  if (r.cantieriInRitardo > 0) blocchi.push({ id: "ritardo", titolo: `${r.cantieriInRitardo} ${r.cantieriInRitardo === 1 ? "cantiere oltre la fine lavori" : "cantieri oltre la fine lavori"}`, dettaglio: "Aggiorna la fase o sposta la data", to: "/azienda/ordini", grave: false });
  if (r.numeri.ticket > 0) blocchi.push({ id: "ticket", titolo: `${r.numeri.ticket} ${r.numeri.ticket === 1 ? "richiesta di assistenza aperta" : "richieste di assistenza aperte"}`, dettaglio: "Clienti in attesa di una risposta", to: "/azienda/assistenza", grave: false });

  // agenda: solo i giorni con qualcosa, al massimo 24 eventi
  const perGiorno = new Map<string, EventoAgenda[]>();
  for (const e of r.agenda.slice(0, 24)) perGiorno.set(e.giorno, [...(perGiorno.get(e.giorno) ?? []), e]);

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Dashboard Gestione</h1>
      <OnboardingChecklist />

      <DashboardPageHeader
        title="Dashboard Gestione"
        subtitle={`Regia operativa · ${oggi}`}
        icon={LayoutDashboard}
        leftAccessory={<DashboardSelectorBar title="Dashboard Gestione" soloSelettore />}
        density="compact"
        actions={
          <>
            <DashboardQuickActions />
            {(permissions.isAdmin || permissions.canViewCruscotto) && (
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" asChild>
                <Link to="/azienda/cruscotto/aziendale">Numeri nel Cruscotto <ArrowRight className="h-3.5 w-3.5" /></Link>
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={aggiorna} aria-label="Aggiorna" title="Aggiorna">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {r.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Non riesco a caricare una parte della regia. Riprova con il tasto aggiorna.
        </p>
      )}

      {/* I prossimi 7 giorni in quattro numeri */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {r.isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[70px] rounded-xl" />) : (
          <>
            <Numero etichetta="Lavori · 7 giorni" valore={r.numeri.lavori} icona={HardHat} to="/azienda/calendario" />
            <Numero etichetta="Merce in arrivo · 7 giorni" valore={r.numeri.merce} icona={Package} to="/azienda/ordini-acquisto" />
            <Numero etichetta="Appuntamenti · 7 giorni" valore={r.numeri.appuntamenti} icona={CalendarDays} to="/azienda/calendario" />
            <Numero etichetta="Assistenza aperta" valore={r.numeri.ticket} icona={Wrench} to="/azienda/assistenza" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Agenda: solo i giorni con qualcosa */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Prossimi {GIORNI_AGENDA} giorni</CardTitle>
            <Link to="/azienda/calendario" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Calendario <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {r.isLoading ? <Skeleton className="h-48 w-full" /> : perGiorno.size === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Niente in programma: nessun lavoro, arrivo merce o appuntamento.</p>
            ) : (
              <div className="space-y-3">
                {[...perGiorno.entries()].map(([g, eventi]) => (
                  <div key={g}>
                    <p className="mb-1 text-xs font-semibold text-slate-500">{quando(g)}</p>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                      {eventi.map((e) => {
                        const Icona = ICONA_EVENTO[e.tipo];
                        const riga = (
                          <>
                            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", COLORE_EVENTO[e.tipo])}><Icona className="h-3.5 w-3.5" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-800">{e.cosa} · {e.riferimento}</span>
                              <span className="block truncate text-xs text-muted-foreground">{[e.cliente, e.dettaglio].filter(Boolean).join(" · ") || " "}</span>
                            </span>
                          </>
                        );
                        return (
                          <li key={e.id}>
                            {e.orderId
                              ? <Link to={`/azienda/ordini/${e.orderId}`} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">{riga}</Link>
                              : <div className="flex items-center gap-3 px-3 py-2">{riga}</div>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                {r.agenda.length > 24 && (
                  <Link to="/azienda/calendario" className="block text-xs font-medium text-primary hover:underline">
                    Altri {r.agenda.length - 24} eventi nel calendario
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Da sbloccare */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Da sbloccare</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {r.isLoading ? <Skeleton className="h-28 w-full" /> : blocchi.length === 0 ? (
                <p className="flex items-center gap-2 py-3 text-sm text-slate-600"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Niente di fermo.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {blocchi.map((b) => (
                    <li key={b.id}>
                      <Link to={b.to} className="group flex items-center gap-3 py-2.5">
                        {b.grave ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" /> : <ClipboardCheck className="h-4 w-4 shrink-0 text-amber-500" />}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-800">{b.titolo}</span>
                          {!b.voci && <span className="block truncate text-xs text-muted-foreground">{b.dettaglio}</span>}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-500" />
                      </Link>
                      {b.voci && (
                        <ul className="mb-2 ml-7 space-y-0.5">
                          {b.voci.map((v) => (
                            <li key={v.id} className="flex items-center gap-2">
                              <Link to={`/azienda/ordini-acquisto/${v.id}`} className="min-w-0 flex-1 truncate text-xs text-muted-foreground hover:text-slate-800 hover:underline" title="Apri l'ordine per registrare l'arrivo">
                                {v.suppliers?.name || v.oda_number || "Fornitore"} · atteso il {format(parseISO(v.expected_delivery_date), "d MMM", { locale: it })}
                              </Link>
                              <SpostaData
                                etichetta="Sposta l'arrivo"
                                attuale={v.expected_delivery_date}
                                inCorso={azioni.spostaArrivo.isPending && azioni.spostaArrivo.variables?.odaId === v.id}
                                onScegli={(giorno) => azioni.spostaArrivo.mutate({ odaId: v.id, giorno })}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Commesse da seguire */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Commesse da seguire</CardTitle>
              <Link to="/azienda/ordini" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Commesse <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              {r.isLoading ? <Skeleton className="h-40 w-full" /> : r.daSeguire.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">Nessuna commessa aperta con lavori in programma.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {r.daSeguire.map((c: CommessaDaSeguire) => (
                    <li key={c.id} className="flex items-center gap-1">
                      <Link to={`/azienda/ordini/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-2 hover:bg-slate-50">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">{c.codice}</span>
                          <span className="block truncate text-xs text-muted-foreground">{[c.cliente, c.fase].filter(Boolean).join(" · ") || " "}</span>
                        </span>
                        <span className={cn("shrink-0 text-xs font-semibold tabular-nums", c.ritardo !== null ? "text-red-600" : "text-slate-600")}>
                          {c.ritardo !== null ? `${c.ritardo} ${c.ritardo === 1 ? "giorno" : "gg"} di ritardo` : c.prossima ? quando(c.prossima) : ""}
                        </span>
                      </Link>
                      {puoModificare && c.ritardo !== null && (
                        <>
                          <SpostaData
                            etichetta="Sposta la fine lavori"
                            attuale={c.scadenza}
                            inCorso={azioni.spostaFineLavori.isPending && azioni.spostaFineLavori.variables?.orderId === c.id}
                            onScegli={(giorno) => azioni.spostaFineLavori.mutate({ orderId: c.id, giorno })}
                          />
                          {r.faseFinale && (
                            <SegnaFinita
                              codice={c.codice}
                              fase={r.faseFinale.nome}
                              inCorso={azioni.segnaFinita.isPending && azioni.segnaFinita.variables?.orderId === c.id}
                              onConferma={() => azioni.segnaFinita.mutate({ orderId: c.id, statusId: r.faseFinale!.id })}
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
        </div>
      </div>
    </div>
  );
}
