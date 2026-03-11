import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Shield, Download, Trash2, FileCheck, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

const CONSENT_TYPES = [
  { key: "marketing_email", label: "Email marketing", desc: "Ricevi comunicazioni commerciali via email" },
  { key: "marketing_sms", label: "SMS marketing", desc: "Ricevi comunicazioni commerciali via SMS" },
  { key: "analytics", label: "Analisi utilizzo", desc: "Consenti la raccolta di dati anonimi sull'utilizzo della piattaforma" },
  { key: "third_party", label: "Condivisione con terzi", desc: "Consenti la condivisione dei dati con partner selezionati" },
  { key: "profiling", label: "Profilazione", desc: "Consenti l'utilizzo dei tuoi dati per personalizzare i contenuti" },
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  pending: { label: "In attesa", variant: "secondary", icon: Clock },
  processing: { label: "In elaborazione", variant: "outline", icon: Clock },
  completed: { label: "Completata", variant: "default", icon: CheckCircle },
  rejected: { label: "Rifiutata", variant: "destructive", icon: XCircle },
  expired: { label: "Scaduta", variant: "secondary", icon: AlertTriangle },
};

export default function SettingsPrivacy() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deletionReason, setDeletionReason] = useState("");

  // Consents
  const { data: consents = [] } = useQuery({
    queryKey: ["gdpr-consents"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "get_consents" },
      });
      if (error) throw error;
      return data as Array<{ consent_type: string; granted: boolean; granted_at: string | null; revoked_at: string | null }>;
    },
  });

  // Requests
  const { data: requests = [] } = useQuery({
    queryKey: ["gdpr-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "get_requests" },
      });
      if (error) throw error;
      return data as Array<{ id: string; request_type: string; status: string; download_url: string | null; expires_at: string | null; created_at: string; reason: string | null }>;
    },
  });

  const updateConsent = useMutation({
    mutationFn: async ({ consent_type, granted }: { consent_type: string; granted: boolean }) => {
      const { error } = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "update_consent", consent_type, granted },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gdpr-consents"] });
      toast.success("Consenso aggiornato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestExport = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "request_export" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["gdpr-requests"] });
      if (data?.download_url) {
        window.open(data.download_url, "_blank");
        toast.success("Export completato — download avviato");
      } else {
        toast.success("Richiesta di export inviata");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestDeletion = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "request_deletion", reason: deletionReason },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gdpr-requests"] });
      setDeletionReason("");
      toast.success("Richiesta di cancellazione inviata. Un amministratore la esaminerà.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const getConsentValue = (type: string) => consents.find(c => c.consent_type === type)?.granted ?? false;

  const hasPendingDeletion = requests.some(r => r.request_type === "deletion" && ["pending", "processing"].includes(r.status));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Privacy & GDPR</h1>
        <p className="text-muted-foreground">Gestisci i tuoi dati personali, consensi e richieste di privacy</p>
      </div>

      <Tabs defaultValue="consents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="consents" className="gap-2"><Shield className="h-4 w-4" /> Consensi</TabsTrigger>
          <TabsTrigger value="data" className="gap-2"><Download className="h-4 w-4" /> I miei dati</TabsTrigger>
          <TabsTrigger value="requests" className="gap-2"><FileCheck className="h-4 w-4" /> Storico richieste</TabsTrigger>
        </TabsList>

        {/* CONSENTS TAB */}
        <TabsContent value="consents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Gestione consensi</CardTitle>
              <CardDescription>Controlla come vengono utilizzati i tuoi dati. Puoi modificare i tuoi consensi in qualsiasi momento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {CONSENT_TYPES.map((ct) => (
                <div key={ct.key} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{ct.label}</p>
                    <p className="text-sm text-muted-foreground">{ct.desc}</p>
                  </div>
                  <Switch
                    checked={getConsentValue(ct.key)}
                    onCheckedChange={(granted) => updateConsent.mutate({ consent_type: ct.key, granted })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* DATA TAB */}
        <TabsContent value="data" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Export */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" /> Esporta i tuoi dati
                </CardTitle>
                <CardDescription>
                  Scarica una copia completa di tutti i tuoi dati personali in formato JSON (Art. 20 GDPR — Portabilità dei dati).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => requestExport.mutate()} disabled={requestExport.isPending} className="w-full gap-2">
                  <Download className="h-4 w-4" />
                  {requestExport.isPending ? "Preparazione export..." : "Scarica i miei dati"}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">Il link di download sarà valido per 24 ore.</p>
              </CardContent>
            </Card>

            {/* Deletion */}
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" /> Cancella il tuo account
                </CardTitle>
                <CardDescription>
                  Richiedi la cancellazione definitiva dei tuoi dati personali (Art. 17 GDPR — Diritto all'oblio). L'operazione è irreversibile.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {hasPendingDeletion ? (
                  <div className="p-3 bg-destructive/10 rounded-lg text-sm text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Hai già una richiesta di cancellazione in corso.
                  </div>
                ) : (
                  <>
                    <div>
                      <Label>Motivo (opzionale)</Label>
                      <Textarea
                        value={deletionReason}
                        onChange={(e) => setDeletionReason(e.target.value)}
                        placeholder="Indica il motivo della richiesta..."
                        className="mt-1"
                        rows={2}
                      />
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full gap-2">
                          <Trash2 className="h-4 w-4" /> Richiedi cancellazione
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confermi la richiesta di cancellazione?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Questa azione è <strong>irreversibile</strong>. Un amministratore esaminerà la richiesta e, una volta approvata, tutti i tuoi dati personali verranno eliminati definitivamente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => requestDeletion.mutate()}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Conferma cancellazione
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* REQUESTS HISTORY TAB */}
        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Storico richieste</CardTitle>
              <CardDescription>Tutte le richieste GDPR inviate</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Data richiesta</TableHead>
                    <TableHead>Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nessuna richiesta</TableCell></TableRow>
                  ) : requests.map((req) => {
                    const status = STATUS_MAP[req.status] || STATUS_MAP.pending;
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={req.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {req.request_type === "export" ? "📦 Export" : req.request_type === "deletion" ? "🗑️ Cancellazione" : "✏️ Rettifica"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="gap-1">
                            <StatusIcon className="h-3 w-3" /> {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(req.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                        </TableCell>
                        <TableCell>
                          {req.request_type === "export" && req.status === "completed" && req.download_url && (
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => window.open(req.download_url!, "_blank")}>
                              <Download className="h-3 w-3" /> Scarica
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
