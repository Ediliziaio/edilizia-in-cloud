import { ExternalLink, Download, AlertTriangle, CheckCircle2,
         CreditCard, FileText, RefreshCw, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBillingInfo, useInvoices, useOpenBillingPortal } from "@/hooks/useBilling";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";

// ─── UTILITY ──────────────────────────────────────────────────────────────────

function formatEurCents(centesimi: number, currency = "eur"): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(centesimi / 100);
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const s = format(new Date(start), "d MMM yyyy", { locale: it });
  const e = format(new Date(end), "d MMM yyyy", { locale: it });
  return `${s} → ${e}`;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    paid:          { label: "Pagata",       variant: "default" },
    open:          { label: "In scadenza",  variant: "secondary" },
    draft:         { label: "Bozza",        variant: "outline" },
    void:          { label: "Annullata",    variant: "outline" },
    uncollectible: { label: "Non riscossa", variant: "destructive" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function companyStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    trial:     { label: "Periodo di prova", className: "bg-blue-100 text-blue-700 border-blue-200" },
    active:    { label: "Attivo",           className: "bg-green-100 text-green-700 border-green-200" },
    suspended: { label: "Sospeso",          className: "bg-red-100 text-red-700 border-red-200" },
    expired:   { label: "Scaduto",          className: "bg-muted text-muted-foreground border-border" },
  };
  const cfg = map[status] ?? { label: status, className: "" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ─── CARD: PIANO CORRENTE ─────────────────────────────────────────────────────

function CurrentPlanCard() {
  const { data: billing, isLoading } = useBillingInfo();
  const { mutate: openPortal, isPending } = useOpenBillingPortal();
  // Must be called unconditionally at top level — NEVER after an early return
  const { data: invoices } = useInvoices();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-72" /></CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /><Skeleton className="h-10 w-64 mt-4" /></CardContent>
      </Card>
    );
  }

  if (!billing) return null;

  const priceLabel = billing.planPriceMonthly === 0
    ? "Gratuito"
    : `${formatCurrency(billing.planPriceMonthly)} / mese`;

  const failedInvoiceUrl = billing.isInDunning
    ? invoices?.find(i => i.status === "open")?.invoiceUrl ?? null
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle>Piano corrente</CardTitle>
          {companyStatusBadge(billing.status)}
        </div>
        <CardDescription>
          Gestisci il tuo abbonamento e i metodi di pagamento
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-semibold">{billing.planName}</p>
            <p className="text-sm text-muted-foreground">{priceLabel}</p>
          </div>
        </div>

        {/* Trial banner */}
        {billing.status === "trial" && billing.trialEndsAt && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              Il periodo di prova termina il{" "}
              <strong>{format(new Date(billing.trialEndsAt), "d MMMM yyyy", { locale: it })}</strong>.
              Aggiungi un metodo di pagamento per continuare senza interruzioni.
            </AlertDescription>
          </Alert>
        )}

        {/* Dunning banner */}
        {billing.isInDunning && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p>
                Pagamento non riuscito. Hai ancora{" "}
                <strong>{billing.dunningDaysLeft} giorni</strong> per aggiornare
                il metodo di pagamento prima della sospensione.
              </p>
              {failedInvoiceUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(failedInvoiceUrl!, "_blank")}
                  className="gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Paga ora
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Suspended */}
        {billing.status === "suspended" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Il tuo account è sospeso. Contatta il supporto o aggiorna il
              metodo di pagamento per riattivare il servizio.
            </AlertDescription>
          </Alert>
        )}

        {/* CTA Stripe Portal */}
        <div className="flex items-center gap-3">
          <Button
            onClick={() => openPortal()}
            disabled={isPending}
            className="gap-2"
          >
            {isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Gestisci abbonamento e pagamenti
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs text-sm">
                  Verrai reindirizzato al portale sicuro Stripe dove puoi
                  aggiornare la carta, cambiare piano, o scaricare le fatture.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── CARD: STORICO FATTURE ────────────────────────────────────────────────────

function InvoiceHistoryCard() {
  const { data: invoices, isLoading } = useInvoices();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Storico fatture</CardTitle>
        </div>
        <CardDescription>Le ultime 24 fatture del tuo abbonamento</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !invoices || invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-foreground">Nessuna fattura ancora disponibile.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Le fatture appariranno qui dopo il primo rinnovo o pagamento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Importo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-sm">
                      {formatPeriod(inv.periodStart, inv.periodEnd)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {inv.status === "paid"
                        ? formatEurCents(inv.amountPaid, inv.currency)
                        : formatEurCents(inv.amountDue, inv.currency)}
                    </TableCell>
                    <TableCell>{statusBadge(inv.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {inv.invoicePdf && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => window.open(inv.invoicePdf!, "_blank")}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Scarica PDF</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {inv.invoiceUrl && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => window.open(inv.invoiceUrl!, "_blank")}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Apri su Stripe</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {inv.status === "open" && inv.invoiceUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(inv.invoiceUrl!, "_blank")}
                          >
                            Paga
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── PAGINA PRINCIPALE ────────────────────────────────────────────────────────

export default function SettingsSubscriptionBilling() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Abbonamento</h1>
        <p className="text-muted-foreground">
          Gestisci il tuo piano, i metodi di pagamento e visualizza lo storico fatture.
        </p>
      </div>

      <Separator />

      <CurrentPlanCard />
      <InvoiceHistoryCard />

      <p className="text-xs text-muted-foreground text-center">
        I pagamenti sono gestiti in modo sicuro da{" "}
        <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="underline">
          Stripe
        </a>. Non memorizziamo i dati della tua carta di credito.
      </p>
    </div>
  );
}
