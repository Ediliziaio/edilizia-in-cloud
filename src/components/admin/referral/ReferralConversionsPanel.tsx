import { useMemo, useState } from "react";
import { Building2, Filter, MousePointerClick, Search, ShieldAlert, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import type { ReferralClick, ReferralCompany, ReferralConversion, Referrer } from "@/pages/admin/ReferralDashboard";

interface Props {
  referrers: Referrer[];
  referralCompanies: ReferralCompany[];
  conversions: ReferralConversion[];
  clicks: ReferralClick[];
  onDetail: (r: Referrer) => void;
}

// Etichette allineate al portale partner (PartnerReferrals) per coerenza tra le due pagine.
const FUNNEL_LABEL: Record<string, string> = {
  click: "Click",
  registered: "Registrato",
  active: "Attivo",
  paying: "Pagante",
  approved: "Approvato",
  rejected: "Rifiutato",
  expired: "Scaduto",
};

function funnelBadge(status: string | null, fraud: string | null) {
  if (fraud === "blocked") return <Badge variant="destructive">Bloccato</Badge>;
  if (fraud === "review") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">In verifica</Badge>;
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  if (status === "paying" || status === "approved") return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">{FUNNEL_LABEL[status] || status}</Badge>;
  if (status === "rejected" || status === "expired") return <Badge variant="secondary">{FUNNEL_LABEL[status] || status}</Badge>;
  return <Badge variant="outline">{FUNNEL_LABEL[status] || status}</Badge>;
}

function estimateLineCommission(referrer: Referrer | undefined, mrr: number) {
  if (!referrer) return 0;
  if (referrer.commission_type === "percentage") return mrr * (Number(referrer.commission_value || 0) / 100);
  return Number(referrer.commission_value || 0);
}

function getStatus(row: ReferralCompany) {
  if (row.is_active && row.company?.status === "active") return "active";
  if (row.is_active && row.company?.status && row.company.status !== "active") return "review";
  return "inactive";
}

export function ReferralConversionsPanel({ referrers, referralCompanies, conversions, clicks, onDetail }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const referrersById = useMemo(() => new Map(referrers.map((r) => [r.id, r])), [referrers]);
  const clicksByReferrer = useMemo(() => {
    const map = new Map<string, ReferralClick[]>();
    clicks.forEach((click) => map.set(click.referrer_id, [...(map.get(click.referrer_id) || []), click]));
    return map;
  }, [clicks]);
  // Stessa sorgente dati del portale partner: referral_conversions per (referrer_id, company_id).
  const conversionByKey = useMemo(() => {
    const map = new Map<string, ReferralConversion>();
    conversions.forEach((c) => { if (c.company_id) map.set(`${c.referrer_id}:${c.company_id}`, c); });
    return map;
  }, [conversions]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return referralCompanies
      .map((row) => {
        const referrer = referrersById.get(row.referrer_id);
        const mrr = Number(row.plan?.price_monthly || 0);
        const status = getStatus(row);
        const clickCount = clicksByReferrer.get(row.referrer_id)?.length || 0;
        const conversion = conversionByKey.get(`${row.referrer_id}:${row.company_id}`);
        return {
          ...row,
          referrer,
          mrr,
          status,
          clickCount,
          commission: estimateLineCommission(referrer, mrr),
          funnelStatus: conversion?.status ?? null,
          revenue: Number(conversion?.revenue ?? 0),
          trackedCommission: Number(conversion?.commission_amount ?? 0),
          fraudStatus: conversion?.fraud_status ?? null,
        };
      })
      .filter((row) => {
        if (statusFilter !== "all" && row.status !== statusFilter) return false;
        if (!needle) return true;
        return [
          row.referrer?.name || "",
          row.referrer?.email || "",
          row.company?.name || "",
          row.company?.status || "",
          row.notes || "",
        ].some((value) => value.toLowerCase().includes(needle));
      })
      .sort((a, b) => new Date(b.referred_at).getTime() - new Date(a.referred_at).getTime());
  }, [clicksByReferrer, conversionByKey, referralCompanies, referrersById, search, statusFilter]);

  const activeRows = rows.filter((row) => row.status === "active");
  const reviewRows = rows.filter((row) => row.status === "review");
  const totalMrr = activeRows.reduce((sum, row) => sum + row.mrr, 0);
  const totalCommission = activeRows.reduce((sum, row) => sum + row.commission, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const flaggedCount = rows.filter((row) => row.fraudStatus === "review" || row.fraudStatus === "blocked").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversioni</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
            <p className="text-xs text-muted-foreground">{activeRows.length} attive</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR attivo</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalMrr)}</div>
            <p className="text-xs text-muted-foreground">Solo aziende attive</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comm. stimata</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCommission)}</div>
            <p className="text-xs text-muted-foreground">Base mensile</p>
          </CardContent>
        </Card>
        <Card className={reviewRows.length > 0 ? "border-amber-300" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Da verificare</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reviewRows.length}</div>
            <p className="text-xs text-muted-foreground">Referral attivi ma azienda non active</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Conversioni e attribuzione</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{rows.length} risultati</Badge>
              <Badge variant="outline">Revenue tracciata {formatCurrency(totalRevenue)}</Badge>
              {flaggedCount > 0 && <Badge variant="destructive">{flaggedCount} segnalati frode</Badge>}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Cerca partner o azienda..." />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="active">Solo attive</SelectItem>
                <SelectItem value="review">Da verificare</SelectItem>
                <SelectItem value="inactive">Inattive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nessuna conversione trovata</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Azienda</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Funnel</TableHead>
                    <TableHead className="text-center">Click partner</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-right">Comm.</TableHead>
                    <TableHead className="text-right">Azione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.company?.name || "Azienda non trovata"}</div>
                        <div className="text-xs text-muted-foreground">{row.company?.status || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.referrer?.name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{row.referrer?.email || "-"}</div>
                      </TableCell>
                      <TableCell className="text-sm">{formatDateShort(row.referred_at)}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "active" ? "default" : row.status === "review" ? "outline" : "secondary"}>
                          {row.status === "active" ? "Attiva" : row.status === "review" ? "Da verificare" : "Inattiva"}
                        </Badge>
                      </TableCell>
                      <TableCell>{funnelBadge(row.funnelStatus, row.fraudStatus)}</TableCell>
                      <TableCell className="text-center" title="Totale click del partner (ultimi 90 giorni)">{row.clickCount}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.mrr)}</TableCell>
                      <TableCell className="text-right">
                        <div>{formatCurrency(row.commission)}</div>
                        {row.trackedCommission > 0 && (
                          <div className="text-xs text-muted-foreground">tracc. {formatCurrency(row.trackedCommission)}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.referrer && (
                          <Button variant="ghost" size="sm" onClick={() => onDetail(row.referrer!)}>
                            Partner
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
