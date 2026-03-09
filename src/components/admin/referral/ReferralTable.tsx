import { Copy, Eye, CreditCard, Pencil, ToggleLeft, ToggleRight, Gift, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import type { Referrer } from "@/pages/admin/ReferralDashboard";

interface Props {
  referrers: Referrer[];
  isLoading: boolean;
  isToggling?: boolean;
  getCompanyCount: (id: string) => number;
  getMonthlyCommission: (r: Referrer) => number;
  onEdit: (r: Referrer) => void;
  onDetail: (r: Referrer) => void;
  onPayout: (r: Referrer) => void;
  onToggleActive: (id: string, active: boolean) => void;
}

export function ReferralTable({
  referrers, isLoading, isToggling, getCompanyCount, getMonthlyCommission,
  onEdit, onDetail, onPayout, onToggleActive,
}: Props) {
  const { toast } = useToast();

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/login?ref=${code}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copiato!", description: url });
  };

  const recalcTier = async (referrerId: string) => {
    try {
      await supabase.rpc("update_referrer_tier", { p_referrer_id: referrerId });
      sonnerToast.success("Tier ricalcolato");
    } catch {
      sonnerToast.error("Errore nel ricalcolo tier");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referrer</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3 py-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-20" />
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-28" />
              </div>
            ))}
          </div>
        ) : referrers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <Gift className="h-10 w-10" />
            <p>Nessun referrer trovato.</p>
            <p className="text-sm">Crea il primo referrer per attivare il programma di affiliazione.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referrer</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Codice</TableHead>
                <TableHead>Commissione</TableHead>
                <TableHead className="text-center">Aziende</TableHead>
                <TableHead className="text-center">Click</TableHead>
                <TableHead className="text-center">Conv. %</TableHead>
                <TableHead className="text-right">Maturato/mese</TableHead>
                <TableHead className="text-right">Da pagare</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrers.map((r) => {
                const monthly = getMonthlyCommission(r);
                const toPay = r.total_earned - r.total_paid;
                const tier = r.referral_tiers;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {tier ? (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{ borderColor: tier.color, color: tier.color }}
                        >
                          {tier.icon} {tier.name}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
                    <TableCell className="text-center">{r.total_clicks || 0}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={r.conversion_rate >= 10 ? "default" : "secondary"}>
                        {(r.conversion_rate || 0).toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(monthly)}</TableCell>
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
                            <Button variant="ghost" size="icon" onClick={() => recalcTier(r.id)}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Ricalcola Tier</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isToggling}
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
