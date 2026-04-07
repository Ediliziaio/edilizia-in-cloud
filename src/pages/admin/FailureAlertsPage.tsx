import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFailureAlerts, type FailureAlert } from "@/hooks/superadmin/useFailureAlerts";

/** Mappa il tipo di alert sul colore del badge */
const ALERT_TYPE_CONFIG: Record<
  FailureAlert["alert_type"],
  { label: string; className: string }
> = {
  payment_failure: {
    label: "Pagamento",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  email_failure: {
    label: "Email",
    className: "bg-orange-100 text-orange-700 border-orange-200",
  },
  sync_failure: {
    label: "Sync",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  api_failure: {
    label: "API",
    className: "bg-purple-100 text-purple-700 border-purple-200",
  },
};

/** Dialog di conferma per risolvere un alert */
interface ResolveDialogProps {
  alert: FailureAlert | null;
  onClose: () => void;
  onConfirm: (id: string, note: string) => void;
  isLoading: boolean;
}

function ResolveDialog({ alert, onClose, onConfirm, isLoading }: ResolveDialogProps) {
  const [note, setNote] = useState("");

  const handleConfirm = () => {
    if (!alert) return;
    onConfirm(alert.id, note);
    setNote("");
  };

  return (
    <Dialog open={!!alert} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Segna alert come risolto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {alert && (
            <p className="text-sm text-muted-foreground">
              Stai per segnare come risolto l&apos;alert{" "}
              <span className="font-medium text-foreground">
                {ALERT_TYPE_CONFIG[alert.alert_type].label}
              </span>{" "}
              per l&apos;azienda{" "}
              <span className="font-medium text-foreground">
                {alert.company_name ?? alert.company_id}
              </span>
              .
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="resolve-note">Nota (opzionale)</Label>
            <Textarea
              id="resolve-note"
              placeholder="Descrivi come è stato risolto il problema..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Annulla
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Salvataggio..." : "Conferma risoluzione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Righe skeleton durante il caricamento */
function TableSkeleton() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-8 w-28" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

/** Pagina completa per la gestione degli alert di failure */
export default function FailureAlertsPage() {
  const navigate = useNavigate();
  const [onlyUnresolved, setOnlyUnresolved] = useState(true);
  const [alertToResolve, setAlertToResolve] = useState<FailureAlert | null>(null);

  const { data: alerts, isLoading, error, resolveAlert } = useFailureAlerts(onlyUnresolved);

  // Conteggio alert non risolti per il badge nell'header
  const unresolvedCount = alerts?.filter((a) => a.resolved_at === null).length ?? 0;

  const handleResolve = (id: string, note: string) => {
    resolveAlert.mutate(
      { id, note: note || undefined },
      {
        onSuccess: () => setAlertToResolve(null),
      }
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-red-500" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">Alert Failure</h1>
              {unresolvedCount > 0 && (
                <Badge className="bg-red-500 text-white hover:bg-red-600">
                  {unresolvedCount}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Monitoraggio degli errori e failure di sistema
            </p>
          </div>
        </div>

        {/* Toggle mostra solo non risolti */}
        <div className="flex items-center gap-2">
          <Label htmlFor="toggle-unresolved" className="text-sm">
            Solo non risolti
          </Label>
          <Switch
            id="toggle-unresolved"
            checked={onlyUnresolved}
            onCheckedChange={setOnlyUnresolved}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {onlyUnresolved ? "Alert non risolti" : "Tutti gli alert"}
            {!isLoading && alerts && (
              <span className="ml-2 text-muted-foreground font-normal text-sm">
                ({alerts.length} record)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <p className="text-sm text-destructive p-6">
              Errore nel caricamento: {(error as Error).message}
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Azienda</TableHead>
                <TableHead>Tipo alert</TableHead>
                <TableHead>Failure</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableSkeleton />}

              {!isLoading && !error && alerts?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    Nessun alert attivo
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                !error &&
                alerts?.map((alert) => {
                  const typeConfig = ALERT_TYPE_CONFIG[alert.alert_type];
                  const isResolved = alert.resolved_at !== null;

                  return (
                    <TableRow key={alert.id}>
                      {/* Azienda con link alla scheda */}
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/aziende/${alert.company_id}`)}
                          className="flex items-center gap-1 text-sm font-medium hover:underline text-left"
                        >
                          {alert.company_name ?? (
                            <span className="font-mono text-xs">
                              …{alert.company_id.slice(-8)}
                            </span>
                          )}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </TableCell>

                      {/* Tipo alert */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${typeConfig.className}`}
                        >
                          {typeConfig.label}
                        </Badge>
                      </TableCell>

                      {/* Contatore failure */}
                      <TableCell>
                        <span className="font-mono font-bold text-sm">
                          {alert.failure_count}
                        </span>
                      </TableCell>

                      {/* Data */}
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(alert.alert_sent_at), "d MMM yyyy HH:mm", {
                          locale: it,
                        })}
                      </TableCell>

                      {/* Stato */}
                      <TableCell>
                        {isResolved ? (
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1 w-fit"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Risolto
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-red-50 text-red-700 border-red-200 flex items-center gap-1 w-fit"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Aperto
                          </Badge>
                        )}
                      </TableCell>

                      {/* Azioni */}
                      <TableCell>
                        {!isResolved && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAlertToResolve(alert)}
                          >
                            Segna come risolto
                          </Button>
                        )}
                        {isResolved && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog di conferma risoluzione */}
      <ResolveDialog
        alert={alertToResolve}
        onClose={() => setAlertToResolve(null)}
        onConfirm={handleResolve}
        isLoading={resolveAlert.isPending}
      />
    </div>
  );
}
