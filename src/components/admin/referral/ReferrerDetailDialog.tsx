import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateShort, formatDateTime } from "@/lib/formatters";
import type {
  ReferralClick,
  ReferralCompany,
  ReferralEvent,
  ReferralFraudLog,
  ReferralLedgerEntry,
  ReferralPayout,
  Referrer,
} from "@/pages/admin/ReferralDashboard";

interface Props {
  referrer: Referrer | null;
  onOpenChange: () => void;
  referralCompanies: ReferralCompany[];
  payouts: ReferralPayout[];
  clicks: ReferralClick[];
  events: ReferralEvent[];
  ledger: ReferralLedgerEntry[];
  fraudLogs: ReferralFraudLog[];
}

const methodLabels: Record<string, string> = {
  bank_transfer: "Bonifico",
  paypal: "PayPal",
  other: "Altro",
};

function toValidTime(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function ReferrerDetailDialog({
  referrer,
  onOpenChange,
  referralCompanies,
  payouts,
  clicks,
  events,
  ledger,
  fraudLogs,
}: Props) {
  if (!referrer) return null;

  const timeline = [
    ...events.map((event) => ({
      id: `event-${event.id}`,
      date: event.created_at,
      title: `Evento: ${event.event_type}`,
      description: event.referral_code ? `Codice ${event.referral_code}` : "Evento referral",
      tone: "secondary" as const,
    })),
    ...clicks.map((click) => ({
      id: `click-${click.id}`,
      date: click.created_at,
      title: click.converted ? "Click convertito" : "Click referral",
      description: [click.utm_source, click.utm_campaign, click.landing_page].filter(Boolean).join(" · ") || click.referral_code,
      tone: click.converted ? "default" as const : "secondary" as const,
    })),
    ...referralCompanies.map((company) => ({
      id: `company-${company.id}`,
      date: company.referred_at,
      title: company.is_active ? "Azienda attiva attribuita" : "Azienda attribuita",
      description: company.company?.name || company.company_id,
      tone: company.is_active ? "default" as const : "outline" as const,
    })),
    ...ledger.map((entry) => ({
      id: `ledger-${entry.id}`,
      date: entry.calculated_at,
      title: `Commissione ${entry.status || "calcolata"}`,
      description: `${entry.period_month}/${entry.period_year} · ${formatCurrency(Number(entry.commission_amount || 0))}`,
      tone: entry.status === "paid" ? "default" as const : "outline" as const,
    })),
    ...payouts.map((payout) => ({
      id: `payout-${payout.id}`,
      date: payout.paid_at || payout.created_at,
      title: `Payout ${payout.status || "registrato"}`,
      description: formatCurrency(Number(payout.amount || 0)),
      tone: payout.status === "paid" ? "default" as const : "outline" as const,
    })),
    ...fraudLogs.map((log) => ({
      id: `fraud-${log.id}`,
      date: log.detected_at,
      title: `Anomalia: ${log.fraud_type}`,
      description: "Verifica richiesta prima del payout",
      tone: "destructive" as const,
    })),
  ]
    .sort((a, b) => toValidTime(b.date) - toValidTime(a.date))
    .slice(0, 40);

  return (
    <Dialog open={!!referrer} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[82vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{referrer.name}</DialogTitle>
          <DialogDescription>
            Codice: <code className="bg-muted px-2 py-0.5 rounded text-xs">{referrer.referral_code}</code>
            {" · "}{referrer.email}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="companies" className="mt-2">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-4">
            <TabsTrigger value="companies">Aziende Portate ({referralCompanies.length})</TabsTrigger>
            <TabsTrigger value="payouts">Storico Pagamenti ({payouts.length})</TabsTrigger>
            <TabsTrigger value="timeline">Timeline ({timeline.length})</TabsTrigger>
            <TabsTrigger value="ledger">Commissioni ({ledger.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="companies">
            {referralCompanies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nessuna azienda portata</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Azienda</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referralCompanies.map((rc) => (
                    <TableRow key={rc.id}>
                      <TableCell className="font-medium">{rc.company?.name || "—"}</TableCell>
                      <TableCell>{formatDateShort(rc.referred_at)}</TableCell>
                      <TableCell>
                        <Badge variant={rc.is_active ? "default" : "secondary"}>
                          {rc.is_active ? "Attiva" : "Inattiva"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {rc.plan ? formatCurrency(rc.plan.price_monthly) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="payouts">
            {payouts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nessun pagamento registrato</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Importo</TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p) => {
                    const method = p.payment_method || "-";
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{formatCurrency(p.amount)}</TableCell>
                        <TableCell>
                          {formatDateShort(p.period_start)} — {formatDateShort(p.period_end)}
                        </TableCell>
                        <TableCell>{methodLabels[method] || method}</TableCell>
                        <TableCell>{formatDateShort(p.paid_at || p.created_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="timeline">
            {timeline.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nessun evento disponibile</div>
            ) : (
              <div className="space-y-3 py-2">
                {timeline.map((item) => (
                  <div key={item.id} className="flex gap-3 rounded-lg border p-3">
                    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-medium">{item.title}</p>
                        <Badge variant={item.tone}>{formatDateTime(item.date || "")}</Badge>
                      </div>
                      <p className="mt-1 break-words text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ledger">
            {ledger.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nessuna commissione a ledger</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Piano</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{entry.period_month}/{entry.period_year}</TableCell>
                      <TableCell>{entry.subscription_plan_name || "—"}</TableCell>
                      <TableCell>{entry.commission_type || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={entry.status === "paid" ? "default" : "outline"}>
                          {entry.status || "calcolata"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(entry.commission_amount || 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
