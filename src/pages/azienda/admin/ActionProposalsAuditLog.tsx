/**
 * IMPROVEMENT #20 — Action Proposals Audit Log search UI
 *
 * Pagina admin che lista le entries di action_proposals_audit_log con
 * filtri per: tipo evento, periodo, persona, user. Esportabile in CSV.
 *
 * Accesso: solo super_admin / company_admin (filtrato via RLS).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Filter, Search } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EVENT_TYPES = [
  "all",
  "created",
  "viewed",
  "edited",
  "approved",
  "rejected",
  "executed",
  "execution_failed",
  "undone",
  "expired",
  "batch_created",
] as const;

interface AuditRow {
  id: string;
  proposal_id: string;
  event_type: string;
  event_data: Record<string, unknown> | null;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export default function ActionProposalsAuditLog() {
  const companyId = useEffectiveCompanyId();
  const [eventType, setEventType] = useState<string>("all");
  const [searchProposal, setSearchProposal] = useState("");
  const [daysBack, setDaysBack] = useState<string>("7");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [
      "action-proposals-audit-log",
      companyId,
      eventType,
      daysBack,
      searchProposal,
    ],
    enabled: !!companyId,
    queryFn: async (): Promise<AuditRow[]> => {
      let q = supabase
        .from("action_proposals_audit_log")
        .select("id, proposal_id, event_type, event_data, user_id, ip_address, user_agent, created_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(500);

      if (eventType !== "all") {
        q = q.eq("event_type", eventType);
      }
      if (daysBack !== "all") {
        const days = parseInt(daysBack);
        const since = new Date(Date.now() - days * 86400000).toISOString();
        q = q.gte("created_at", since);
      }
      if (searchProposal.trim()) {
        q = q.ilike("proposal_id", `%${searchProposal.trim()}%`);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AuditRow[];
    },
    staleTime: 30 * 1000,
  });

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const r of rows) {
      byType[r.event_type] = (byType[r.event_type] || 0) + 1;
    }
    return { total: rows.length, byType };
  }, [rows]);

  const exportCSV = () => {
    const header = "timestamp,event_type,proposal_id,user_id,ip_address,event_data";
    const lines = rows.map(
      (r) =>
        `${r.created_at},${r.event_type},${r.proposal_id},${r.user_id ?? ""},${r.ip_address ?? ""},"${
          JSON.stringify(r.event_data ?? {}).replace(/"/g, '""')
        }"`,
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Audit Log Action Proposals</h1>
        <p className="text-sm text-muted-foreground">
          Storico completo creazione/modifica/approvazione/esecuzione delle proposte AI.
        </p>
      </div>

      {/* Filtri */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filtri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Tipo evento</label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Periodo</label>
              <Select value={daysBack} onValueChange={setDaysBack}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Ultime 24h</SelectItem>
                  <SelectItem value="7">Ultimi 7 giorni</SelectItem>
                  <SelectItem value="30">Ultimi 30 giorni</SelectItem>
                  <SelectItem value="90">Ultimi 90 giorni</SelectItem>
                  <SelectItem value="all">Tutti</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Cerca proposal_id</label>
              <div className="relative">
                <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchProposal}
                  onChange={(e) => setSearchProposal(e.target.value)}
                  placeholder="UUID o frammento…"
                  className="pl-8 h-9"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 text-sm">
            <span className="text-muted-foreground">
              {stats.total} risultati
              {Object.entries(stats.byType).map(([t, n]) => (
                <Badge key={t} variant="outline" className="ml-2 text-[10px]">
                  {t}: {n}
                </Badge>
              ))}
            </span>
            <Button size="sm" variant="outline" onClick={exportCSV} disabled={rows.length === 0}>
              <Download className="h-4 w-4 mr-2" /> Esporta CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabella */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Caricamento…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nessun evento per i filtri correnti.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Quando</th>
                  <th className="px-3 py-2 text-left">Evento</th>
                  <th className="px-3 py-2 text-left">Proposal</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">IP</th>
                  <th className="px-3 py-2 text-left">Dati</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {format(new Date(r.created_at), "dd MMM HH:mm:ss", { locale: it })}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">
                        {r.event_type}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.proposal_id.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.user_id ? r.user_id.slice(0, 8) + "…" : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {r.ip_address ?? "—"}
                    </td>
                    <td className="px-3 py-2 max-w-md">
                      {r.event_data ? (
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded break-all">
                          {JSON.stringify(r.event_data).slice(0, 150)}
                          {JSON.stringify(r.event_data).length > 150 ? "…" : ""}
                        </code>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
