import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertCircle, Check, Clock, ExternalLink, Send, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";

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

  const quoteIds = useMemo(() => [...new Set(approvals.map((a) => a.quote_id))], [approvals]);

  const { data: quotes = [] } = useQuery({
    queryKey: ["quote-approvals-quotes", quoteIds],
    enabled: quoteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, client_name, title, total, salesperson_id, commission_amount_snapshot")
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

  const pending = approvals.filter((a) => a.decision === null);
  const decided = approvals.filter((a) => a.decision !== null);

  const [dialog, setDialog] = useState<{
    open: boolean;
    approval: QuoteApproval | null;
    mode: "approve" | "reject" | "counter" | null;
  }>({ open: false, approval: null, mode: null });
  const [note, setNote] = useState("");
  const [counterPct, setCounterPct] = useState<number>(0);

  const decideMutation = useMutation({
    mutationFn: async ({
      approval_id, decision, sconto_autorizzato_pct, p_note,
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
      qc.invalidateQueries({ queryKey: ["quote-approvals-quotes", quoteIds] });
      toast.success("Decisione registrata");
      setDialog({ open: false, approval: null, mode: null });
      setNote("");
      setCounterPct(0);
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });

  const openDecide = (a: QuoteApproval, mode: "approve" | "reject" | "counter") => {
    setDialog({ open: true, approval: a, mode });
    setCounterPct(Math.floor(a.sconto_richiesto_pct * 0.7 * 10) / 10);
    setNote("");
  };

  const confirmDecide = () => {
    if (!dialog.approval || !dialog.mode) return;
    const decision = dialog.mode === "approve" ? "approved" : dialog.mode === "reject" ? "rejected" : "counter_proposed";
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

  const renderRow = (a: QuoteApproval) => {
    const q = quotesById.get(a.quote_id);
    const isPending = a.decision === null;
    return (
      <TableRow key={a.id}>
        <TableCell>
          <div className="font-medium">{q?.quote_number ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{q?.client_name ?? q?.title ?? ""}</div>
        </TableCell>
        <TableCell className="text-right">{formatCurrency(a.importo_preventivo)}</TableCell>
        <TableCell className="text-right font-medium text-orange-600">
          {a.sconto_richiesto_pct.toFixed(1)}%
        </TableCell>
        <TableCell className="text-right">
          {a.margine_stimato_pct != null ? `${a.margine_stimato_pct.toFixed(1)}%` : "—"}
        </TableCell>
        <TableCell className="text-right text-xs text-muted-foreground">
          {q?.commission_amount_snapshot != null ? formatCurrency(q.commission_amount_snapshot) : "—"}
        </TableCell>
        <TableCell className="max-w-[200px]">
          <div className="text-xs truncate" title={a.note_richiesta ?? ""}>
            {a.note_richiesta ?? "—"}
          </div>
        </TableCell>
        <TableCell>
          {a.decision === "approved" && <Badge className="bg-green-600"><Check className="h-3 w-3 mr-1" />Approvato</Badge>}
          {a.decision === "rejected" && <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rifiutato</Badge>}
          {a.decision === "counter_proposed" && (
            <Badge className="bg-blue-600"><Send className="h-3 w-3 mr-1" />Contro {a.sconto_autorizzato_pct?.toFixed(1)}%</Badge>
          )}
          {isPending && <Badge variant="outline" className="border-orange-500 text-orange-600"><Clock className="h-3 w-3 mr-1" />Pending</Badge>}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center gap-1 justify-end">
            {q && (
              <Button variant="ghost" size="icon" asChild>
                <Link to={`/azienda/marketing/preventivi/${q.id}`}><ExternalLink className="h-4 w-4" /></Link>
              </Button>
            )}
            {isPending && (
              <>
                <Button size="sm" variant="outline" onClick={() => openDecide(a, "approve")}>
                  Approva
                </Button>
                <Button size="sm" variant="outline" onClick={() => openDecide(a, "counter")}>
                  Contro-proposta
                </Button>
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => openDecide(a, "reject")}>
                  Rifiuta
                </Button>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const renderTable = (rows: QuoteApproval[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Preventivo</TableHead>
          <TableHead className="text-right">Importo</TableHead>
          <TableHead className="text-right">Sconto richiesto</TableHead>
          <TableHead className="text-right">Margine stim.</TableHead>
          <TableHead className="text-right">Provv. teorica</TableHead>
          <TableHead>Nota</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead className="text-right">Azioni</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(renderRow)}
      </TableBody>
    </Table>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Approvazioni sconto preventivi</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Valuta le richieste dei commerciali. Vedi margine e provvigione per decidere.
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Da decidere
            {pending.length > 0 && <Badge className="ml-2" variant="secondary">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history">Storico</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Richieste in attesa</CardTitle>
              <CardDescription>{pending.length} richieste</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Caricamento…</div>
              ) : pending.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nessuna richiesta in attesa.</div>
              ) : (
                renderTable(pending)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Storico decisioni</CardTitle>
              <CardDescription>Ultime {decided.length} richieste già decise</CardDescription>
            </CardHeader>
            <CardContent>
              {decided.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nessuna richiesta decisa.</div>
              ) : (
                renderTable(decided)
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ ...dialog, open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog.mode === "approve" && "Approva lo sconto"}
              {dialog.mode === "reject" && "Rifiuta la richiesta"}
              {dialog.mode === "counter" && "Contro-proposta"}
            </DialogTitle>
            <DialogDescription>
              {dialog.approval && (
                <>
                  Preventivo {quotesById.get(dialog.approval.quote_id)?.quote_number ?? dialog.approval.quote_id.slice(0, 8)} ·
                  richiesto <strong>{dialog.approval.sconto_richiesto_pct.toFixed(1)}%</strong> su{" "}
                  {formatCurrency(dialog.approval.importo_preventivo)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {dialog.mode === "counter" && (
              <div>
                <Label>Sconto autorizzato (%)</Label>
                <Input
                  type="number" step="0.1" min="0" max="100"
                  value={counterPct}
                  onChange={(e) => setCounterPct(Number(e.target.value))}
                />
              </div>
            )}
            <div>
              <Label>{dialog.mode === "reject" ? "Motivazione rifiuto" : "Nota per il commerciale (opzionale)"}</Label>
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={dialog.mode === "reject" ? "Spiega perché non puoi autorizzare..." : "Nota (facoltativa)"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, approval: null, mode: null })}>
              Annulla
            </Button>
            <Button onClick={confirmDecide} disabled={decideMutation.isPending}>
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
