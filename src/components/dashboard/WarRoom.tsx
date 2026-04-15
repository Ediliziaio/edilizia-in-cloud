/**
 * WarRoom — La "sala operativa" della dashboard azienda.
 * Risponde a 3 domande in 5 secondi:
 *   1. Come sto a cassa oggi?
 *   2. Quali cantieri/ordini sono a rischio?
 *   3. Cosa devo fare entro 7 giorni?
 * Layout: 3 colonne desktop, 1 colonna mobile. Tutto cliccabile = drill-down.
 */
import { Link } from "react-router-dom";
import { ArrowRight, Wallet, AlertTriangle, CalendarClock, TrendingUp, TrendingDown, Package, Euro, Receipt, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { CashFlow, WeeklyDeadlinesData, FinancialAlert, UrgentItem, RecentOrder } from "@/hooks/useCompanyDashboardData";

interface WarRoomProps {
  cashFlow: CashFlow;
  weeklyDeadlines: WeeklyDeadlinesData;
  financialAlerts: FinancialAlert[];
  urgentItems: UrgentItem[];
  agingReceivables: { overdue: number; thisWeek: number; thisMonth: number; future: number };
  openTickets: number;
  recentOrders: RecentOrder[];
}

// ────────────────────────────────────────────────────────────────
// COLUMN 1 — CASSA & LIQUIDITÀ
// ────────────────────────────────────────────────────────────────
function CashColumn({ cashFlow, agingReceivables }: { cashFlow: CashFlow; agingReceivables: WarRoomProps["agingReceivables"] }) {
  const isHealthy = cashFlow.netCashFlow >= 0;
  const totalReceivables = agingReceivables.overdue + agingReceivables.thisWeek + agingReceivables.thisMonth + agingReceivables.future;
  const overduePercent = totalReceivables > 0 ? (agingReceivables.overdue / totalReceivables) * 100 : 0;

  return (
    <Card className={cn(
      "flex flex-col border-l-4 transition-colors",
      isHealthy ? "border-l-emerald-500" : "border-l-destructive"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              Cassa oggi
            </div>
            <CardTitle className={cn(
              "text-2xl sm:text-3xl font-bold mt-1 tabular-nums",
              isHealthy ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
            )}>
              {formatCurrency(cashFlow.netCashFlow)}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Saldo netto corrente · {isHealthy ? "situazione stabile" : "attenzione richiesta"}
            </p>
          </div>
          {isHealthy ? (
            <TrendingUp className="h-5 w-5 text-emerald-500 shrink-0 mt-1" />
          ) : (
            <TrendingDown className="h-5 w-5 text-destructive shrink-0 mt-1" />
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 pt-0">
        {/* Flusso mensile */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 p-2.5">
            <div className="text-[10px] uppercase text-emerald-700 dark:text-emerald-400 font-medium">Entrate mese</div>
            <div className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatCurrencyCompact(cashFlow.thisMonthIncome)}
            </div>
          </div>
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/40 p-2.5">
            <div className="text-[10px] uppercase text-rose-700 dark:text-rose-400 font-medium">Uscite mese</div>
            <div className="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-300">
              {formatCurrencyCompact(cashFlow.thisMonthOutflow)}
            </div>
          </div>
        </div>

        {/* Aging crediti */}
        {totalReceivables > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Crediti da incassare</span>
              <span className="tabular-nums text-muted-foreground">{formatCurrencyCompact(totalReceivables)}</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              {agingReceivables.overdue > 0 && (
                <div className="bg-destructive h-full" style={{ width: `${(agingReceivables.overdue / totalReceivables) * 100}%` }} title={`Scaduto: ${formatCurrency(agingReceivables.overdue)}`} />
              )}
              {agingReceivables.thisWeek > 0 && (
                <div className="bg-orange-500 h-full" style={{ width: `${(agingReceivables.thisWeek / totalReceivables) * 100}%` }} title={`Questa settimana: ${formatCurrency(agingReceivables.thisWeek)}`} />
              )}
              {agingReceivables.thisMonth > 0 && (
                <div className="bg-amber-500 h-full" style={{ width: `${(agingReceivables.thisMonth / totalReceivables) * 100}%` }} title={`Questo mese: ${formatCurrency(agingReceivables.thisMonth)}`} />
              )}
              {agingReceivables.future > 0 && (
                <div className="bg-emerald-500 h-full" style={{ width: `${(agingReceivables.future / totalReceivables) * 100}%` }} title={`Futuro: ${formatCurrency(agingReceivables.future)}`} />
              )}
            </div>
            {overduePercent > 20 && (
              <p className="text-[11px] text-destructive font-medium">
                ⚠ {overduePercent.toFixed(0)}% dei crediti è scaduto
              </p>
            )}
          </div>
        )}

        {/* Prossimo mese */}
        <div className="mt-auto rounded-lg border bg-muted/40 p-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase text-muted-foreground font-medium">Prev. prossimo mese</div>
            <div className="text-sm font-semibold tabular-nums">
              {formatCurrency(cashFlow.nextMonth)}
            </div>
          </div>
          <Link
            to="/azienda/previsionale"
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5 shrink-0"
          >
            Previsionale
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────
// COLUMN 2 — CANTIERI / ORDINI A RISCHIO
// ────────────────────────────────────────────────────────────────
function RisksColumn({ financialAlerts, urgentItems, openTickets, recentOrders }: {
  financialAlerts: FinancialAlert[];
  urgentItems: UrgentItem[];
  openTickets: number;
  recentOrders: RecentOrder[];
}) {
  // "Health score" sintetico: meno alert = meglio
  const riskCount = financialAlerts.length + urgentItems.filter(i => i.daysLeft <= 2).length + (openTickets > 0 ? 1 : 0);
  const healthScore = Math.max(0, 100 - riskCount * 15);
  const healthColor = healthScore >= 70 ? "emerald" : healthScore >= 40 ? "amber" : "rose";

  const colorMap = {
    emerald: { text: "text-emerald-600 dark:text-emerald-400", border: "border-l-emerald-500", bg: "bg-emerald-500" },
    amber: { text: "text-amber-600 dark:text-amber-400", border: "border-l-amber-500", bg: "bg-amber-500" },
    rose: { text: "text-rose-600 dark:text-rose-400", border: "border-l-rose-500", bg: "bg-rose-500" },
  }[healthColor];

  return (
    <Card className={cn("flex flex-col border-l-4 transition-colors", colorMap.border)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              Salute operativa
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <CardTitle className={cn("text-2xl sm:text-3xl font-bold tabular-nums", colorMap.text)}>
                {healthScore}
              </CardTitle>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {healthScore >= 70 ? "Tutto sotto controllo" : healthScore >= 40 ? "Serve attenzione" : "Azione immediata richiesta"}
            </p>
          </div>
        </div>
        <Progress value={healthScore} className="h-1.5 mt-2" />
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-2 pt-0">
        {/* Alert finanziari */}
        {financialAlerts.length > 0 && (
          <div className="space-y-1.5">
            {financialAlerts.slice(0, 2).map((alert, idx) => (
              <div
                key={`alert-${idx}`}
                className={cn(
                  "flex items-start gap-2 rounded-md p-2 text-xs border",
                  alert.type === "error"
                    ? "bg-destructive/10 border-destructive/30 text-destructive"
                    : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800/50 dark:text-amber-300"
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{alert.message}</span>
              </div>
            ))}
            {financialAlerts.length > 2 && (
              <div className="text-[11px] text-muted-foreground pl-1">
                +{financialAlerts.length - 2} altri alert
              </div>
            )}
          </div>
        )}

        {/* Articoli magazzino urgenti */}
        {urgentItems.length > 0 && (
          <Link
            to="/azienda/magazzino"
            className="group flex items-center justify-between gap-2 rounded-md bg-muted/40 hover:bg-muted p-2 text-xs transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Package className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-medium truncate">
                {urgentItems.length} articol{urgentItems.length === 1 ? "o" : "i"} in arrivo
              </span>
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5">
              {urgentItems.filter(i => i.daysLeft <= 2).length > 0 ? `${urgentItems.filter(i => i.daysLeft <= 2).length} urgenti` : "Tutti ok"}
            </Badge>
          </Link>
        )}

        {/* Ticket aperti */}
        {openTickets > 0 && (
          <Link
            to="/azienda/ticket"
            className="group flex items-center justify-between gap-2 rounded-md bg-muted/40 hover:bg-muted p-2 text-xs transition-colors"
          >
            <div className="flex items-center gap-2">
              <Receipt className="h-3.5 w-3.5 text-orange-500" />
              <span className="font-medium">{openTickets} ticket apert{openTickets === 1 ? "o" : "i"}</span>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}

        {/* Stato "tutto ok" */}
        {financialAlerts.length === 0 && urgentItems.length === 0 && openTickets === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-4 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
            <p className="text-xs font-medium">Nessuna criticità rilevata</p>
            <p className="text-[11px] mt-0.5">Cantieri e ordini in linea</p>
          </div>
        )}

        {/* Ultimi ordini (preview) */}
        {recentOrders.length > 0 && (
          <div className="mt-auto pt-2 border-t">
            <Link
              to="/azienda/ordini"
              className="flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="uppercase tracking-wider font-medium">{recentOrders.length} ordin{recentOrders.length === 1 ? "e recente" : "i recenti"}</span>
              <span className="inline-flex items-center gap-0.5 text-primary font-medium">
                Vedi tutti <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────
// COLUMN 3 — AZIONI ≤ 7 GIORNI
// ────────────────────────────────────────────────────────────────
interface ActionItem {
  id: string;
  label: string;
  sublabel?: string;
  amount?: number;
  daysLeft: number;
  href: string;
  icon: typeof Euro;
}

function ActionsColumn({ weeklyDeadlines }: { weeklyDeadlines: WeeklyDeadlinesData }) {
  // Aggrega tutte le azioni e ordina per urgenza
  const actions: ActionItem[] = [];

  weeklyDeadlines.receivables?.forEach((r, i) => {
    actions.push({
      id: `rec-${i}`,
      label: r.orderDescription || "Incasso",
      sublabel: r.customerName,
      amount: r.amount,
      daysLeft: r.daysLeft,
      href: "/azienda/ordini",
      icon: Euro,
    });
  });

  weeklyDeadlines.companyCosts?.forEach((c, i) => {
    actions.push({
      id: `cost-${i}`,
      label: c.name,
      amount: -c.amount,
      daysLeft: c.daysLeft,
      href: "/azienda/costi-aziendali",
      icon: Receipt,
    });
  });

  weeklyDeadlines.upcomingWorks?.forEach((w, i) => {
    actions.push({
      id: `work-${i}`,
      label: `Lavoro #${w.orderCode}`,
      sublabel: w.customerName,
      daysLeft: w.daysLeft,
      href: `/azienda/ordini`,
      icon: CalendarClock,
    });
  });

  actions.sort((a, b) => a.daysLeft - b.daysLeft);
  const limited = actions.slice(0, 6);

  const todayCount = actions.filter(a => a.daysLeft === 0).length;
  const tomorrowCount = actions.filter(a => a.daysLeft === 1).length;

  const borderColor = todayCount > 0 ? "border-l-destructive" : tomorrowCount > 0 ? "border-l-orange-500" : "border-l-primary";

  return (
    <Card className={cn("flex flex-col border-l-4 transition-colors", borderColor)}>
      <CardHeader className="pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            Azioni ≤ 7 giorni
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <CardTitle className="text-2xl sm:text-3xl font-bold tabular-nums">
              {actions.length}
            </CardTitle>
            {todayCount > 0 && (
              <Badge variant="destructive" className="text-[10px] h-5">
                {todayCount} oggi
              </Badge>
            )}
            {tomorrowCount > 0 && (
              <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] h-5 border-0">
                {tomorrowCount} domani
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scadenze operative della settimana
          </p>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-1 pt-0">
        {limited.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
            <p className="text-xs font-medium">Settimana libera</p>
            <p className="text-[11px] mt-0.5">Nessuna scadenza imminente</p>
          </div>
        ) : (
          <>
            {limited.map((action) => {
              const Icon = action.icon;
              const urgent = action.daysLeft === 0;
              const warn = action.daysLeft === 1;
              return (
                <Link
                  key={action.id}
                  to={action.href}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                    urgent
                      ? "bg-destructive/10 hover:bg-destructive/15 border border-destructive/20"
                      : warn
                        ? "bg-orange-50 hover:bg-orange-100 border border-orange-200 dark:bg-orange-950/20 dark:hover:bg-orange-950/30 dark:border-orange-800/40"
                        : "hover:bg-muted"
                  )}
                >
                  <Icon className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    urgent ? "text-destructive" : warn ? "text-orange-500" : "text-muted-foreground"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{action.label}</div>
                    {action.sublabel && (
                      <div className="text-[10px] text-muted-foreground truncate">{action.sublabel}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    {action.amount !== undefined && (
                      <span className={cn(
                        "text-[11px] tabular-nums font-semibold",
                        action.amount < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                      )}>
                        {formatCurrencyCompact(Math.abs(action.amount))}
                      </span>
                    )}
                    <span className={cn(
                      "text-[10px] font-medium",
                      urgent ? "text-destructive" : warn ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
                    )}>
                      {action.daysLeft === 0 ? "Oggi" : action.daysLeft === 1 ? "Domani" : `${action.daysLeft}gg`}
                    </span>
                  </div>
                </Link>
              );
            })}
            {actions.length > limited.length && (
              <div className="mt-1 pt-2 border-t text-center">
                <span className="text-[11px] text-muted-foreground">
                  +{actions.length - limited.length} altre azioni
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ────────────────────────────────────────────────────────────────
export function WarRoom(props: WarRoomProps) {
  return (
    <section aria-label="War Room operativa" className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3">
      <CashColumn cashFlow={props.cashFlow} agingReceivables={props.agingReceivables} />
      <RisksColumn
        financialAlerts={props.financialAlerts}
        urgentItems={props.urgentItems}
        openTickets={props.openTickets}
        recentOrders={props.recentOrders}
      />
      <ActionsColumn weeklyDeadlines={props.weeklyDeadlines} />
    </section>
  );
}
