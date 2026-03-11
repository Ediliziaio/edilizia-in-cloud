import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Shield, CheckCircle, XCircle, Clock, AlertTriangle, FileText } from "lucide-react";

export default function AdminGDPR() {
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["admin-gdpr-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "admin_get_requests" },
      });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ["gdpr-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "get_audit_log" },
      });
      if (error) throw error;
      return data as any[];
    },
  });

  const processDeletion = useMutation({
    mutationFn: async ({ request_id, approve }: { request_id: string; approve: boolean }) => {
      const { error } = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "process_deletion", request_id, approve },
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-gdpr-requests"] });
      queryClient.invalidateQueries({ queryKey: ["gdpr-audit-log"] });
      toast.success(vars.approve ? "Richiesta approvata — account cancellato" : "Richiesta rifiutata");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingDeletions = requests.filter(r => r.request_type === "deletion" && r.status === "pending");

  const ACTION_LABELS: Record<string, string> = {
    data_export_completed: "Export dati completato",
    deletion_requested: "Cancellazione richiesta",
    deletion_completed: "Account cancellato",
    deletion_rejected: "Cancellazione rifiutata",
    consent_granted: "Consenso concesso",
    consent_revoked: "Consenso revocato",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">GDPR & Compliance</h1>
        <p className="text-muted-foreground">Gestisci le richieste di privacy e monitora la conformità GDPR</p>
      </div>

      {pendingDeletions.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm">
              <strong>{pendingDeletions.length}</strong> richiest{pendingDeletions.length === 1 ? "a" : "e"} di cancellazione in attesa di approvazione.
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="requests" className="space-y-4">
        <TabsList>
          <TabsTrigger value="requests" className="gap-2"><Shield className="h-4 w-4" /> Richieste</TabsTrigger>
          <TabsTrigger value="audit" className="gap-2"><FileText className="h-4 w-4" /> Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Richieste GDPR</CardTitle>
              <CardDescription>{requests.length} richiest{requests.length === 1 ? "a" : "e"} totali</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="w-40">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Caricamento...</TableCell></TableRow>
                  ) : requests.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nessuna richiesta</TableCell></TableRow>
                  ) : requests.map((req: any) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">
                        {req.profiles?.first_name} {req.profiles?.last_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {req.request_type === "export" ? "📦 Export" : "🗑️ Cancellazione"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={req.status === "completed" ? "default" : req.status === "rejected" ? "destructive" : "secondary"}>
                          {req.status === "pending" ? "In attesa" : req.status === "processing" ? "In elaborazione" : req.status === "completed" ? "Completata" : "Rifiutata"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(req.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {req.reason || "—"}
                      </TableCell>
                      <TableCell>
                        {req.request_type === "deletion" && req.status === "pending" && (
                          <div className="flex gap-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="default" className="gap-1 h-7 text-xs">
                                  <CheckCircle className="h-3 w-3" /> Approva
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Approvare la cancellazione?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    L'account dell'utente verrà eliminato definitivamente. Questa azione è irreversibile.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => processDeletion.mutate({ request_id: req.id, approve: true })} className="bg-destructive text-destructive-foreground">
                                    Elimina account
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => processDeletion.mutate({ request_id: req.id, approve: false })}>
                              <XCircle className="h-3 w-3" /> Rifiuta
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registro GDPR</CardTitle>
              <CardDescription>Log immutabile di tutte le azioni relative alla privacy</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Azione</TableHead>
                    <TableHead>Dettagli</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nessuna voce nel registro</TableCell></TableRow>
                  ) : auditLog.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="outline">{ACTION_LABELS[log.action] || log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.details?.consent_type || log.details?.request_id?.substring(0, 8) || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(log.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
