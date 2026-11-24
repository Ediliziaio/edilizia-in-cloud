/**
 * Piano abbonamento — il piano di EdiliziaInCloud, i pagamenti, le sue fatture e i crediti.
 *
 * Tre schede (gli indirizzi `?tab=` non cambiano, solo i nomi che si leggono):
 *   1. Piano (`abbonamenti`) — piano corrente, cambio e annullamento
 *   2. Pagamenti (`pagamenti`) — metodo di pagamento, dati fiscali, fatture dell'abbonamento
 *   3. Crediti (`portafoglio`) — saldo, ricarica anche automatica, consumi
 *
 * 09/10/2026: via la scheda «Notifiche» (un elenco fisso di cinque email, due delle quali con regole che il
 * codice smentiva, un link che non apriva la scheda giusta e una promessa senza data) e via la
 * sotto-scheda «Consumi crediti» dei Pagamenti, che conteneva solo un rimando. Un vecchio indirizzo
 * `?tab=notifiche` apre il Piano.
 */
import { lazy, Suspense, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ExternalLink, Download, AlertTriangle, CreditCard, Clock,
  Sparkles, ArrowRight, Wallet, Layers, Receipt, ShieldCheck, Loader2, Gift,
  ArrowUpRight, ArrowDownRight, XCircle,
} from "lucide-react";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { usePermissions } from "@/hooks/usePermissions";
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
import { useBillingInfo, useInvoices, useOpenBillingPortal, useTopPlanPrice, useStripePaymentMethod, useAutoTopupFailure, useStartCardSetup, useStartPlanCheckout, abbonamentoDaAttivare } from "@/hooks/useBilling";
import { useBillingDetails } from "@/hooks/useBillingDetails";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { BillingDetailsCard } from "@/components/billing/BillingDetailsCard";
import { PlanChangeDialog, CancelPlanDialog } from "@/components/billing/PlanChangeDialog";
import { EMAIL_ASSISTENZA } from "@/lib/impostazioni/contattiEdiliziaInCloud";

