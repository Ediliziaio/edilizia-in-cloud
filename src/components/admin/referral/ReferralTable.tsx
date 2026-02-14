import { Copy, Eye, CreditCard, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import type { Referrer } from "@/pages/admin/ReferralDashboard";

interface Props {
  referrers: Referrer[];
  isLoading: boolean;
  getCompanyCount: (id: string) => number;
  getMonthlyCommission: (r: Referrer) => number;
  onEdit: (r: Referrer) => void;
  onDetail: (r: Referrer) => void;
  onPayout: (r: Referrer) => void;
  onToggleActive: (id: string, active: boolean) => void;
}

export function ReferralTable({
  referrers, isLoading, getCompanyCount, getMonthlyCommission,
  onEdit, onDetail, onPayout, onToggleActive,
}: Props) {
  const { toast } = useToast();

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/login?ref=${code}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copiato!", description: url });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referrer</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
        ) : referrers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessun referrer. Creane uno per iniziare.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referrer</TableHead>
                <TableHead>Codice</TableHead>
                <TableHead>Commissione</TableHead>
                <TableHead className="text-center">Aziende</TableHead>
                <TableHead className="text-right">Maturato/mese</TableHead>
                <TableHead className="text-right">Pagato</TableHead>
                <TableHead className="text-right">Da pagare</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrers.map((r) => {
                const monthly = getMonthlyCommission(r);
                const toPay = r.total_earned - r.total_paid;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{r.referral_code}</code>
                    </TableCell>
                    <TableCell>
                      {r.commission_type === "percentage"
                        ? `${r.commission_value}%`
                        : formatCurrency(r.commission_value)}
                    </TableCell>
                    <TableCell className="text-center">{getCompanyCount(r.id)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(monthly)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.total_paid)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(toPay > 0 ? toPay : 0)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.is_active ? "default" : "secondary"}>
                        {r.is_active ? "Attivo" : "Inattivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => copyLink(r.referral_code)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copia link</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => onDetail(r)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Dettaglio</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => onPayout(r)}>
                              <CreditCard className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Registra pagamento</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => onEdit(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Modifica</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onToggleActive(r.id, !r.is_active)}
                            >
                              {r.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{r.is_active ? "Disattiva" : "Attiva"}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
