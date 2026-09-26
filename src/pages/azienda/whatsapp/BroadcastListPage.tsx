// MP-FINAL — Lista campagne broadcast.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Eye } from "lucide-react";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { useWABroadcasts } from "@/hooks/whatsapp/useWABroadcasts";
import { useWhatsAppBase } from "./useWhatsAppBase";

function statusColor(status: string | null): string {
  switch ((status ?? "").toLowerCase()) {
    case "scheduled":
      return "bg-blue-100 text-blue-800";
    case "sending":
      return "bg-amber-100 text-amber-800";
    case "completed":
      return "bg-green-100 text-green-800";
    case "cancelled":
      return "bg-red-100 text-red-800";
    case "failed":
      return "bg-red-100 text-red-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** nelHub: dentro la scheda «Broadcast» dell'hub WhatsApp (che c'è solo da 768). */
export default function BroadcastListPage({ nelHub = false }: { nelHub?: boolean }) {
  const { base: waBase } = useWhatsAppBase();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { data: broadcasts, isLoading, isError, error, refetch, isFetching } = useWABroadcasts(
    statusFilter === "all" ? undefined : { status: statusFilter },
  );

  const filteredBroadcasts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return broadcasts ?? [];
    return (broadcasts ?? []).filter((b) =>
      [b.nome, b.template_name, b.status].some((value) => (value ?? "").toLowerCase().includes(q)),
    );
  }, [broadcasts, search]);

  const bottoneNuova = (
    <Button asChild aria-label="Nuova campagna broadcast">
      <Link to={`${waBase}/broadcast/nuovo`}>
        <Plus className="mr-2 h-4 w-4" />
        Nuova campagna
      </Link>
    </Button>
  );

  return (
    // Da 768 niente p-6: il margine lo dà già il layout (o l'hub).
    <div className="space-y-6 p-4 md:p-0">
      {/* Nell'hub titolo, frase («template Meta APPROVED») e il secondo titolo
          «Campagne» ripetevano la scheda: resta una riga con ricerca, stato e
          «Nuova campagna». */}
      {!nelHub && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Broadcast WhatsApp</h1>
            <p className="text-sm text-muted-foreground">
              Campagne inviate o schedulate. Richiede template Meta APPROVED + numero con scopo marketing.
            </p>
          </div>
          {bottoneNuova}
        </div>
      )}

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          {!nelHub && <CardTitle>Campagne</CardTitle>}
          <div className={`flex flex-col gap-2 sm:flex-row ${nelHub ? "sm:flex-1 sm:items-center" : ""}`}>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Cerca campagna..." />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="scheduled">Schedulate</SelectItem>
                <SelectItem value="sending">In invio</SelectItem>
                <SelectItem value="completed">Completate</SelectItem>
                <SelectItem value="failed">Fallite</SelectItem>
                <SelectItem value="cancelled">Annullate</SelectItem>
              </SelectContent>
            </Select>
            {nelHub && <div className="sm:ml-auto">{bottoneNuova}</div>}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-12" aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="sr-only">Caricamento campagne</span>
            </div>
          )}
          {!isLoading && isError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
              <p className="font-medium">Campagne non caricate</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {(error as Error)?.message || "Errore nel caricamento dei broadcast WhatsApp."}
              </p>
              <Button className="mt-4" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Riprova
              </Button>
            </div>
          )}
          {!isLoading && !isError && (broadcasts?.length ?? 0) === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nessuna campagna. Crea la prima con "Nuova campagna".
            </div>
          )}
          {!isLoading && !isError && broadcasts && broadcasts.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Schedulata</TableHead>
                    <TableHead>Destinatari</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Dettaglio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBroadcasts.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.nome ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {b.template_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {b.scheduled_at
                          ? new Date(b.scheduled_at).toLocaleString("it-IT")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {(b.sent_count ?? 0)} / {(b.total_contacts ?? 0)}
                        {(b.failed_count ?? 0) > 0 && (
                          <span className="text-red-600 text-xs ml-2">
                            · {b.failed_count} falliti
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColor(b.status)}>
                          {b.status ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          aria-label={`Dettaglio campagna ${b.nome}`}
                        >
                          <Link to={`${waBase}/broadcast/${b.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredBroadcasts.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nessuna campagna corrisponde ai filtri.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
