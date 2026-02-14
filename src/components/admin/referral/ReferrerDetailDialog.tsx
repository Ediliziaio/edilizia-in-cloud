import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import type { Referrer, ReferralCompany, ReferralPayout } from "@/pages/admin/ReferralDashboard";

interface Props {
  referrer: Referrer | null;
  onOpenChange: () => void;
  referralCompanies: ReferralCompany[];
  payouts: ReferralPayout[];
}

const methodLabels: Record<string, string> = {
  bank_transfer: "Bonifico",
  paypal: "PayPal",
  other: "Altro",
};

export function ReferrerDetailDialog({ referrer, onOpenChange, referralCompanies, payouts }: Props) {
  if (!referrer) return null;

  return (
    <Dialog open={!!referrer} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{referrer.name}</DialogTitle>
          <DialogDescription>
            Codice: <code className="bg-muted px-2 py-0.5 rounded text-xs">{referrer.referral_code}</code>
            {" · "}{referrer.email}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="companies" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="companies">Aziende Portate ({referralCompanies.length})</TabsTrigger>
            <TabsTrigger value="payouts">Storico Pagamenti ({payouts.length})</TabsTrigger>
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
                  {payouts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{formatCurrency(p.amount)}</TableCell>
                      <TableCell>
                        {formatDateShort(p.period_start)} — {formatDateShort(p.period_end)}
                      </TableCell>
                      <TableCell>{methodLabels[p.payment_method] || p.payment_method}</TableCell>
                      <TableCell>{formatDateShort(p.paid_at)}</TableCell>
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
