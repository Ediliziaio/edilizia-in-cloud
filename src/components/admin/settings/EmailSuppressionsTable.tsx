// ============================================================================
// EmailSuppressionsTable — Email Dual-Provider FASE 11
// ============================================================================
// Tabella SuperAdmin per gestire `public.email_suppressions`:
//   - Filtro per reason (hard_bounce / spam_complaint / unsubscribe / manual /
//     invalid / legal), per scope (globale vs per-azienda), per search email.
//   - Delete puntuale (solo super_admin) — per "riabilitare" un indirizzo
//     sbloccato dall'utente.
//
// Fonte dati: public.email_suppressions (dopo migrazione 20260422000003).
// RLS: policy email_suppressions_write permette delete a super_admin.
//
// NOTA: types.ts non rigenerato post-migrazione, quindi tipizziamo
// esplicitamente tramite interface locale e usiamo .from("email_suppressions")
// con cast `as unknown as ...` per bypassare il tipo legacy.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Trash2,
  AlertTriangle,
  Loader2,
  Ban,
  Globe,
  Building2,
  Download,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { formatError } from "@/lib/errors";

// ── Tipi locali (types.ts legacy, non rigenerato) ───────────────────────────
type SuppressionReason =
  | "hard_bounce"
  | "spam_complaint"
  | "unsubscribe"
  | "manual"
  | "invalid"
  | "legal";

interface SuppressionRow {
  id: string;
  email: string;
  reason: SuppressionReason;
  suppressed_at: string;
  company_id: string | null;
  source_provider: string | null;
  source_event_id: string | null;
  notes: string | null;
  companies?: { name: string | null } | null;
}

const REASON_LABEL: Record<SuppressionReason, string> = {
  hard_bounce:     "Hard bounce",
  spam_complaint:  "Spam complaint",
  unsubscribe:     "Unsubscribe",
  manual:          "Manuale",
  invalid:         "Email non valida",
  legal:           "Legale",
};

const REASON_VARIANT: Record<SuppressionReason, "default" | "destructive" | "secondary" | "outline"> = {
  hard_bounce:     "destructive",
  spam_complaint:  "destructive",
  unsubscribe:     "secondary",
  manual:          "outline",
  invalid:         "outline",
  legal:           "destructive",
};

type ReasonFilter = "all" | SuppressionReason;
type ScopeFilter = "all" | "global" | "company";

const PAGE_SIZE = 25;
const SAFETY_CAP = 1000;

