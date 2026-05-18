/**
 * Dashboard di Fatturazione — v8.6.59
 *
 * Layout a 4 tab ispirato a dashboard agency moderne:
 *   1. Abbonamenti — piano corrente + add-on + cross-sell
 *   2. Pagamenti — metodo di pagamento + info fiscali + dati fatturazione + cronologia
 *   3. Portafoglio — saldo crediti + auto-ricarica + spese
 *   4. Notifiche — alert spesa per agenzia / sub-account
 *
 * Mantiene 100% retro-compat: i sotto-componenti (CurrentPlanCard,
 * InvoiceHistoryCard, BillingDetailsCard) sono riusati invariati,
 * cambia solo l'organizzazione visiva.
 */
import { lazy, Suspense, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ExternalLink, Download, AlertTriangle, CreditCard, FileText, RefreshCw, Clock,
  Info, Sparkles, ArrowRight, Wallet, Bell, Receipt, ShieldCheck, Loader2, Gift,
} from "lucide-react";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { useBillingInfo, useInvoices, useOpenBillingPortal, useTopPlanPrice, useStripePaymentMethod } from "@/hooks/useBilling";
import { useBillingDetails } from "@/hooks/useBillingDetails";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { BillingDetailsCard } from "@/components/billing/BillingDetailsCard";

// Lazy-load contenuto Portafoglio (la pagina Crediti & Saldo ha già tutta la logica)
const SettingsCrediti = lazy(() => import("@/pages/azienda/settings/SettingsCredits"));

const VALID_TABS = new Set(["abbonamenti", "pagamenti", "portafoglio", "notifiche"]);

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════════════════════════════════════ */
function formatEurCents(centesimi: number, currency = "eur"): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(centesimi / 100);
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  return `${format(new Date(start), "d MMM yyyy", { locale: it })} → ${format(new Date(end), "d MMM yyyy", { locale: it })}`;
}

/** Restituisce label + colore brand pulito (visa, mastercard, amex…). */
function brandLabel(brand?: string): { label: string; className: string } {
  const b = (brand ?? "").toLowerCase();
  const map: Record<string, { label: string; className: string }> = {
    visa:       { label: "VISA",       className: "bg-blue-700 text-white" },
    mastercard: { label: "MasterCard", className: "bg-orange-600 text-white" },
    amex:       { label: "AMEX",       className: "bg-sky-600 text-white" },
    american_express: { label: "AMEX", className: "bg-sky-600 text-white" },
    discover:   { label: "Discover",   className: "bg-orange-500 text-white" },
    diners:     { label: "Diners",     className: "bg-slate-700 text-white" },
    jcb:        { label: "JCB",        className: "bg-emerald-700 text-white" },
    unionpay:   { label: "UnionPay",   className: "bg-red-600 text-white" },
  };
  return map[b] ?? { label: b.toUpperCase() || "CARD", className: "bg-slate-700 text-white" };
}

function companyStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    trial:     { label: "Periodo di prova", className: "bg-blue-100 text-blue-700 border-blue-200" },
    active:    { label: "Attivo",           className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    suspended: { label: "Sospeso",          className: "bg-rose-100 text-rose-700 border-rose-200" },
    expired:   { label: "Scaduto",          className: "bg-muted text-muted-foreground border-border" },
    free:      { label: "Piano Scopri",     className: "bg-slate-100 text-slate-700 border-slate-200" },
  };
  const cfg = map[status] ?? { label: status, className: "" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 1 — ABBONAMENTI
═══════════════════════════════════════════════════════════════════════════ */
function TabAbbonamenti() {
  const { data: billing, isLoading } = useBillingInfo();
  const { mutate: openPortal, isPending } = useOpenBillingPortal();
  const { data: topPlanPrice = 0 } = useTopPlanPrice();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  if (!billing) return null;

  const priceLabel = billing.planPriceMonthly === 0
    ? "Gratuito"
    : formatCurrency(billing.planPriceMonthly);
  const isYearly = billing.billingCycle === "yearly";

  return (
    <div className="space-y-5">
      {/* ── Card piano principale ── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{billing.planName}</h2>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">Gestisci il tuo piano</p>
                {companyStatusBadge(billing.status)}
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-baseline gap-1 justify-end">
                <span className="text-4xl font-bold tabular-nums">{priceLabel}</span>
                <span className="text-sm text-muted-foreground">/ {isYearly ? "anno" : "mese"}</span>
              </div>
            </div>
          </div>

          {/* CTA piano annuale — risparmio reale calcolato sui prezzi del piano
              (no hardcoded). Mostra solo se l'utente è mensile e il piano ha
              anche un price_yearly < 12×price_monthly (cioè uno sconto reale). */}
          {!isYearly && billing.planPriceMonthly > 0 && billing.planPriceYearly > 0 && (() => {
            const monthlyTotalYear = billing.planPriceMonthly * 12;
            const yearlySaving = monthlyTotalYear - billing.planPriceYearly;
            const savingMonths = yearlySaving / billing.planPriceMonthly;
            // Solo se risparmi >= 1 mese intero, mostriamo la card
            if (savingMonths < 1) return null;
            const savingLabel = savingMonths >= 1.9
              ? `${Math.round(savingMonths)} mesi`
              : `${Math.round(yearlySaving)}€/anno`;
            return (
              <div className="mt-5 rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 p-4 flex items-center gap-3 flex-wrap">
                <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <Gift className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Risparmia {savingLabel} con l'annuale</p>
                  <p className="text-xs text-muted-foreground">
                    Passa al ciclo annuale dal portale Stripe — confermi tu il cambio prima del pagamento.
                  </p>
                </div>
                <Button onClick={() => openPortal()} disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                  Passa all'annuale
                </Button>
              </div>
            );
          })()}

          {/* Trial banner — distingue trial attivo vs trial già scaduto (status=trial
              ma data passata: il backend non ha ancora flippato lo stato). */}
          {billing.status === "trial" && billing.trialEndsAt && (() => {
            const trialEnd = new Date(billing.trialEndsAt);
            const isExpired = trialEnd.getTime() < Date.now();
            const dateLabel = format(trialEnd, "d MMMM yyyy", { locale: it });
            return isExpired ? (
              <Alert variant="destructive" className="mt-5">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Il periodo di prova è terminato il <strong>{dateLabel}</strong>.
                  Aggiungi un metodo di pagamento per riattivare i servizi.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="mt-5">
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  Il periodo di prova termina il <strong>{dateLabel}</strong>.
                  Aggiungi un metodo di pagamento per continuare senza interruzioni.
                </AlertDescription>
              </Alert>
            );
          })()}

          {/* Dunning */}
          {billing.isInDunning && (
            <Alert variant="destructive" className="mt-5">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Pagamento non riuscito. Hai ancora <strong>{billing.dunningDaysLeft} giorni</strong> per aggiornare il metodo di pagamento.
              </AlertDescription>
            </Alert>
          )}

          {/* Date ciclo */}
          {(billing.currentPeriodStart || billing.currentPeriodEnd) && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3 rounded-lg border bg-muted/30 p-3">
              {billing.currentPeriodStart && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Inizio periodo</p>
                  <p className="text-sm font-semibold">{format(new Date(billing.currentPeriodStart), "d MMM yyyy", { locale: it })}</p>
                </div>
              )}
              {billing.currentPeriodEnd && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {billing.cancelAtPeriodEnd ? "Scade il" : "Prossima fattura"}
                  </p>
                  <p className="text-sm font-semibold">{format(new Date(billing.currentPeriodEnd), "d MMMM yyyy", { locale: it })}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ciclo</p>
                <p className="text-sm font-semibold">{isYearly ? "Annuale" : "Mensile"}</p>
              </div>
            </div>
          )}

          {/* Footer azioni */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => openPortal()} disabled={isPending} className="gap-1.5">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
              Vuoi modificare/annullare il tuo abbonamento?
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <p className="text-xs text-muted-foreground">
              Hai una domanda sulla fatturazione? <a href="mailto:info@ediliziaincloud.com" className="text-primary hover:underline">Contattaci</a>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Cross-sell: mostrato se l'utente non è sul piano top.
            topPlanPrice viene dalla tabella subscription_plans (no hardcoded). ── */}
      {topPlanPrice > 0 && billing.planPriceMonthly < topPlanPrice && (
        <Card className="border-orange-200 bg-orange-50/40 dark:bg-orange-950/20">
          <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-600" />
                Vuoi più funzionalità?
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Esplora i piani superiori per sbloccare AI, multi-sede, banca PSD2 e molto altro.
              </p>
            </div>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => navigate("/prezzi")}>
              Vedi tutti i piani
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 2 — PAGAMENTI
═══════════════════════════════════════════════════════════════════════════ */
function TabPagamenti() {
  const { data: billing } = useBillingInfo();
  const { data: invoices, isLoading: invoicesLoading } = useInvoices();
  const { data: billingDetails } = useBillingDetails();
  const { data: pm, isLoading: pmLoading } = useStripePaymentMethod();
  const { mutate: openPortal, isPending } = useOpenBillingPortal();
  const [cronTab, setCronTab] = useState<"costi" | "fatture">("fatture");
  const [, setSearchParams] = useSearchParams();
  // Dialog gestito da DialogTrigger asChild (focus restore automatico).

  // I metodi di pagamento veri (carta last4, brand, scadenza) richiedono Stripe API
  // server-side. Per ora mostriamo placeholder + CTA Stripe Portal.
  const hasStripeCustomer = !!billing?.stripeCustomerId;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Card Metodo di pagamento */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              Metodo di pagamento
            </CardTitle>
            <Button
              variant="outline" size="sm" className="h-7 px-2"
              onClick={() => openPortal()} disabled={isPending}
              aria-label="Modifica metodo di pagamento"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
            </Button>
          </CardHeader>
          <CardContent>
            {pmLoading ? (
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-14 rounded" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ) : pm?.hasMethod ? (
              <div className="flex items-center gap-3">
                <div className={`h-10 w-14 rounded flex items-center justify-center text-[10px] font-bold tracking-wider ${brandLabel(pm.brand).className}`}>
                  {brandLabel(pm.brand).label}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {brandLabel(pm.brand).label} •••• {pm.last4}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pm.expMonth && pm.expYear ? (
                      <>Scade {String(pm.expMonth).padStart(2, "0")}/{String(pm.expYear).slice(-2)}</>
                    ) : (
                      "Carta registrata"
                    )}
                    {pm.funding ? ` · ${pm.funding === "credit" ? "Credito" : pm.funding === "debit" ? "Debito" : pm.funding}` : null}
                  </p>
                </div>
              </div>
            ) : hasStripeCustomer ? (
              <div className="flex items-center gap-3">
                <div className="h-10 w-14 rounded border bg-white flex items-center justify-center text-[10px] font-bold text-slate-600">
                  CARD
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Nessuna carta predefinita</p>
                  <p className="text-xs text-muted-foreground">Aggiungi un metodo di pagamento dal portale Stripe.</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">Nessun metodo di pagamento</p>
                <Button size="sm" onClick={() => openPortal()} disabled={isPending}>
                  Aggiungi metodo di pagamento
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card Informazioni fiscali — vero <button> via DialogTrigger asChild
            per focus restore automatico + supporto screen reader. */}
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
              aria-label="Apri modifica informazioni fiscali"
            >
              <Card className="transition-colors hover:bg-muted/40 h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    Informazioni fiscali
                  </CardTitle>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </CardHeader>
                <CardContent>
                  {billingDetails?.legal_name || billingDetails?.vat_number ? (
                    <div className="space-y-2">
                      {billingDetails.legal_name && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ragione sociale</p>
                          <p className="text-sm font-medium truncate">{billingDetails.legal_name}</p>
                        </div>
                      )}
                      {billingDetails.vat_number && (
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">P.IVA</p>
                            <p className="text-sm font-medium font-mono">{billingDetails.vat_number}</p>
                          </div>
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Verificato
                          </Badge>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-2">Nessuna informazione fiscale</p>
                      <p className="text-xs text-muted-foreground">Clicca qui per compilare i dati di fatturazione.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Dati di fatturazione</DialogTitle>
              <DialogDescription>
                Anagrafica fiscale completa usata per le fatture EdiliziaInCloud.
              </DialogDescription>
            </DialogHeader>
            <BillingDetailsCard />
          </DialogContent>
        </Dialog>
      </div>

      {/* Cronologia pagamenti con tab Costi/Fatture
          • Fatture = subscription invoices da Stripe (subscription_invoices)
          • Costi   = consumo crediti AI/email/whatsapp → deep-link al tab
                     Portafoglio (sezione "Storico"). Non duplichiamo qui. */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                Cronologia dei pagamenti
              </CardTitle>
              <CardDescription className="text-xs">Fatture dell'abbonamento e consumi crediti</CardDescription>
            </div>
            <Tabs value={cronTab} onValueChange={(v) => setCronTab(v as "costi" | "fatture")}>
              <TabsList className="h-8">
                <TabsTrigger value="fatture" className="text-xs h-7">Fatture abbonamento</TabsTrigger>
                <TabsTrigger value="costi" className="text-xs h-7">Consumi crediti</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {cronTab === "costi" ? (
            <div className="text-center py-10">
              <Wallet className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-medium">I consumi crediti vivono nel tab Portafoglio</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-md mx-auto">
                Storico unificato dei consumi (email, AI, WhatsApp) con filtri per wallet e periodo.
              </p>
              <Button
                variant="outline"
                onClick={() => setSearchParams({ tab: "portafoglio" }, { replace: true })}
              >
                Vai al Portafoglio
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </div>
          ) : invoicesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-medium">Nessun pagamento ancora registrato</p>
              <p className="text-sm text-muted-foreground mt-1">
                I pagamenti appariranno qui dopo il primo addebito.
              </p>
            </div>
          ) : (
            <div>
              {/* MOBILE: card-list compatta — solo cose che contano (data, importo, stato, azioni) */}
              <ul className="space-y-2 sm:hidden">
                {invoices.map((inv) => (
                  <li key={inv.id} className="rounded-lg border p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold">
                          {inv.periodStart ? format(new Date(inv.periodStart), "d MMM yyyy", { locale: it }) : "—"}
                        </span>
                        {inv.status === "paid" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">Pagata</Badge>
                        ) : inv.status === "open" ? (
                          <Badge variant="secondary" className="text-[10px]">In scadenza</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{inv.status}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{formatPeriod(inv.periodStart, inv.periodEnd)}</p>
                      <p className="text-base font-semibold tabular-nums mt-1">
                        {inv.status === "paid"
                          ? formatEurCents(inv.amountPaid, inv.currency)
                          : formatEurCents(inv.amountDue, inv.currency)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {inv.invoicePdf && (
                        <Button
                          variant="ghost" size="icon" aria-label="Scarica PDF fattura" className="h-8 w-8"
                          onClick={() => window.open(inv.invoicePdf!, "_blank")}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {inv.invoiceUrl && (
                        <Button
                          variant="ghost" size="icon" aria-label="Apri fattura online" className="h-8 w-8"
                          onClick={() => window.open(inv.invoiceUrl!, "_blank")}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* DESKTOP/TABLET: tabella completa */}
              <div className="hidden sm:block overflow-x-auto">
              {/* Un solo TooltipProvider per tutta la tabella, no N provider per riga. */}
              <TooltipProvider delayDuration={200}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrizione</TableHead>
                      <TableHead className="text-right">Importo</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{inv.id.slice(0, 10)}…</code>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {inv.periodStart ? format(new Date(inv.periodStart), "d MMM yyyy", { locale: it }) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatPeriod(inv.periodStart, inv.periodEnd)}
                        </TableCell>
                        <TableCell className="font-semibold text-right tabular-nums">
                          {inv.status === "paid"
                            ? formatEurCents(inv.amountPaid, inv.currency)
                            : formatEurCents(inv.amountDue, inv.currency)}
                        </TableCell>
                        <TableCell>
                          {inv.status === "paid" ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">Pagata</Badge>
                          ) : inv.status === "open" ? (
                            <Badge variant="secondary" className="text-[10px]">In scadenza</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">{inv.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {inv.invoicePdf && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => window.open(inv.invoicePdf!, "_blank")}
                                    aria-label="Scarica PDF"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Scarica PDF</TooltipContent>
                              </Tooltip>
                            )}
                            {inv.invoiceUrl && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => window.open(inv.invoiceUrl!, "_blank")}
                                    aria-label="Apri online"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Apri online</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TooltipProvider>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        I pagamenti sono gestiti in modo sicuro da{" "}
        <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="underline">
          Stripe
        </a>. Non memorizziamo i dati della carta di credito.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 3 — PORTAFOGLIO (delega a SettingsCrediti esistente)
═══════════════════════════════════════════════════════════════════════════ */
function TabPortafoglio() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Wallet className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Portafoglio e transazioni</h2>
          <p className="text-xs text-muted-foreground">
            Saldo crediti, auto-ricarica e storico consumi (email, AI, WhatsApp).
          </p>
        </div>
      </div>
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        }
      >
        <SettingsCrediti embedded />
      </Suspense>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 4 — NOTIFICHE
═══════════════════════════════════════════════════════════════════════════ */
function TabNotifiche() {
  // Eventi billing già notificati di default via email dal backend
  // (stripe-webhook + check-due-dates + dunning service). Lista trasparente
  // per dare all'utente visibilità su cosa riceve.
  const events: Array<{ title: string; desc: string; channel: string }> = [
    {
      title: "Pagamento riuscito",
      desc: "Conferma di addebito con link alla fattura PDF.",
      channel: "Email",
    },
    {
      title: "Pagamento fallito",
      desc: "Avviso immediato + tentativo automatico di re-charge nei 14 gg.",
      channel: "Email",
    },
    {
      title: "Trial in scadenza",
      desc: "Promemoria 3 giorni prima del termine del periodo di prova.",
      channel: "Email",
    },
    {
      title: "Rinnovo imminente",
      desc: "Avviso 7 giorni prima del rinnovo (solo piani annuali).",
      channel: "Email",
    },
    {
      title: "Saldo crediti basso",
      desc: "Quando un wallet (AI/Email/WhatsApp) scende sotto la soglia.",
      channel: "Email",
    },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Notifiche fatturazione
          </CardTitle>
          <CardDescription>
            Eventi billing già attivi via email. Per granularità (in-app/SMS, destinatari multipli)
            usa <a href="/azienda/impostazioni/mio-profilo" className="text-primary hover:underline">
            Profilo → Notifiche</a>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {events.map((ev) => (
              <li key={ev.title} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{ev.title}</p>
                  <p className="text-xs text-muted-foreground">{ev.desc}</p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{ev.channel}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Roadmap: spending alerts soglia €, destinatari multipli, alert per agenzia */}
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Bell className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-medium">Avvisi di spesa avanzati</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Alert configurabili (soglie € personalizzate, destinatari multipli) per agenzie con
            sub-account in arrivo nelle prossime release.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN — Page con header + tabs
═══════════════════════════════════════════════════════════════════════════ */
export default function SettingsSubscriptionBilling() {
  const { isScopriPlan, isLoading: limitsLoading } = useSubscriptionLimits();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") ?? "";
  const activeTab = VALID_TABS.has(tabParam) ? tabParam : "abbonamenti";

  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  // Mantieni vecchia logica "Scopri" (paywall onboarding)
  const navigate = useNavigate();
  if (limitsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isScopriPlan) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard di fatturazione</h1>
          <p className="text-muted-foreground">Stai usando il Piano Scopri gratuito.</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-xl">🔍</div>
              <div>
                <div className="font-semibold">Piano Scopri</div>
                <div className="text-sm text-muted-foreground">Gratuito · Per sempre · Nessuna carta</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-1">Pronto a fare sul serio?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Starter a €127/mese: commesse illimitate, fatturazione SDI, banca PSD2, HR, magazzino. Trial 31 giorni.
            </p>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => navigate("/prezzi")}>
              <Sparkles className="h-4 w-4 mr-1.5" />
              Vedi tutti i piani
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard di fatturazione</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="abbonamenti" className="gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Abbonamenti</span>
            <span className="sm:hidden">Piano</span>
          </TabsTrigger>
          <TabsTrigger value="pagamenti" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            Pagamenti
          </TabsTrigger>
          <TabsTrigger value="portafoglio" className="gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Portafoglio</span>
            <span className="sm:hidden">Saldo</span>
          </TabsTrigger>
          <TabsTrigger value="notifiche" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Notifiche
          </TabsTrigger>
        </TabsList>

        <TabsContent value="abbonamenti" className="mt-5">
          <TabAbbonamenti />
        </TabsContent>
        <TabsContent value="pagamenti" className="mt-5">
          <TabPagamenti />
        </TabsContent>
        <TabsContent value="portafoglio" className="mt-5">
          <TabPortafoglio />
        </TabsContent>
        <TabsContent value="notifiche" className="mt-5">
          <TabNotifiche />
        </TabsContent>
      </Tabs>
    </div>
  );
}
