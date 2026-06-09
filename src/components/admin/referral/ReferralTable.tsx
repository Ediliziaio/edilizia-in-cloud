import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, CreditCard, Pencil, ToggleLeft, ToggleRight, Gift, RefreshCw, Search, MailPlus, UserX, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { buildReferralLink } from "@/lib/referral";
import { toast as sonnerToast } from "sonner";
import type { Referrer } from "@/pages/admin/ReferralDashboard";
import { AccessControlDialog } from "@/components/admin/AccessControlDialog";

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
  onTierRecalculated?: () => void;
}

const PAGE_SIZE = 10;

export function ReferralTable({
  referrers, isLoading, isToggling, getCompanyCount, getMonthlyCommission,
  onEdit, onDetail, onPayout, onToggleActive, onTierRecalculated,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [accessTarget, setAccessTarget] = useState<Referrer | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState("balance_desc");
  const [page, setPage] = useState(1);
  const [relinkingId, setRelinkingId] = useState<string | null>(null);

  const copyLink = async (code: string) => {
    const url = buildReferralLink(code);
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiato!", description: url });
    } catch {
      toast({ title: "Impossibile copiare", description: "Copia manualmente il link referral.", variant: "destructive" });
    }
  };

  const recalcTier = async (referrerId: string) => {
    try {
      const { error } = await supabase.rpc("update_referrer_tier", { p_referrer_id: referrerId });
      if (error) throw error;
      onTierRecalculated?.();
      sonnerToast.success("Tier ricalcolato");
    } catch {
      sonnerToast.error("Errore nel ricalcolo tier");
    }
  };

  // Collega/reinvita l'account del portale per i referrer creati senza user_id
  // (es. fallback offline): senza account il partner non supera le RLS e non
  // vede nulla nel portale. La edge function invita o riusa il profilo esistente.
  const relinkAccount = async (referrer: Referrer) => {
    setRelinkingId(referrer.id);
    try {
      const { data, error } = await supabase.functions.invoke("link-referral-partner", {
        body: { referrer_id: referrer.id },
      });
      if (error) throw error;
      const alreadyLinked = (data as { already_linked?: boolean } | null)?.already_linked;
      sonnerToast.success(alreadyLinked ? "Account già collegato" : "Invito inviato", {
        description: alreadyLinked
          ? `${referrer.email} ha già accesso al portale.`
          : `${referrer.email} può ora accedere al portale partner.`,
      });
      queryClient.invalidateQueries({ queryKey: ["referrers"] });
    } catch (err) {
      sonnerToast.error("Collegamento non riuscito", {
        description: err instanceof Error ? err.message : "Riprova più tardi.",
      });
    } finally {
      setRelinkingId(null);
    }
  };

  const referrerRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return referrers
      .filter((r) => {
        const balance = Math.max(0, (r.total_earned || 0) - (r.total_paid || 0));
        if (statusFilter === "active" && !r.is_active) return false;
        if (statusFilter === "inactive" && r.is_active) return false;
        if (statusFilter === "to_pay" && balance <= 0) return false;
        if (statusFilter === "orphan" && r.user_id) return false;
        if (!needle) return true;
        return [
          r.name,
          r.email,
          r.referral_code,
          r.phone || "",
          r.referral_tiers?.name || "",
          r.partner_type || "",
        ].some((value) => value.toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const balanceA = Math.max(0, (a.total_earned || 0) - (a.total_paid || 0));
        const balanceB = Math.max(0, (b.total_earned || 0) - (b.total_paid || 0));
        switch (sortMode) {
          case "monthly_desc":
            return getMonthlyCommission(b) - getMonthlyCommission(a);
          case "companies_desc":
            return getCompanyCount(b.id) - getCompanyCount(a.id);
          case "conversion_desc":
            return (b.conversion_rate || 0) - (a.conversion_rate || 0);
          case "created_desc":
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          case "name_asc":
            return a.name.localeCompare(b.name);
          case "balance_desc":
          default:
            return balanceB - balanceA;
        }
      });
  }, [getCompanyCount, getMonthlyCommission, referrers, search, sortMode, statusFilter]);

  const orphanCount = useMemo(() => referrers.filter((r) => !r.user_id).length, [referrers]);

  const pageCount = Math.max(1, Math.ceil(referrerRows.length / PAGE_SIZE));
  const effectivePage = Math.min(page, pageCount);
  const pageRows = referrerRows.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Referrer</CardTitle>
          <div className="flex items-center gap-3">
            {orphanCount > 0 && (
              <button
                type="button"
                onClick={() => { setStatusFilter("orphan"); setPage(1); }}
                className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100"
              >
                <UserX className="h-3.5 w-3.5" />
                {orphanCount} senza accesso portale
              </button>
            )}
            <p className="text-sm text-muted-foreground">
              {referrerRows.length} risultati su {referrers.length}
            </p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Cerca nome, email, codice, tier..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="active">Solo attivi</SelectItem>
              <SelectItem value="inactive">Solo inattivi</SelectItem>
              <SelectItem value="to_pay">Con saldo da pagare</SelectItem>
              <SelectItem value="orphan">Senza accesso portale</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortMode} onValueChange={(value) => { setSortMode(value); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Ordina" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="balance_desc">Saldo da pagare</SelectItem>
              <SelectItem value="monthly_desc">Commissione mensile</SelectItem>
              <SelectItem value="companies_desc">Aziende portate</SelectItem>
              <SelectItem value="conversion_desc">Conversion rate</SelectItem>
              <SelectItem value="created_desc">Più recenti</SelectItem>
              <SelectItem value="name_asc">Nome A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
        ) : referrerRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <Search className="h-10 w-10" />
            <p>Nessun referrer corrisponde ai filtri.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setPage(1);
              }}
            >
              Azzera filtri
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
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
                  {pageRows.map((r) => {
                    const monthly = getMonthlyCommission(r);
                    const toPay = Math.max(0, (r.total_earned || 0) - (r.total_paid || 0));
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
                          <Badge variant={(r.conversion_rate || 0) >= 10 ? "default" : "secondary"}>
                            {(r.conversion_rate || 0).toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(monthly)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(toPay)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant={r.is_active ? "default" : "secondary"}>
                              {r.is_active ? "Attivo" : "Inattivo"}
                            </Badge>
                            {!r.user_id && (
                              <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
                                <UserX className="h-3 w-3" /> Senza accesso
                              </Badge>
                            )}
                          </div>
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
                              <Button variant="ghost" size="icon" disabled={toPay <= 0} onClick={() => onPayout(r)}>
                                <CreditCard className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{toPay > 0 ? "Registra pagamento" : "Nessun saldo da pagare"}</TooltipContent>
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
                              <Button variant="ghost" size="icon" onClick={() => setAccessTarget(r)}>
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Gestisci accesso</TooltipContent>
                          </Tooltip>
                          {!r.user_id && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-amber-600 hover:text-amber-700"
                                  disabled={relinkingId === r.id}
                                  onClick={() => relinkAccount(r)}
                                >
                                  {relinkingId === r.id
                                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                                    : <MailPlus className="h-4 w-4" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Reinvita / collega account portale</TooltipContent>
                            </Tooltip>
                          )}
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
            </div>
            {pageCount > 1 && (
              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Pagina {effectivePage} di {pageCount}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={effectivePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Precedente
                  </Button>
                  <Button variant="outline" size="sm" disabled={effectivePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                    Successiva
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <AccessControlDialog
        open={!!accessTarget}
        onOpenChange={(o) => { if (!o) setAccessTarget(null); }}
        email={accessTarget?.email ?? null}
        label={accessTarget?.name}
        denorm={accessTarget ? { table: "referrers", id: accessTarget.id } : null}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ["referrers"] })}
      />
    </Card>
  );
}
