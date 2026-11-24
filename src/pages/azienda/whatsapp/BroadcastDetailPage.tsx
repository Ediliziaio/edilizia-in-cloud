// MP-FINAL — Dettaglio broadcast con progress + recipients.

import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { AlertTriangle, Loader2, RefreshCw, XCircle } from "lucide-react";
import {
  useCancelBroadcast,
  useWABroadcast,
  useWABroadcastRecipients,
} from "@/hooks/whatsapp/useWABroadcasts";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

function statusColor(status: string | null): string {
  switch ((status ?? "").toLowerCase()) {
    case "scheduled":
      return "bg-blue-100 text-blue-800";
    case "sending":
      return "bg-amber-100 text-amber-800";
    case "completed":
      return "bg-green-100 text-green-800";
    case "cancelled":
    case "failed":
      return "bg-red-100 text-red-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function BroadcastDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { data: bc, isLoading, isError, error, refetch, isFetching } = useWABroadcast(id);
  const { data: recipients, isError: recipientsError } = useWABroadcastRecipients(id);
  const cancel = useCancelBroadcast();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center border-destructive/20 bg-destructive/5">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <h1 className="font-semibold">{t("Campagna non caricata")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {(error as Error)?.message || t("Non riesco a caricare questa campagna.")}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {t("Riprova")}
          </Button>
        </Card>
      </div>
    );
  }

  if (!bc) {
    return <div className="p-6 text-sm text-muted-foreground">{t("Campagna non trovata.")}</div>;
  }

  const total = bc.total_contacts ?? 0;
  const sent = bc.sent_count ?? 0;
  const failed = bc.failed_count ?? 0;
  const progressPct = total > 0 ? Math.round((sent / total) * 100) : 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{bc.nome ?? t("Campagna")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Template")} <code>{bc.template_name}</code>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={statusColor(bc.status)}>{bc.status}</Badge>
          {bc.status === "scheduled" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <XCircle className="mr-2 h-4 w-4" />
                  {t("Annulla")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("Annullare la campagna?")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("Impedirà l'invio ai destinatari rimanenti. Quelli già inviati restano.")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("No, mantieni")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => cancel.mutate(bc.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t("Sì, annulla")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t("Destinatari")}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{total}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t("Inviati")}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{sent}</p>
            <p className="text-xs text-muted-foreground">{progressPct}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t("Falliti")}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-red-600">{failed}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t("Risposte")}</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{bc.replied_count ?? 0}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Destinatari")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(recipients?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              {recipientsError ? t("Destinatari non caricati. Riprova aggiornando la pagina.") : t("Nessun destinatario.")}
            </p>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Telefono")}</TableHead>
                    <TableHead>{t("Stato")}</TableHead>
                    <TableHead>{t("Inviato")}</TableHead>
                    <TableHead>{t("Consegnato")}</TableHead>
                    <TableHead>{t("Letto")}</TableHead>
                    <TableHead>{t("Errore")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recipients ?? []).slice(0, 200).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{r.status ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.sent_at ? new Date(r.sent_at).toLocaleString(intlCampo()) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.delivered_at ? new Date(r.delivered_at).toLocaleString(intlCampo()) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.read_at ? new Date(r.read_at).toLocaleString(intlCampo()) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-red-600">
                        {r.error_message ? r.error_message.substring(0, 40) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(recipients?.length ?? 0) > 200 && (
                <p className="text-xs text-muted-foreground text-center py-2">{t("Mostrati primi 200 di {n}. Export CSV in arrivo.", { n: recipients?.length })}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
