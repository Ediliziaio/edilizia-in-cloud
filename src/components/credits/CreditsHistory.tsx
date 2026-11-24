/**
 * CreditsHistory — Storico unificato movimenti crediti.
 *
 * Sostituisce 2 componenti separati (storico email + WhatsAppCreditsLog) con
 * un'unica tabella filtrata per:
 *   - Wallet (Email/AI/WhatsApp)
 *   - Tipo movimento (deduction/topup/bonus/refund)
 *   - Range data (last7/last30/last90/all)
 *
 * Plus:
 *   - Esporta CSV
 *   - Empty state coerente
 *   - Loading skeleton
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { escapeCsvCell } from "@/lib/csvExport";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import { format, subDays } from "date-fns";
import { Clock, Download, FilterX } from "lucide-react";
import { cn } from "@/lib/utils";

import { useIsMobile } from "@/hooks/use-mobile";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";
interface CreditLogEntry {
  id: string;
  type: string;
  amount_eur: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

type WalletFilter = "email" | "whatsapp" | "ai";
type TypeFilter = "all" | "deduction" | "topup" | "bonus" | "refund";
type RangeFilter = "7" | "30" | "90" | "all";

const WALLET_TABLES: Record<WalletFilter, string> = {
  email:    "email_credits_log",
  whatsapp: "whatsapp_credits_log",
  ai:       "ai_credit_topups",
};

const TYPE_LABELS: Record<string, string> = {
  deduction: "Detrazione",
  topup:     "Ricarica",
  bonus:     "Bonus",
  refund:    "Rimborso",
};

const TYPE_VARIANTS: Record<string, "default" | "destructive" | "secondary"> = {
  deduction: "destructive",
  topup:     "default",
  bonus:     "secondary",
  refund:    "secondary",
};

export function CreditsHistory() {
  const t = useT();
  const isMobile = useIsMobile();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [wallet, setWallet] = useState<WalletFilter>("email");
  const [type, setType] = useState<TypeFilter>("all");
  const [range, setRange] = useState<RangeFilter>("30");

  const { data: rows, isLoading, isError, refetch } = useQuery({
    queryKey: ["credits-history", companyId, wallet, range],
    queryFn: async () => {
      if (!companyId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from(WALLET_TABLES[wallet])
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (range !== "all") {
        const from = subDays(new Date(), Number(range)).toISOString();
        q = q.gte("created_at", from);
      }
      const { data, error } = await q;
      if (error) throw error;
      // ai_credit_topups ha schema diverso (no balance_before/after, no description).
      // Adatta i campi al CreditLogEntry comune.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any): CreditLogEntry => ({
        id: r.id,
        type: r.type === "deduct" ? "deduction" : r.type,
        amount_eur: r.amount_eur,
        balance_before: r.balance_before ?? 0,
        balance_after: r.balance_after ?? 0,
        description: r.description ?? r.notes ?? null,
        created_at: r.created_at,
      }));
    },
    enabled: !!companyId,
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    return type === "all" ? rows : rows.filter((r: any) => r.type === type);
  }, [rows, type]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc: any, r: any) => {
        if (r.type === "deduction") acc.spent += Math.abs(r.amount_eur);
        else acc.recharged += Math.abs(r.amount_eur);
        return acc;
      },
      { spent: 0, recharged: 0 },
    );
  }, [filtered]);

  const handleExportCsv = () => {
    if (!filtered.length) return;
    const headers = ["Data", "Tipo", "Importo (EUR)", "Saldo Prima", "Saldo Dopo", "Descrizione"];
    const csvRows = filtered.map((r: any) => [
      format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
      TYPE_LABELS[r.type] ?? r.type,
      r.type === "deduction" ? -Math.abs(r.amount_eur) : Math.abs(r.amount_eur),
      r.balance_before,
      r.balance_after,
      r.description ?? "",
    ]);
    const csv = [headers, ...csvRows]
      .map((row) => row.map((c: any) => escapeCsvCell(c, ",")).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crediti_${wallet}_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setType("all");
    setRange("30");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" /> {t("Storico movimenti")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filtri toolbar */}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("Servizio")}</label>
            <Select value={wallet} onValueChange={(v) => setWallet(v as WalletFilter)}>
              <SelectTrigger aria-label={t("Servizio")} className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">{t("Email Marketing")}</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="ai">{t("Agenti AI")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("Tipo")}</label>
            <Select value={type} onValueChange={(v) => setType(v as TypeFilter)}>
              <SelectTrigger aria-label={t("Tipo movimento")} className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("Tutti")}</SelectItem>
                <SelectItem value="topup">{t("Ricarica")}</SelectItem>
                <SelectItem value="deduction">{t("Detrazione")}</SelectItem>
                <SelectItem value="bonus">{t("Bonus")}</SelectItem>
                <SelectItem value="refund">{t("Rimborso")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("Periodo")}</label>
            <Select value={range} onValueChange={(v) => setRange(v as RangeFilter)}>
              <SelectTrigger aria-label={t("Periodo movimenti")} className="h-8 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t("Ultimi 7gg")}</SelectItem>
                <SelectItem value="30">{t("Ultimi 30gg")}</SelectItem>
                <SelectItem value="90">{t("Ultimi 90gg")}</SelectItem>
                <SelectItem value="all">{t("Tutto")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(type !== "all" || range !== "30") && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <FilterX className="mr-1 h-3.5 w-3.5" />
              {t("Reset")}
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {filtered.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("{n} movimenti · Speso {speso} · Ricaricato {ricaricato}", { n: filtered.length, speso: formatEur(totals.spent), ricaricato: formatEur(totals.recharged) })}
              </p>
            )}
            {/* Niente export su telefono. */}
            {!isMobile && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={filtered.length === 0}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                CSV
              </Button>
            )}
          </div>
        </div>

        {/* Tabella */}
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : isError ? (
          <div role="alert" className="text-sm text-destructive">
            {t("Impossibile caricare lo storico dei movimenti.")}
            <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("Riprova")}</Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
            {t("Nessun movimento registrato per i filtri selezionati.")}
          </p>
        ) : (
          <div className="max-h-[500px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>{t("Data")}</TableHead>
                  <TableHead>{t("Tipo")}</TableHead>
                  <TableHead className="text-right">{t("Importo")}</TableHead>
                  {wallet !== "ai" && <TableHead className="text-right">{t("Saldo Prima")}</TableHead>}
                  {wallet !== "ai" && <TableHead className="text-right">{t("Saldo Dopo")}</TableHead>}
                  <TableHead>{t("Descrizione")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: dateFnsCampo() })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={TYPE_VARIANTS[log.type] ?? "secondary"} className="text-[10px]">
                        {TYPE_LABELS[log.type] ? t(TYPE_LABELS[log.type]) : log.type}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono font-semibold",
                        log.type === "deduction" ? "text-destructive" : "text-emerald-600",
                      )}
                    >
                      {log.type === "deduction" ? "-" : "+"}
                      {formatEur(Math.abs(log.amount_eur), Math.abs(log.amount_eur) > 0 && Math.abs(log.amount_eur) < 0.01 ? 6 : 2)}
                    </TableCell>
                    {wallet !== "ai" && (
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {formatEur(log.balance_before)}
                      </TableCell>
                    )}
                    {wallet !== "ai" && (
                      <TableCell className="text-right font-mono text-xs">
                        {formatEur(log.balance_after)}
                      </TableCell>
                    )}
                    <TableCell className="max-w-[250px] truncate text-xs">
                      {log.description || "—"}
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
