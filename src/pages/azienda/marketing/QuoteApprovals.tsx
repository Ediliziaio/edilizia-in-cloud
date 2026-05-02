import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  Clock,
  ExternalLink,
  Send,
  XCircle,
  Percent,
  TrendingDown,
  Inbox,
  Eye,
  MoreHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuoteQuickViewSheet } from "@/components/marketing/preventivi/QuoteQuickViewSheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface QuoteApproval {
  id: string;
  company_id: string;
  quote_id: string;
  requested_by: string;
  requested_at: string;
  sconto_richiesto_pct: number;
  importo_preventivo: number;
  margine_stimato_pct: number | null;
  note_richiesta: string | null;
  decision: "approved" | "rejected" | "counter_proposed" | null;
  decided_by: string | null;
  decided_at: string | null;
  sconto_autorizzato_pct: number | null;
  note_decisione: string | null;
}

interface QuoteInfo {
  id: string;
  quote_number: string;
  client_name: string | null;
  title: string | null;
  total: number | null;
  salesperson_id: string | null;
  commission_amount_snapshot: number | null;
}

export default function QuoteApprovals() {
  const companyId = useEffectiveCompanyId();
  const { role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "super_admin" || role === "company_admin";

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ["quote-approvals", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_approvals")
        .select("*")
        .eq("company_id", companyId!)
        .order("requested_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as QuoteApproval[];
    },
  });

  const quoteIds = useMemo(
    () => [...new Set(approvals.map((a) => a.quote_id))],
    [approvals]
  );

  const { data: quotes = [] } = useQuery({
    queryKey: ["quote-approvals-quotes", quoteIds],
    enabled: quoteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(
          "id, quote_number, client_name, title, total, salesperson_id, commission_amount_snapshot"
        )
        .eq("company_id", companyId!)
        .in("id", quoteIds);
      if (error) throw error;
      return data as QuoteInfo[];
    },
  });

  const quotesById = useMemo(() => {
    const m = new Map<string, QuoteInfo>();
    quotes.forEach((q) => m.set(q.id, q));
    return m;
  }, [quotes]);

  const [spFilter, setSpFilter] = useState<string>("tutti");

  const { data: salespeopleList = [] } = useQuery({
    queryKey: ["salespeople-for-approvals", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("id, first_name, last_name")
        .eq("company_id", companyId!)
        .order("last_name");
      if (error) throw error;
      return data as Array<{ id: string; first_name: string; last_name: string }>;
    },
  });

  const salespersonNameById = useMemo(() => {
    const m = new Map<string, string>();
    salespeopleList.forEach((s) =>
      m.set(s.id, `${s.first_name} ${s.last_name}`)
    );
    return m;
  }, [salespeopleList]);

  const approvalsFiltered = useMemo(() => {
    if (spFilter === "tutti") return approvals;
    return approvals.filter((a) => {
      const q = quotesById.get(a.quote_id);
      if (spFilter === "none") return !q?.salesperson_id;
      return q?.salesperson_id === spFilter;
    });
  }, [approvals, quotesById, spFilter]);

  const pending = approvalsFiltered.filter((a) => a.decision === null);
  const decided = approvalsFiltered.filter((a) => a.decision !== null);

  // KPI computati
  const approvedCount = decided.filter((a) => a.decision === "approved").length;
  const rejectedCount = decided.filter((a) => a.decision === "rejected").length;
  const counterCount = decided.filter(
    (a) => a.decision === "counter_proposed"
  ).length;
  const approvalRate =
    decided.length > 0
      ? Math.round(((approvedCount + counterCount) / decided.length) * 100)
      : null;
  const avgApprovedDiscount = useMemo(() => {
    const approvedOnes = decided.filter(
      (a) =>
        (a.decision === "approved" || a.decision === "counter_proposed") &&
        a.sconto_autorizzato_pct !== null
    );
    if (approvedOnes.length === 0) return null;
    return (
      approvedOnes.reduce(
        (s, a) => s + (a.sconto_autorizzato_pct ?? 0),
        0
      ) / approvedOnes.length
    );
  }, [decided]);
  const pendingValue = pending.reduce((s, a) => s + a.importo_preventivo, 0);

  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    open: boolean;
    approval: QuoteApproval | null;
    mode: "approve" | "reject" | "counter" | null;
  }>({ open: false, approval: null, mode: null });
  const [note, setNote] = useState("");
  const [counterPct, setCounterPct] = useState<number>(0);

  const decideMutation = useMutation({
    mutationFn: async ({
      approval_id,
      decision,
      sconto_autorizzato_pct,
      p_note,
    }: {
      approval_id: string;
      decision: "approved" | "rejected" | "counter_proposed";
      sconto_autorizzato_pct: number | null;
      p_note: string | null;
    }) => {
      const { error } = await supabase.rpc("decide_quote_approval", {
        p_approval_id: approval_id,
        p_decision: decision,
        p_sconto_autorizzato_pct: sconto_autorizzato_pct,
        p_note,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-approvals", companyId] });
      qc.invalidateQueries({
        queryKey: ["quote-approvals-quotes", quoteIds],
      });
      toast.success("Decisione registrata");
      setDialog({ open: false, approval: null, mode: null });
      setNote("");
      setCounterPct(0);
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });

  const openDecide = (
    a: QuoteApproval,
    mode: "approve" | "reject" | "counter"
  ) => {
    setDialog({ open: true, approval: a, mode });
    setCounterPct(Math.floor(a.sconto_richiesto_pct * 0.7 * 10) / 10);
    setNote("");
  };

  const confirmDecide = () => {
    if (!dialog.approval || !dialog.mode) return;
    const decision =
      dialog.mode === "approve"
        ? "approved"
        : dialog.mode === "reject"
        ? "rejected"
        : "counter_proposed";
    decideMutation.mutate({
      approval_id: dialog.approval.id,
      decision,
      sconto_autorizzato_pct: dialog.mode === "counter" ? counterPct : null,
      p_note: note || null,
    });
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Accesso riservato agli admin.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Helper: riga tabella
  const renderRow = (a: QuoteApproval, idx: number) => {
    const q = quotesById.get(a.quote_id);
    const isPending = a.decision === null;
    return (
      <TableRow
        key={a.id}
        className={`transition-colors ${
          idx % 2 === 1 ? "bg-muted/30 hover:bg-muted/60" : "hover:bg-muted/40"
        }`}
      >
        <TableCell>
          <div className="font-mono text-sm font-medium">
            {q?.quote_number ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground truncate max-w-[180px]">
            {q?.client_name ?? q?.title ?? "—"}
          </div>
        </TableCell>
        <TableCell className="text-xs">
          {q?.salesperson_id ? (
            <span className="text-foreground">
              {salespersonNameById.get(q.salesperson_id) ?? "—"}
            </span>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="font-medium tabular-nums">
            {formatCurrency(a.importo_preventivo)}
          </div>
        </TableCell>
        <TableCell className="text-right">
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 text-xs font-semibold tabular-nums">
            <TrendingDown className="h-3 w-3" />
            {a.sconto_richiesto_pct.toFixed(1)}%
          </div>
          {a.decision === "counter_proposed" && a.sconto_autorizzato_pct != null && (
            <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5 tabular-nums">
              → {a.sconto_autorizzato_pct.toFixed(1)}%
            </div>
          )}
        </TableCell>
        <TableCell className="text-right">
          {a.margine_stimato_pct != null ? (
            <span
              className={`text-xs tabular-nums font-medium ${
                a.margine_stimato_pct < 15
                  ? "text-red-600"
                  : a.margine_stimato_pct < 25
                  ? "text-orange-600"
                  : "text-emerald-600"
              }`}
            >
              {a.margine_stimato_pct.toFixed(1)}%
            </span>
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          )}
        </TableCell>
        <TableCell className="max-w-[180px]">
          {a.note_richiesta ? (
            <div
              className="text-xs text-muted-foreground truncate italic"
              title={a.note_richiesta}
            >
              "{a.note_richiesta}"
            </div>
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          )}
        </TableCell>
        <TableCell>
          {a.decision === "approved" && (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
              <Check className="h-3 w-3" />
              Approvato
            </Badge>
          )}
          {a.decision === "rejected" && (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              Rifiutato
            </Badge>
          )}
          {a.decision === "counter_proposed" && (
            <Badge className="bg-blue-600 hover:bg-blue-600 gap-1">
              <Send className="h-3 w-3" />
              Contro-proposta
            </Badge>
          )}
          {isPending && (
            <Badge
              variant="outline"
              className="border-orange-500 text-orange-600 gap-1 bg-orange-50 dark:bg-orange-950/30"
            >
              <Clock className="h-3 w-3" />
              Pending
            </Badge>
          )}
          {a.decided_at && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {format(new Date(a.decided_at), "dd MMM yy", { locale: it })}
            </div>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            {isPending ? (
              <>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => openDecide(a, "approve")}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Approva
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => openDecide(a, "counter")}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Contro
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-destructive border-destructive/30"
                  onClick={() => openDecide(a, "reject")}
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Rifiuta
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {q && (
                      <DropdownMenuItem onClick={() => setQuickViewId(q.id)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Anteprima margini
                      </DropdownMenuItem>
                    )}
                    {q && (
                      <DropdownMenuItem asChild>
                        <Link to={`/azienda/marketing/preventivi/${q.id}`}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Apri preventivo
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {q?.commission_amount_snapshot != null && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled className="text-xs">
                          Provv. teorica:{" "}
                          {formatCurrency(q.commission_amount_snapshot)}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                {q && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Anteprima margini"
                    onClick={() => setQuickViewId(q.id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
                {q && (
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    className="h-7 w-7"
                    title="Apri preventivo"
                  >
                    <Link to={`/azienda/marketing/preventivi/${q.id}`}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const renderTable = (rows: QuoteApproval[]) => (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Preventivo</TableHead>
            <TableHead>Commerciale</TableHead>
            <TableHead className="text-right">Importo</TableHead>
            <TableHead className="text-right">Sconto</TableHead>
            <TableHead className="text-right">Margine</TableHead>
            <TableHead>Nota richiesta</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{rows.map((r, idx) => renderRow(r, idx))}</TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center shrink-0">
            <Percent className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Approvazioni sconto
            </h1>
            <p className="text-sm text-muted-foreground">
              Valuta le richieste dei commerciali · margine e provvigione in chiaro
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={spFilter} onValueChange={setSpFilter}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Tutti i commerciali" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti i commerciali</SelectItem>
              <SelectItem value="none">Senza commerciale</SelectItem>
              {salespeopleList.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI hero */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="overflow-hidden border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                In attesa
              </p>
              <Clock className="h-4 w-4 text-orange-500" />
            </div>
            <p className="text-2xl font-bold mt-1.5">{pending.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {pendingValue > 0 ? formatCurrency(pendingValue) + " da decidere" : "nessuna richiesta"}
            </p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Approvate
              </p>
              <Check className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold mt-1.5">
              {approvedCount + counterCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {counterCount > 0
                ? `${approvedCount} + ${counterCount} contro-proposte`
                : "nel totale storico"}
            </p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Rifiutate
              </p>
              <XCircle className="h-4 w-4 text-red-500" />
            </div>
            <p className="text-2xl font-bold mt-1.5">{rejectedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {approvalRate !== null
                ? `${approvalRate}% approval rate`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Sconto medio autorizzato
              </p>
              <TrendingDown className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-1.5 tabular-nums">
              {avgApprovedDiscount !== null
                ? `${avgApprovedDiscount.toFixed(1)}%`
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              su {approvedCount + counterCount} autorizzat
              {approvedCount + counterCount === 1 ? "a" : "e"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList className="h-9">
          <TabsTrigger value="pending" className="gap-1.5 text-xs">
            Da decidere
            <span
              className={`text-[10px] rounded px-1.5 py-0.5 tabular-nums ${
                pending.length > 0
                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
                  : "bg-muted"
              }`}
            >
              {pending.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs">
            Storico
            <span className="text-[10px] bg-muted rounded px-1.5 py-0.5 tabular-nums">
              {decided.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground border rounded-lg">
              Caricamento…
            </div>
          ) : pending.length === 0 ? (
            <div className="border rounded-lg p-12 text-center">
              <Inbox className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium">Nessuna richiesta in attesa</p>
              <p className="text-sm text-muted-foreground mt-1">
                Ottimo! Tutte le richieste sono state evase.
              </p>
            </div>
          ) : (
            renderTable(pending)
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {decided.length === 0 ? (
            <div className="border rounded-lg p-12 text-center">
              <Inbox className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium">Nessuna decisione ancora</p>
              <p className="text-sm text-muted-foreground mt-1">
                Lo storico comparirà qui dopo la prima decisione.
              </p>
            </div>
          ) : (
            renderTable(decided)
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog decisione */}
      <Dialog
        open={dialog.open}
        onOpenChange={(o) => setDialog({ ...dialog, open: o })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialog.mode === "approve" && (
                <>
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                    <Check className="h-4 w-4 text-emerald-600" />
                  </div>
                  Approva lo sconto
                </>
              )}
              {dialog.mode === "reject" && (
                <>
                  <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
                    <XCircle className="h-4 w-4 text-red-600" />
                  </div>
                  Rifiuta la richiesta
                </>
              )}
              {dialog.mode === "counter" && (
                <>
                  <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                    <Send className="h-4 w-4 text-blue-600" />
                  </div>
                  Contro-proposta
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {dialog.approval && (
                <>
                  Preventivo{" "}
                  <span className="font-mono">
                    {quotesById.get(dialog.approval.quote_id)?.quote_number ??
                      dialog.approval.quote_id.slice(0, 8)}
                  </span>{" "}
                  · richiesto{" "}
                  <strong className="text-orange-600">
                    {dialog.approval.sconto_richiesto_pct.toFixed(1)}%
                  </strong>{" "}
                  su {formatCurrency(dialog.approval.importo_preventivo)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {dialog.mode === "counter" && (
              <div>
                <Label>Sconto autorizzato (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={counterPct}
                  onChange={(e) => setCounterPct(Number(e.target.value))}
                />
              </div>
            )}
            <div>
              <Label>
                {dialog.mode === "reject"
                  ? "Motivazione rifiuto"
                  : "Nota per il commerciale (opzionale)"}
              </Label>
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  dialog.mode === "reject"
                    ? "Spiega perché non puoi autorizzare..."
                    : "Nota (facoltativa)"
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setDialog({ open: false, approval: null, mode: null })
              }
            >
              Annulla
            </Button>
            <Button
              onClick={confirmDecide}
              disabled={decideMutation.isPending}
              className={
                dialog.mode === "reject"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : dialog.mode === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : ""
              }
            >
              {decideMutation.isPending ? "Invio..." : "Conferma"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuoteQuickViewSheet
        quoteId={quickViewId}
        open={!!quickViewId}
        onOpenChange={(o) => {
          if (!o) setQuickViewId(null);
        }}
      />
    </div>
  );
}
