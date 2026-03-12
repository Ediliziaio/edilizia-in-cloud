import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, RefreshCw, Mail, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-destructive/10 text-destructive",
  bounced: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  opened: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

export function EmailDeliveryLog() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: logs, isLoading, error, refetch } = useQuery({
    queryKey: ["email-delivery-log", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("email_delivery_log")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
    retry: 2,
  });

  const filtered = (logs ?? []).filter(
    (l: any) =>
      search === "" ||
      l.recipient?.toLowerCase().includes(search.toLowerCase()) ||
      l.subject?.toLowerCase().includes(search.toLowerCase()) ||
      l.template_type?.toLowerCase().includes(search.toLowerCase())
  );

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center gap-2">
          Errore nel caricamento: {(error as Error).message}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> Log Invii Email
            </CardTitle>
            <CardDescription>
              Storico degli invii email della piattaforma
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Aggiorna
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca destinatario, oggetto, template..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="sent">Inviato</SelectItem>
              <SelectItem value="delivered">Consegnato</SelectItem>
              <SelectItem value="failed">Fallito</SelectItem>
              <SelectItem value="bounced">Rimbalzato</SelectItem>
              <SelectItem value="opened">Aperto</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Mail className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Nessun log di invio email trovato</p>
            <p className="text-xs mt-1">
              I log appariranno quando la piattaforma invierà email.
            </p>
          </div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Oggetto</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(log.sent_at), "dd MMM HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell className="font-mono text-sm max-w-[200px] truncate">
                      {log.recipient}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {log.subject || "—"}
                    </TableCell>
                    <TableCell>
                      {log.template_type ? (
                        <Badge variant="outline" className="text-xs">
                          {log.template_type}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.provider || "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[log.status] || "bg-muted text-muted-foreground"}`}>
                        {log.status}
                      </span>
                      {log.error_message && (
                        <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={log.error_message}>
                          {log.error_message}
                        </p>
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
  );
}