import { useIsMobile } from "@/hooks/use-mobile";
import { AvvisoSoloDaComputer } from "@/components/mobile/SoloDaComputer";
import { SpazioArchiviazioneCard } from "@/components/billing/SpazioArchiviazioneCard";
import { useT, intlCampo, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";
// Lazy-load contenuto Portafoglio (la pagina Crediti & Saldo ha già tutta la logica)
const SettingsCrediti = lazy(() => import("@/pages/azienda/settings/SettingsCredits"));

const VALID_TABS = new Set(["abbonamenti", "pagamenti", "portafoglio"]);

/** Aziende che pagano fuori da Stripe: qui non c'è una carta da aggiungere. */
const PAGAMENTO_A_PARTE: Record<string, string> = {
  comped: "Piano offerto: nessun pagamento richiesto.",
  bank_transfer: "Paghi con bonifico: non serve una carta.",
  sepa_debit: "Paghi con addebito SEPA concordato: non serve una carta.",
  other: "Pagamento concordato a parte: non serve una carta.",
};

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════════════════════════════════════ */
function formatEurCents(centesimi: number, currency = "eur"): string {
  return new Intl.NumberFormat(intlCampo(), {
    style: "currency",
    currency: currency.toUpperCase(), useGrouping: "always" }).format(centesimi / 100);
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const s = new Date(start);
  const e = new Date(end);
  // Stripe sulla prima fattura mette period_start = period_end (stesso giorno):
  // "15 lug 2026 → 15 lug 2026" è rumore, mostriamo la sola data.
  if (s.toDateString() === e.toDateString()) return format(s, "d MMM yyyy", { locale: dateFnsCampo() });
  return `${format(s, "d MMM yyyy", { locale: dateFnsCampo() })} → ${format(e, "d MMM yyyy", { locale: dateFnsCampo() })}`;
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

/** Lo stato di una fattura di Stripe, in parole: prima «aperta» diventava «In scadenza» e il resto usciva grezzo. */
function StatoFattura({ stato }: { stato: string }) {
  const t = useT();
  if (stato === "paid") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">{t("Pagata")}</Badge>;
  const etichette: Record<string, string> = {
    open: "Da pagare",
    draft: "Bozza",
    void: "Annullata",
    uncollectible: "Non incassata",
  };
  return <Badge variant={stato === "open" ? "secondary" : "outline"} className="text-[10px]">{etichette[stato] ? t(etichette[stato]) : t("In elaborazione")}</Badge>;
}

function companyStatusBadge(status: string, t: (testo: string) => string) {
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
      {t(cfg.label)}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 1 — ABBONAMENTI
═══════════════════════════════════════════════════════════════════════════ */
function TabAbbonamenti() {
  const t = useT();
  const { data: billing, isLoading } = useBillingInfo();
  const { mutate: openPortal, isPending } = useOpenBillingPortal();
  const { mutate: attivaAbbonamento, isPending: attivazioneInCorso } = useStartPlanCheckout();
  // Di ritorno da Stripe il webhook arriva un attimo dopo: niente secondo pagamento nel frattempo.
  const [searchParams] = useSearchParams();
  const appenaPagato = searchParams.get("payment") === "success";
  const { data: topPlanPrice = 0 } = useTopPlanPrice();
  const navigate = useNavigate();
  // Dialog "Modifica abbonamento" (stile GHL): upgrade / downgrade / annulla.
  // Ogni voce apre un SECONDO popup dedicato (selezione piano o retention),
  // poi si atterra sulla pagina Stripe di conferma — mai direttamente fuori.
  const [modifyOpen, setModifyOpen] = useState(false);
  const [planDialog, setPlanDialog] = useState<"upgrade" | "downgrade" | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  // Mai blank: se per qualsiasi motivo le info piano non arrivano, mostriamo
  // comunque un accesso al portale Stripe (metodo di pagamento + cancellazione)
  // invece di una scheda vuota.
  if (!billing) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">{t("Il tuo abbonamento")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("Non riusciamo a caricare i dettagli del piano in questo momento. Puoi comunque gestire pagamento e cancellazione dal portale sicuro.")}
            </p>
          </div>
          <Button onClick={() => openPortal()} disabled={isPending} className="gap-1.5">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {t("Gestisci abbonamento")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  const priceLabel = billing.planPriceMonthly === 0
    ? t("Gratuito")
    : formatCurrency(billing.planPriceMonthly);
  const isYearly = billing.billingCycle === "yearly";
  const daAttivare = abbonamentoDaAttivare(billing) && !appenaPagato;

  return (
    <div className="space-y-5">
      {/* ── Card piano principale ── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{billing.planName}</h2>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">{t("Gestisci il tuo piano")}</p>
                {companyStatusBadge(billing.status, t)}
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-baseline gap-1 justify-end">
                <span className="text-4xl font-bold tabular-nums">{priceLabel}</span>
                <span className="text-sm text-muted-foreground">/ {isYearly ? t("anno") : t("mese")}</span>
              </div>
            </div>
          </div>

          {/* Piano a pagamento senza abbonamento: il portale Stripe non si apre finché
              non c'è un primo pagamento, quindi qui si paga il piano assegnato. */}
          {daAttivare && (
            <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <CreditCard className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{t("Abbonamento da attivare")}</p>
                  <p className="text-xs text-muted-foreground">{t("{priceLabel} al mese, con carta o addebito SEPA sulla pagina sicura di Stripe.", { priceLabel: String(priceLabel ?? "") })}</p>
                </div>
              </div>
              <Button
                onClick={() => billing.planId && attivaAbbonamento({ planId: billing.planId })}
                disabled={attivazioneInCorso}
                className="w-full sm:w-auto shrink-0"
              >
                {attivazioneInCorso ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                {t("Attiva abbonamento")}
              </Button>
            </div>
          )}
          {appenaPagato && abbonamentoDaAttivare(billing) && (
            <Alert className="mt-5">
              <Clock className="h-4 w-4" />
              <AlertDescription>
                {t("Pagamento ricevuto: l'abbonamento si attiva in pochi secondi. Ricarica la pagina per vederlo attivo.")}
              </AlertDescription>
            </Alert>
          )}

          {/* CTA piano annuale — risparmio reale calcolato sui prezzi del piano
              (no hardcoded). Mostra solo se l'utente è mensile e il piano ha
              anche un price_yearly < 12×price_monthly (cioè uno sconto reale).
              Senza abbonamento non c'è niente da passare all'annuale. */}
          {!isYearly && !daAttivare && billing.planPriceMonthly > 0 && billing.planPriceYearly > 0 && (() => {
            const monthlyTotalYear = billing.planPriceMonthly * 12;
            const yearlySaving = monthlyTotalYear - billing.planPriceYearly;
            const savingMonths = yearlySaving / billing.planPriceMonthly;
            // Solo se risparmi >= 1 mese intero, mostriamo la card
            if (savingMonths < 1) return null;
            const savingLabel = savingMonths >= 1.9
              ? `${Math.round(savingMonths)} mesi`
              : `${Math.round(yearlySaving)}€/anno`;
            return (
              <div className="mt-5 rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                    <Gift className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{t("Risparmia {savingLabel} con l'annuale", { savingLabel: String(savingLabel ?? "") })}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("Passa al ciclo annuale dal portale Stripe — confermi tu il cambio prima del pagamento.")}
                    </p>
                  </div>
                </div>
                <Button onClick={() => openPortal()} disabled={isPending} className="w-full sm:w-auto shrink-0">
                  {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                  {t("Passa all'annuale")}
                </Button>
              </div>
            );
          })()}

          {/* Trial banner — distingue trial attivo vs trial già scaduto (status=trial
              ma data passata: il backend non ha ancora flippato lo stato). */}
          {billing.status === "trial" && billing.trialEndsAt && (() => {
            const trialEnd = new Date(billing.trialEndsAt);
            const isExpired = trialEnd.getTime() < Date.now();
            const dateLabel = format(trialEnd, "d MMMM yyyy", { locale: dateFnsCampo() });
            return isExpired ? (
              <Alert variant="destructive" className="mt-5">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t("Il periodo di prova è terminato il")} <strong>{dateLabel}</strong>{t(". Aggiungi un metodo di pagamento per riattivare i servizi.")}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="mt-5">
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  {t("Il periodo di prova termina il")} <strong>{dateLabel}</strong>{t(". Aggiungi un metodo di pagamento per continuare senza interruzioni.")}
                </AlertDescription>
              </Alert>
            );
          })()}

          {/* Dunning */}
          {billing.isInDunning && (
            <Alert variant="destructive" className="mt-5">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <p>
                  {t("Il tuo ultimo pagamento non è andato a buon fine. Hai ancora")} <strong>{t("{n} giorni", { n: String(billing.dunningDaysLeft ?? "") })}</strong> {t("per aggiornare il metodo di pagamento ed evitare la sospensione dell'account.")}
                </p>
                <Button
                  size="sm" variant="destructive" className="mt-2 gap-1.5"
                  onClick={() => openPortal()} disabled={isPending}
                >
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                  {t("Riprova il pagamento")}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Cancellazione programmata — l'abbonamento resta attivo fino a fine periodo. */}
          {billing.cancelAtPeriodEnd && (
            <Alert className="mt-5 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
              <Clock className="h-4 w-4" />
              <AlertDescription>
                {t("Abbonamento in")} <strong>{t("cancellazione")}</strong>{t(": resta attivo")}
                {billing.currentPeriodEnd ? <> {t("fino al")} <strong>{format(new Date(billing.currentPeriodEnd), "d MMMM yyyy", { locale: dateFnsCampo() })}</strong></> : ` ${t("fino a fine periodo")}`}{t(", poi non verrà rinnovato. Puoi riattivarlo dal portale prima di quella data.")}
              </AlertDescription>
            </Alert>
          )}

          {/* Date ciclo */}
          {(billing.currentPeriodStart || billing.currentPeriodEnd) && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3 rounded-lg border bg-muted/30 p-3">
              {billing.currentPeriodStart && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Inizio periodo")}</p>
                  <p className="text-sm font-semibold">{format(new Date(billing.currentPeriodStart), "d MMM yyyy", { locale: dateFnsCampo() })}</p>
                </div>
              )}
              {billing.currentPeriodEnd && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {billing.cancelAtPeriodEnd ? t("Scade il") : t("Prossima fattura")}
                  </p>
                  <p className="text-sm font-semibold">{format(new Date(billing.currentPeriodEnd), "d MMMM yyyy", { locale: dateFnsCampo() })}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Ciclo")}</p>
                <p className="text-sm font-semibold">{isYearly ? t("Annuale") : t("Mensile")}</p>
              </div>
            </div>
          )}

          {/* Footer azioni — v8.6.75 label corta su mobile, w-full mobile.
              Prima il bottone "Vuoi modificare/annullare il tuo abbonamento?"
              tracimava dalla card su 375px (label 280px+ vs viewport 343px utili). */}
          <div className="mt-5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setModifyOpen(true)}
              className="gap-1.5 w-full sm:w-auto justify-center sm:justify-start"
            >
              <CreditCard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("Cambia o annulla il piano")}</span>
              <span className="sm:hidden">{t("Gestisci abbonamento")}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <p className="text-xs text-muted-foreground text-center sm:text-left">
              {t("Hai una domanda?")} <a href={`mailto:${EMAIL_ASSISTENZA}`} className="text-primary hover:underline">{t("Scrivici")}</a>
            </p>
          </div>
        </CardContent>
      </Card>

      <SpazioArchiviazioneCard />

      {/* ── Cross-sell: mostrato se l'utente non è sul piano top.
            topPlanPrice viene dalla tabella subscription_plans (no hardcoded). ── */}
      {topPlanPrice > 0 && billing.planPriceMonthly < topPlanPrice && (
        <Card className="border-orange-200 bg-orange-50/40 dark:bg-orange-950/20">
          <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-600" />
                {t("Vuoi più funzionalità?")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("Esplora i piani superiori per sbloccare AI, multi-sede, banca PSD2 e molto altro.")}
              </p>
            </div>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => navigate("/prezzi")}>
              {t("Vedi tutti i piani")}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Dialog "Modifica abbonamento" (stile GHL): upgrade / downgrade / annulla ── */}
      <Dialog open={modifyOpen} onOpenChange={setModifyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Modifica abbonamento")}</DialogTitle>
            <DialogDescription>{t("Scegli cosa vuoi fare con il tuo piano.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Upgrade — evidenziato */}
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                <ArrowUpRight className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{t("Passa a un piano superiore")}</p>
                <p className="text-xs text-muted-foreground">{isYearly ? t("Più funzioni da subito. Ora paghi {prezzo} / anno.", { prezzo: priceLabel }) : t("Più funzioni da subito. Ora paghi {prezzo} / mese.", { prezzo: priceLabel })}</p>
              </div>
              <Button size="sm" className="shrink-0" onClick={() => { setModifyOpen(false); setPlanDialog("upgrade"); }}>
                {t("Scegli il piano")}
              </Button>
            </div>
            {/* Downgrade */}
            <button
              type="button"
              onClick={() => { setModifyOpen(false); setPlanDialog("downgrade"); }}
              className="w-full rounded-xl border p-4 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                <ArrowDownRight className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{t("Passa a un piano più economico")}</p>
                <p className="text-xs text-muted-foreground">{t("Scegli un piano che costa meno")}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
            {/* Annulla piano — apre il popup di retention, NON il portale diretto */}
            <button
              type="button"
              onClick={() => { setModifyOpen(false); setCancelOpen(true); }}
              className="w-full rounded-xl border p-4 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="h-9 w-9 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shrink-0">
                <XCircle className="h-5 w-5 text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{t("Annulla il piano")}</p>
                <p className="text-xs text-muted-foreground">{t("Interrompi l'abbonamento")}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Secondo step: selezione piano (upgrade/downgrade) e retention annullamento ── */}
      <PlanChangeDialog
        open={planDialog !== null}
        onOpenChange={(o) => { if (!o) setPlanDialog(null); }}
        direction={planDialog ?? "upgrade"}
      />
      <CancelPlanDialog open={cancelOpen} onOpenChange={setCancelOpen} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 2 — PAGAMENTI
═══════════════════════════════════════════════════════════════════════════ */
function TabPagamenti() {
  const t = useT();
  const isMobile = useIsMobile();
  const { data: billing } = useBillingInfo();
  const { data: invoices, isLoading: invoicesLoading } = useInvoices();
  const { data: billingDetails } = useBillingDetails();
  const { data: pm, isLoading: pmLoading } = useStripePaymentMethod();
  const { mutate: openPortal, isPending } = useOpenBillingPortal();
  const { mutate: aggiungiCarta, isPending: aggiuntaCartaInCorso } = useStartCardSetup();
  const { mutate: attivaAbbonamento, isPending: attivazioneInCorso } = useStartPlanCheckout();
  const [searchParams, setSearchParams] = useSearchParams();
  // Dialog gestito da DialogTrigger asChild (focus restore automatico).

  // I metodi di pagamento veri (carta last4, brand, scadenza) richiedono Stripe API
  // server-side. Per ora mostriamo placeholder + CTA Stripe Portal.
  const hasStripeCustomer = !!billing?.stripeCustomerId;
  // Di ritorno da Stripe il webhook arriva un attimo dopo: niente secondo pagamento nel frattempo.
  const daAttivare = abbonamentoDaAttivare(billing) && searchParams.get("payment") !== "success";
  const pagamentoAParte = billing?.paymentMethod ? PAGAMENTO_A_PARTE[billing.paymentMethod] : undefined;

  return (
    <div className="space-y-5">
      {/* Prossimo addebito — a colpo d'occhio, stile GHL */}
      {billing?.currentPeriodEnd && billing.planPriceMonthly > 0 && (
        <div className="rounded-xl border bg-muted/30 px-4 py-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          {billing.cancelAtPeriodEnd ? (
            <span>
              {t("Piano attivo fino al")} <strong>{format(new Date(billing.currentPeriodEnd), "d MMMM yyyy", { locale: dateFnsCampo() })}</strong> {t("— nessun rinnovo previsto.")}
            </span>
          ) : (
            <span>
              {t("Prossimo addebito:")} <strong>{formatCurrency(billing.billingCycle === "yearly" ? billing.planPriceYearly : billing.planPriceMonthly)}</strong> {t("il")}{" "}
              <strong>{format(new Date(billing.currentPeriodEnd), "d MMMM yyyy", { locale: dateFnsCampo() })}</strong>
              {pm?.hasMethod && pm.last4 ? <>{" "}{t("su {label} •••• {last4}", { label: String(brandLabel(pm.brand).label ?? ""), last4: String(pm.last4 ?? "") })}</> : null}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Card Metodo di pagamento */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              {t("Metodo di pagamento")}
            </CardTitle>
            {/* Il portale Stripe esiste solo dopo il primo pagamento. */}
            {hasStripeCustomer && (
              <Button
                variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs"
                onClick={() => openPortal()} disabled={isPending}
                aria-label={t("Modifica metodo di pagamento")}
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                {t("Gestisci")}
              </Button>
            )}
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
                  <p className="text-sm font-medium flex items-center gap-2">
                    {brandLabel(pm.brand).label} •••• {pm.last4}
                    <Badge variant="secondary" className="text-[10px] font-normal">{t("Predefinita")}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pm.expMonth && pm.expYear ? (
                      <>{t("Scade {valore}/{valore2}", { valore: String(pm.expMonth).padStart(2, "0"), valore2: String(pm.expYear).slice(-2) })}</>
                    ) : (
                      t("Carta registrata")
                    )}
                    {pm.funding ? ` · ${pm.funding === "credit" ? t("Credito") : pm.funding === "debit" ? t("Debito") : pm.funding}` : null}
                  </p>
                </div>
              </div>
            ) : hasStripeCustomer ? (
              <div className="flex items-center gap-3">
                <div className="h-10 w-14 rounded border bg-white flex items-center justify-center text-[10px] font-bold text-slate-600">
                  CARD
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{t("Nessuna carta predefinita")}</p>
                  <p className="text-xs text-muted-foreground">{t("Aggiungi un metodo di pagamento dal portale Stripe.")}</p>
                </div>
              </div>
            ) : daAttivare ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">{t("Abbonamento da attivare: {valore} al mese", { valore: formatCurrency(billing?.planPriceMonthly ?? 0) })}</p>
                <Button
                  size="sm"
                  onClick={() => billing?.planId && attivaAbbonamento({ planId: billing.planId })}
                  disabled={attivazioneInCorso}
                >
                  {attivazioneInCorso ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                  {t("Attiva abbonamento")}
                </Button>
              </div>
            ) : pagamentoAParte ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t(pagamentoAParte)}</p>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">{t("Nessun metodo di pagamento")}</p>
                {/* Senza cliente Stripe il portale non si apre: la carta si aggiunge col checkout. */}
                <Button size="sm" onClick={() => aggiungiCarta()} disabled={aggiuntaCartaInCorso}>
                  {aggiuntaCartaInCorso ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                  {t("Aggiungi metodo di pagamento")}
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
              aria-label={t("Apri modifica informazioni fiscali")}
            >
              <Card className="transition-colors hover:bg-muted/40 h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    {t("Informazioni fiscali")}
                  </CardTitle>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </CardHeader>
                <CardContent>
                  {/* Nessun «Verificato» accanto alla P.IVA: nessun controllo la verifica (si chiede solo che non sia troppo corta). */}
                  {billingDetails?.legal_name || billingDetails?.vat_number ? (
                    <div className="space-y-2">
                      {billingDetails.legal_name && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Ragione sociale")}</p>
                          <p className="text-sm font-medium truncate">{billingDetails.legal_name}</p>
                        </div>
                      )}
                      {billingDetails.vat_number && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">P.IVA</p>
                          <p className="text-sm font-medium font-mono">{billingDetails.vat_number}</p>
                        </div>
                      )}
                      {(billingDetails.address_line1 || billingDetails.city) && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Sede legale")}</p>
                          <p className="text-sm font-medium truncate">
                            {[billingDetails.address_line1, [billingDetails.postal_code, billingDetails.city].filter(Boolean).join(" ")]
                              .filter(Boolean).join(", ")}
                          </p>
                        </div>
                      )}
                      {billingDetails.invoice_email && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Email fatturazione")}</p>
                          <p className="text-sm font-medium truncate">{billingDetails.invoice_email}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-2">{t("Nessuna informazione fiscale")}</p>
                      <p className="text-xs text-muted-foreground">{t("Clicca qui per compilare i dati di fatturazione.")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("Dati di fatturazione")}</DialogTitle>
              <DialogDescription>
                {t("Anagrafica fiscale completa usata per le fatture EdiliziaInCloud.")}
              </DialogDescription>
            </DialogHeader>
            <BillingDetailsCard />
          </DialogContent>
        </Dialog>
      </div>

      {/* Le fatture dell'abbonamento (Stripe). I consumi dei crediti non stanno qui: un rimando alla scheda Crediti. */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                {t("Cronologia dei pagamenti")}
              </CardTitle>
              <CardDescription className="text-xs">{t("Le fatture dell'abbonamento")}</CardDescription>
            </div>
            <Button
              variant="link"
              size="sm"
              className="h-auto justify-start p-0 text-xs sm:justify-end"
              onClick={() => setSearchParams({ tab: "portafoglio" }, { replace: true })}
            >
              {t("Consumi dei crediti → Crediti")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-medium">{t("Nessun pagamento ancora registrato")}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("I pagamenti appariranno qui dopo il primo addebito.")}
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
                          {inv.periodStart ? format(new Date(inv.periodStart), "d MMM yyyy", { locale: dateFnsCampo() }) : "—"}
                        </span>
                        <StatoFattura stato={inv.status} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{formatPeriod(inv.periodStart, inv.periodEnd)}</p>
                      <p className="text-base font-semibold tabular-nums mt-1">
                        {inv.status === "paid"
                          ? formatEurCents(inv.amountPaid, inv.currency)
                          : formatEurCents(inv.amountDue, inv.currency)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {/* Niente export su telefono. */}
                      {!isMobile && inv.invoicePdf && (
                        <Button
                          variant="ghost" size="icon" aria-label={t("Scarica PDF fattura")} className="h-8 w-8"
                          onClick={() => window.open(inv.invoicePdf!, "_blank")}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {inv.invoiceUrl && (
                        <Button
                          variant="ghost" size="icon" aria-label={t("Apri fattura online")} className="h-8 w-8"
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
                      <TableHead>{t("Data")}</TableHead>
                      <TableHead>{t("Descrizione")}</TableHead>
                      <TableHead className="text-right">{t("Importo")}</TableHead>
                      <TableHead>{t("Stato")}</TableHead>
                      <TableHead className="text-right">{t("Azioni")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {inv.paidAt
                            ? format(new Date(inv.paidAt), "d MMM yyyy", { locale: dateFnsCampo() })
                            : inv.periodStart ? format(new Date(inv.periodStart), "d MMM yyyy", { locale: dateFnsCampo() }) : "—"}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{t("Abbonamento")} {billing?.planName ?? ""}</p>
                          <p className="text-xs text-muted-foreground">{formatPeriod(inv.periodStart, inv.periodEnd)}</p>
                        </TableCell>
                        <TableCell className="font-semibold text-right tabular-nums">
                          {inv.status === "paid"
                            ? formatEurCents(inv.amountPaid, inv.currency)
                            : formatEurCents(inv.amountDue, inv.currency)}
                        </TableCell>
                        <TableCell>
                          <StatoFattura stato={inv.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {inv.invoicePdf && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {/* Niente export su telefono. */}
                                  {!isMobile && (
                                    <Button
                                      variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7"
                                      onClick={() => window.open(inv.invoicePdf!, "_blank")}
                                      aria-label={t("Scarica PDF")}
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </TooltipTrigger>
                                <TooltipContent>{t("Scarica PDF")}</TooltipContent>
                              </Tooltip>
                            )}
                            {inv.invoiceUrl && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7"
                                    onClick={() => window.open(inv.invoiceUrl!, "_blank")}
                                    aria-label={t("Apri online")}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("Apri online")}</TooltipContent>
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
        {t("I pagamenti sono gestiti in modo sicuro da")}{" "}
        <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="underline">
          {t("Stripe")}
        </a>{t(". Non memorizziamo i dati della carta di credito.")}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 3 — CREDITI (delega a SettingsCrediti: stesso componente della pagina Crediti)
═══════════════════════════════════════════════════════════════════════════ */
function TabPortafoglio() {
  // v8.6.60 — Niente intestazione doppia: SettingsCrediti (embedded) ha già
  // l'hero card con saldo totale + KPI. L'header del tab era ridondante.
  return (
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
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN — Page con header + tabs
═══════════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════════
   BANNER — RICARICA AUTOMATICA FALLITA (carta rifiutata)
   Il tentativo di addebito falliva in silenzio: registrato solo su
   company_auto_topup, invisibile in app. L'utente vedeva solo l'email. Qui lo
   mostriamo sulla pagina a cui l'email rimanda, con l'azione per aggiornare la
   carta (portale Stripe: la sezione "Metodo di pagamento").
═══════════════════════════════════════════════════════════════════════════ */
/** Traduce in italiano i messaggi di rifiuto piu' comuni di Stripe (in inglese). */
function localizzaMotivoRifiuto(reason: string | null): string {
  const r = (reason ?? "").toLowerCase();
  if (!r) return "la carta è stata rifiutata";
  if (r.includes("insufficient funds")) return "la carta non aveva fondi sufficienti";
  if (r.includes("expired")) return "la carta risulta scaduta";
  if (r.includes("security code") || r.includes("cvc")) return "il codice di sicurezza della carta non era corretto";
  if (r.includes("incorrect number") || r.includes("card number")) return "il numero della carta non era corretto";
  if (r.includes("do not honor") || r.includes("does not support") || r.includes("not support"))
    return "la banca ha rifiutato il pagamento";
  if (r.includes("declined")) return "la carta è stata rifiutata";
  return "la carta è stata rifiutata";
}

function AutoTopupFailureBanner() {
  const t = useT();
  const { data: failure } = useAutoTopupFailure();
  const { mutate: openPortal, isPending } = useOpenBillingPortal();

  if (!failure) return null;

  const motivo = t(localizzaMotivoRifiuto(failure.reason));
  const ultimo = failure.lastFailureAt
    ? format(new Date(failure.lastFailureAt), "d MMM yyyy 'alle' HH:mm", { locale: dateFnsCampo() })
    : null;
  const prossimo = failure.nextAttemptAt
    ? format(new Date(failure.nextAttemptAt), "d MMM yyyy", { locale: dateFnsCampo() })
    : null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/30"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <div>
            <h3 className="font-semibold text-rose-900 dark:text-rose-100">{t("Ricarica automatica non riuscita")}</h3>
            <p className="text-sm text-rose-800 dark:text-rose-200">
              {t("Abbiamo provato ad addebitare la tua carta per ricaricare il credito, ma")} {motivo}
              {failure.failureCount > 1 ? t(" ({failureCount} tentativi)", { failureCount: String(failure.failureCount ?? "") }) : ""}.
              {ultimo ? t(" Ultimo tentativo il {ultimo}.", { ultimo: String(ultimo ?? "") }) : ""}
            </p>
            <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">
              {failure.exhausted
                ? t("Abbiamo sospeso i tentativi automatici: aggiorna il metodo di pagamento per riattivarli.")
                : prossimo
                  ? t("Riproveremo automaticamente il {prossimo}. Per non aspettare, aggiorna subito la carta.", { prossimo: String(prossimo ?? "") })
                  : t("Aggiorna il metodo di pagamento per riprovare subito.")}
            </p>
          </div>
          <Button
            onClick={() => openPortal()}
            disabled={isPending}
            className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {t("Aggiorna il metodo di pagamento")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsSubscriptionBilling() {
  const t = useT();
  const { isScopriPlan, isLoading: limitsLoading } = useSubscriptionLimits();
  const permissions = usePermissions();
  const canManagePlan = permissions.isAdmin;
  // Dal telefono l'abbonamento non si attiva, non si paga e non si rinnova:
  // solo dal computer (regola dell'utente, 25/09/2026).
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") ?? "";
  // Chi prima accedeva solo alla pagina Crediti continua a vedere SOLO Crediti.
  const activeTab = !canManagePlan ? "portafoglio" : VALID_TABS.has(tabParam) ? tabParam : "abbonamenti";

  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  // Mantieni vecchia logica "Scopri" (paywall onboarding)
  const navigate = useNavigate();
  if (limitsLoading || permissions.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (permissions.loadError || (!canManagePlan && !permissions.canViewBilling)) {
    return <p role="alert">{t("Non hai i permessi per accedere a questa sezione.")}</p>;
  }

  const pianoScopri = (
      <div className="space-y-6">
        {/* Niente h1 — SettingsLayout monta già "Piano abbonamento" nell'header */}
        <p className="text-muted-foreground">{t("Stai usando il Piano Scopri gratuito.")}</p>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-xl">🔍</div>
              <div>
                <div className="font-semibold">{t("Piano Scopri")}</div>
                <div className="text-sm text-muted-foreground">{t("Gratuito · Per sempre · Nessuna carta")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-1">{t("Pronto a fare sul serio?")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("Starter a €127/mese: commesse illimitate, fatturazione SDI, banca PSD2, HR, magazzino. Trial 31 giorni.")}
            </p>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => navigate("/prezzi")}>
              <Sparkles className="h-4 w-4 mr-1.5" />
              {t("Vedi tutti i piani")}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      </div>
  );

  return (
    <div className="space-y-5">
      {/* Niente h1 — SettingsLayout monta già "Piano abbonamento" nell'header */}
      {/* Carta rifiutata sulla ricarica automatica: sopra ai tab, sempre visibile */}
      {canManagePlan && !isMobile && <AutoTopupFailureBanner />}
      <Tabs value={activeTab} onValueChange={setTab} className="w-full">
        <TabsList className={`grid w-full max-w-md ${canManagePlan ? "grid-cols-3" : "grid-cols-1"}`}>
          {canManagePlan && <>
          <TabsTrigger value="abbonamenti" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            {t("Piano")}
          </TabsTrigger>
          <TabsTrigger value="pagamenti" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            {t("Pagamenti")}
          </TabsTrigger>
          </>}
          <TabsTrigger value="portafoglio" className="gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            {t("Crediti")}
          </TabsTrigger>
        </TabsList>

        {canManagePlan && <>
          <TabsContent value="abbonamenti" className="mt-5">
            {isMobile ? <AvvisoSoloDaComputer titolo={t("L'abbonamento si gestisce e si rinnova dal computer")} /> : isScopriPlan ? pianoScopri : <TabAbbonamenti />}
          </TabsContent>
          <TabsContent value="pagamenti" className="mt-5">
            {isMobile ? <AvvisoSoloDaComputer titolo={t("I pagamenti dell'abbonamento si gestiscono dal computer")} /> : <TabPagamenti />}
          </TabsContent>
        </>}
        <TabsContent value="portafoglio" className="mt-5">
          <TabPortafoglio />
        </TabsContent>
      </Tabs>
    </div>
  );
}
