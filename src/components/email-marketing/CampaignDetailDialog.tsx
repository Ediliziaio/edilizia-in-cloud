/**
 * CampaignDetailDialog — drill-down per-destinatario di una campagna email.
 *
 * KPI in testa (consegnate, aperture, click, bounce, disiscritti) + tabella
 * destinatari paginata con filtro stato, ricerca per email/nome ed export
 * CSV. Fonte: RPC get_email_campaign_recipients (email_logs ⋈ contatti).
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Download, ChevronLeft, ChevronRight, MailCheck, MailOpen,
  MousePointerClick, MailX, UserMinus, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

interface RecipientRow {
  log_id: string;
  email: string;
  full_name: string | null;
  status: string;
  ab_variant: string | null;
  event_timestamp: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  bounce_type: string | null;
  unsubscribed_at: string | null;
  error_message: string | null;
  total_rows: number;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  sent: { label: "Inviata", className: "bg-slate-100 text-slate-700" },
  delivered: { label: "Consegnata", className: "bg-sky-100 text-sky-700" },
  opened: { label: "Aperta", className: "bg-emerald-100 text-emerald-700" },
  clicked: { label: "Cliccata", className: "bg-violet-100 text-violet-700" },
  bounced: { label: "Bounce", className: "bg-red-100 text-red-700" },
  failed: { label: "Fallita", className: "bg-red-100 text-red-700" },
  unsubscribed: { label: "Disiscritto", className: "bg-amber-100 text-amber-700" },
  spam: { label: "Spam", className: "bg-red-100 text-red-700" },
};

const PER_PAGE = 50;

interface CampaignDetailDialogProps {
  campaignId: string | null;
  campaignName?: string;
  onClose: () => void;
}

export function CampaignDetailDialog({ campaignId, campaignName, onClose }: CampaignDetailDialogProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const open = Boolean(campaignId);

  const rpcBase = useMemo(() => ({
    p_company_id: companyId ?? "",
    p_campaign_id: campaignId ?? "",
    p_status: statusFilter !== "all" ? statusFilter : null,
    p_search: search || null,
  }), [companyId, campaignId, statusFilter, search]);

  // KPI: summary della sola campagna (riusa l'RPC esistente)
  const { data: kpiRaw } = useQuery({
    queryKey: ["campaign-detail-kpi", companyId, campaignId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_email_stats_summary", {
        p_company_id: companyId,
        p_campaign_id: campaignId,
        p_date_from: null,
        p_date_to: null,
      } as never);
      if (error) throw error;
      return (data as unknown as Array<Record<string, number>>)?.[0] ?? null;
    },
    staleTime: 60 * 1000,
  });

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["campaign-recipients", rpcBase, page],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_email_campaign_recipients" as never, {
        ...rpcBase,
        p_limit: PER_PAGE,
        p_offset: page * PER_PAGE,
      } as never);
      if (error) throw error;
      return (data ?? []) as RecipientRow[];
    },
  });

  const rows = pageData ?? [];
  const totalRows = rows[0]?.total_rows ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PER_PAGE));

  const kpis = useMemo(() => {
    const total = Number(kpiRaw?.total ?? 0);
    const delivered = Number(kpiRaw?.delivered ?? 0);
    const opened = Number(kpiRaw?.opened ?? 0);
    const clicked = Number(kpiRaw?.clicked ?? 0);
    const bounced = Number(kpiRaw?.bounced ?? 0);
    const unsub = Number(kpiRaw?.unsubscribed ?? 0);
    const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");
    return [
      { icon: <MailCheck className="h-4 w-4 text-sky-600" />, label: "Consegnate", value: delivered.toLocaleString("it-IT"), sub: pct(delivered, total) },
      { icon: <MailOpen className="h-4 w-4 text-emerald-600" />, label: "Aperture", value: opened.toLocaleString("it-IT"), sub: pct(opened, delivered) },
      { icon: <MousePointerClick className="h-4 w-4 text-violet-600" />, label: "Click", value: clicked.toLocaleString("it-IT"), sub: pct(clicked, delivered) },
      { icon: <MailX className="h-4 w-4 text-red-600" />, label: "Bounce", value: bounced.toLocaleString("it-IT"), sub: pct(bounced, total) },
      { icon: <UserMinus className="h-4 w-4 text-amber-600" />, label: "Disiscritti", value: unsub.toLocaleString("it-IT"), sub: pct(unsub, delivered) },
    ];
  }, [kpiRaw]);

  const fmtDate = (d: string | null) =>
    d ? format(new Date(d), "dd MMM yyyy HH:mm", { locale: it }) : "—";

  const handleExportCsv = async () => {
    if (!companyId || !campaignId) return;
    setExporting(true);
    try {
      const all: RecipientRow[] = [];
      // Pagine da 500 (cap RPC) finché ci sono righe
      for (let offset = 0; offset < 100_000; offset += 500) {
        const { data, error } = await supabase.rpc("get_email_campaign_recipients" as never, {
          ...rpcBase,
          p_limit: 500,
          p_offset: offset,
        } as never);
        if (error) throw error;
        const chunk = (data ?? []) as RecipientRow[];
        all.push(...chunk);
        if (chunk.length < 500) break;
      }
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = "Email;Nome;Stato;Inviata;Consegnata;Aperta;Cliccata;Bounce;Tipo bounce;Disiscritto;Errore";
      const lines = all.map((r) =>
        [r.email, r.full_name, STATUS_BADGE[r.status]?.label ?? r.status,
          fmtDate(r.event_timestamp), fmtDate(r.delivered_at), fmtDate(r.opened_at),
          fmtDate(r.clicked_at), fmtDate(r.bounced_at), r.bounce_type,
          fmtDate(r.unsubscribed_at), r.error_message].map(esc).join(";"),
      );
      const blob = new Blob(["﻿" + [header, ...lines].join("\n")], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campagna-destinatari-${(campaignName ?? campaignId).replace(/[^a-zA-Z0-9-_]/g, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Esportati ${all.length.toLocaleString("it-IT")} destinatari`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export non riuscito");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaignName ?? "Dettaglio campagna"}</DialogTitle>
          <DialogDescription>
            Risultati per destinatario: consegna, aperture, click, bounce e disiscrizioni.
          </DialogDescription>
        </DialogHeader>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl border border-slate-200 p-3 bg-white">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {k.icon}
                {k.label}
              </div>
              <p className="text-lg font-bold tabular-nums">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Filtri */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca email o nome…"
              className="pl-8 h-9"
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(0); }}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[170px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="delivered">Consegnate</SelectItem>
              <SelectItem value="opened">Aperte</SelectItem>
              <SelectItem value="clicked">Cliccate</SelectItem>
              <SelectItem value="bounced">Bounce</SelectItem>
              <SelectItem value="unsubscribed">Disiscritti</SelectItem>
              <SelectItem value="spam">Spam</SelectItem>
              <SelectItem value="failed">Fallite</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv} disabled={exporting || totalRows === 0}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Esporta CSV
          </Button>
        </div>

        {/* Tabella destinatari */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Nessun destinatario trovato con questi filtri.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Destinatario</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Consegnata</TableHead>
                <TableHead>Aperta</TableHead>
                <TableHead>Cliccata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const badge = STATUS_BADGE[r.status] ?? { label: r.status, className: "bg-slate-100 text-slate-700" };
                return (
                  <TableRow key={r.log_id}>
                    <TableCell>
                      <div className="font-medium">{r.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.full_name ?? ""}
                        {r.ab_variant ? ` · Variante ${r.ab_variant}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={badge.className}>{badge.label}</Badge>
                      {(r.status === "bounced" || r.status === "failed") && (r.bounce_type || r.error_message) ? (
                        <div className="text-xs text-muted-foreground mt-0.5 max-w-[180px] truncate" title={r.error_message ?? r.bounce_type ?? ""}>
                          {r.bounce_type ?? r.error_message}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(r.delivered_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(r.opened_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(r.clicked_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Paginazione */}
        {totalRows > PER_PAGE && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {totalRows.toLocaleString("it-IT")} destinatari · pagina {page + 1} di {totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Pagina precedente">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Pagina successiva">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