export function EmailSuppressionsTable() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["admin-email-suppressions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_suppressions")
        .select(`
          id, email, reason, suppressed_at, company_id,
          source_provider, source_event_id, notes,
          companies:company_id ( name )
        ` as "*")
        .order("suppressed_at", { ascending: false })
        .limit(SAFETY_CAP);

      if (error) throw error;
      return ((data ?? []) as unknown) as SuppressionRow[];
    },
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("email_suppressions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Soppressione rimossa. L'indirizzo riceverà di nuovo email.");
      queryClient.invalidateQueries({ queryKey: ["admin-email-suppressions"] });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Errore imprevisto";
      toast.error(`Impossibile rimuovere: ${msg}`);
    },
  });

  const filtered = useMemo(() => {
    const rows = query.data ?? [];
    const q = search.trim().toLowerCase();

    return rows.filter((r) => {
      if (reasonFilter !== "all" && r.reason !== reasonFilter) return false;
      if (scopeFilter === "global"  && r.company_id !== null) return false;
      if (scopeFilter === "company" && r.company_id === null) return false;
      if (q && !r.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query.data, search, reasonFilter, scopeFilter]);

  // Breakdown per motivo (per KPI + badge)
  const reasonBreakdown = useMemo(() => {
    const counts = new Map<SuppressionReason, number>();
    for (const r of query.data ?? []) {
      counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    }
    return counts;
  }, [query.data]);

  // Paginazione client (SAFETY_CAP = 1000 quindi fattibile)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // FIX: sincronizza `page` con `safePage` quando i filtri riducono la lista.
  // Senza questo, cliccando "Successiva" da pagina 5 quando filtered ha solo 2
  // pagine, il click alla pagina successiva partiva da `page=5+1=6` invece di
  // `safePage+1`, lasciando l'utente bloccato sull'ultima pagina valida.
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const handleExportCsv = () => {
    if (filtered.length === 0) return;
    const headers = ["Email", "Motivo", "Scope", "Provider", "Data", "Note"];
    const escape = (v: string | null | undefined) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filtered.map((r) =>
      [
        escape(r.email),
        escape(REASON_LABEL[r.reason]),
        escape(r.company_id === null ? "globale" : "per-azienda"),
        escape(r.source_provider),
        escape(format(new Date(r.suppressed_at), "yyyy-MM-dd HH:mm")),
        escape(r.notes),
      ].join(","),
    );
    const csv = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-suppressions-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Esportate ${filtered.length} soppressioni`);
  };

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (query.error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
          <span>Errore caricamento soppressioni: {formatError(query.error)}</span>
          <Button size="sm" variant="outline" onClick={() => query.refetch()} className="h-7 gap-1 text-xs">
            <RefreshCw className="h-3 w-3" /> Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const totalSuppressed = query.data?.length ?? 0;
  const hardBounce = reasonBreakdown.get("hard_bounce") ?? 0;
  const spam = reasonBreakdown.get("spam_complaint") ?? 0;
  const unsubscribe = reasonBreakdown.get("unsubscribe") ?? 0;

  return (
    <div className="space-y-4">
      {/* KPI breakdown per motivo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Totale
            </p>
            <p className="text-2xl font-bold mt-1">
              {totalSuppressed.toLocaleString("it-IT")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Hard bounce
            </p>
            <p
              className={`text-2xl font-bold mt-1 ${
                hardBounce > 0 ? "text-destructive" : ""
              }`}
            >
              {hardBounce.toLocaleString("it-IT")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Spam complaint
            </p>
            <p
              className={`text-2xl font-bold mt-1 ${
                spam > 0 ? "text-destructive" : ""
              }`}
            >
              {spam.toLocaleString("it-IT")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Unsubscribe
            </p>
            <p className="text-2xl font-bold mt-1">
              {unsubscribe.toLocaleString("it-IT")}
            </p>
          </CardContent>
        </Card>
      </div>

    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Ban className="h-4 w-4" />
          Lista soppressioni email
        </CardTitle>
        <CardDescription>
          Indirizzi bloccati dall'invio — hard bounce e spam complaint sono globali,
          unsubscribe è per-azienda.
          Rimuovere una voce sblocca immediatamente il destinatario.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toolbar filtri */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca per email…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-8"
            />
          </div>

          <Select
            value={reasonFilter}
            onValueChange={(v) => { setReasonFilter(v as ReasonFilter); setPage(0); }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Motivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i motivi</SelectItem>
              <SelectItem value="hard_bounce">Hard bounce</SelectItem>
              <SelectItem value="spam_complaint">Spam complaint</SelectItem>
              <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
              <SelectItem value="manual">Manuale</SelectItem>
              <SelectItem value="invalid">Email non valida</SelectItem>
              <SelectItem value="legal">Legale</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={scopeFilter}
            onValueChange={(v) => { setScopeFilter(v as ScopeFilter); setPage(0); }}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli scope</SelectItem>
              <SelectItem value="global">Solo globali</SelectItem>
              <SelectItem value="company">Solo per-azienda</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Counter + Export */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {filtered.length.toLocaleString("it-IT")} risultati
            {filtered.length !== (query.data?.length ?? 0) && (
              <> (di {(query.data?.length ?? 0).toLocaleString("it-IT")} totali)</>
            )}
          </span>
          {query.data && query.data.length >= SAFETY_CAP && (
            <Badge variant="outline" className="text-xs">
              Mostrate solo le ultime {SAFETY_CAP.toLocaleString("it-IT")}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="ml-auto h-8"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Esporta CSV
          </Button>
        </div>

        {/* Table */}
        {pageRows.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Nessuna soppressione trovata con i filtri correnti.
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Motivo</th>
                  <th className="py-2 px-3">Scope</th>
                  <th className="py-2 px-3">Provider</th>
                  <th className="py-2 px-3">Data</th>
                  <th className="py-2 px-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <SuppressionRowView
                    key={r.id}
                    row={r}
                    onDelete={() => deleteMutation.mutate(r.id)}
                    isDeleting={deleteMutation.isPending && deleteMutation.variables === r.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginazione */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Pagina {safePage + 1} di {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
              >
                Precedente
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
              >
                Successiva
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────
function SuppressionRowView({
  row,
  onDelete,
  isDeleting,
}: {
  row: SuppressionRow;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const dateFormatted = format(new Date(row.suppressed_at), "dd/MM/yyyy HH:mm", { locale: it });
  const isGlobal = row.company_id === null;

  return (
    <tr className="border-t hover:bg-muted/20">
      <td className="py-2 px-3 font-mono text-xs truncate max-w-[280px]">
        {row.email}
        {row.notes && (
          <p className="text-xs text-muted-foreground italic truncate">{row.notes}</p>
        )}
      </td>
      <td className="py-2 px-3">
        <Badge variant={REASON_VARIANT[row.reason]} className="text-xs font-normal">
          {REASON_LABEL[row.reason]}
        </Badge>
      </td>
      <td className="py-2 px-3">
        {isGlobal ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="h-3 w-3" />
            Globale
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            <span className="truncate max-w-[160px]">
              {row.companies?.name ?? row.company_id}
            </span>
          </div>
        )}
      </td>
      <td className="py-2 px-3 text-xs text-muted-foreground">
        {row.source_provider ?? "—"}
      </td>
      <td className="py-2 px-3 text-xs font-mono">{dateFormatted}</td>
      <td className="py-2 px-3 text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              disabled={isDeleting}
              aria-label={`Rimuovi soppressione per ${row.email}`}
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rimuovere la soppressione?</AlertDialogTitle>
              <AlertDialogDescription>
                L'indirizzo <strong className="font-mono">{row.email}</strong> tornerà
                a ricevere email {isGlobal ? "da tutte le aziende" : "da questa azienda"}.
                Usa con cautela: se era un hard bounce, l'invio successivo fallirà e danneggerà
                la reputazione del dominio.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Rimuovi
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}
