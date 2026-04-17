import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Receipt, ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

/**
 * Storico unificato transazioni crediti per una singola azienda.
 *
 * Sorgente: view `credit_transactions_unified` (migration 20260417000008).
 * Unifica ai_credit_transactions + email_credits_log + whatsapp_credits_log +
 * render_sessions in un unico stream con schema normalizzato
 * (credit_type, direction, amount, balance_before/after, ...).
 *
 * Pensato per embed nella tab Abbonamento della pagina dettaglio azienda
 * del SuperAdmin. Paginazione server-side, filtro per tipo wallet.
 */

type CreditType = "all" | "ai" | "email" | "whatsapp" | "render";

interface UnifiedRow {
  id: string;
  credit_type: "ai" | "email" | "whatsapp" | "render";
  company_id: string;
  direction: "in" | "out";
  amount: number;
  balance_before: number | null;
  balance_after: number | null;
  type: string;
  description: string | null;
  reference_id: string | null;
  reference_kind: string | null;
  created_at: string;
}

const PAGE_SIZE = 25;

const TYPE_LABELS: Record<CreditType, string> = {
  all: "Tutti",
  ai: "AI Agents",
  email: "Email",
  whatsapp: "WhatsApp",
  render: "Render AI",
};

const TYPE_BADGE: Record<UnifiedRow["credit_type"], string> = {
  ai:       "bg-purple-100 text-purple-700 border-purple-200",
  email:    "bg-blue-100 text-blue-700 border-blue-200",
  whatsapp: "bg-emerald-100 text-emerald-700 border-emerald-200",
  render:   "bg-amber-100 text-amber-700 border-amber-200",
};

interface Props {
  companyId: string;
}

export function CreditTransactionsTable({ companyId }: Props) {
  const [type, setType] = useState<CreditType>("all");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-credit-transactions-unified", companyId, type, page],
    queryFn: async () => {
      let q = supabase
        .from("credit_transactions_unified" as never)
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (type !== "all") {
        q = q.eq("credit_type", type);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as UnifiedRow[], total: count ?? 0 };
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Storico Transazioni Crediti
            </CardTitle>
            <CardDescription>
              Movimenti unificati da AI, Email, WhatsApp, Render — sorgente <code className="text-[0.7rem]">credit_transactions_unified</code>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={type}
              onValueChange={(v) => { setType(v as CreditType); setPage(0); }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as CreditType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nessuna transazione crediti registrata per questa azienda
            {type !== "all" && ` (wallet: ${TYPE_LABELS[type]})`}
          </p>
        ) : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data</TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead className="text-right">Saldo dopo</TableHead>
                    <TableHead>Descrizione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isOut = row.direction === "out";
                    const isIntegerWallet = row.credit_type === "render";
                    const amountLabel = isIntegerWallet
                      ? `${isOut ? "-" : "+"}${row.amount}`
                      : `${isOut ? "-" : "+"}${formatCurrency(row.amount)}`;
                    const balanceLabel = row.balance_after != null
                      ? (isIntegerWallet ? String(row.balance_after) : formatCurrency(row.balance_after))
                      : "—";

                    return (
                      <TableRow key={`${row.credit_type}-${row.id}`}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {format(new Date(row.created_at), "dd/MM/yy HH:mm", { locale: it })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={TYPE_BADGE[row.credit_type]}>
                            {TYPE_LABELS[row.credit_type as CreditType]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1">
                            {isOut ? (
                              <ArrowDown className="h-3 w-3 text-red-500" />
                            ) : (
                              <ArrowUp className="h-3 w-3 text-green-500" />
                            )}
                            <span className="font-mono">{row.type}</span>
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${isOut ? "text-red-600" : "text-green-600"}`}>
                          {amountLabel}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {balanceLabel}
                        </TableCell>
                        <TableCell className="text-sm max-w-[260px] truncate" title={row.description ?? undefined}>
                          {row.description || <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>
                {total} transazioni · Pagina {page + 1} di {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
