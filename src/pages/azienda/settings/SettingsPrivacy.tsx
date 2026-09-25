import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const queryClient = useQueryClient();
  const [deletionReason, setDeletionReason] = useState("");

  // Consents
  const { data: consents = [] } = useQuery({
    queryKey: queryKeys.gdpr.consents,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "get_consents" },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      return data as Array<{ consent_type: string; granted: boolean; granted_at: string | null; revoked_at: string | null }>;
    },
  });

  // Requests
  const { data: requests = [] } = useQuery({
    queryKey: queryKeys.gdpr.requests,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "get_requests" },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      return data as Array<{ id: string; request_type: string; status: string; download_url: string | null; expires_at: string | null; created_at: string; reason: string | null }>;
    },
  });

  const updateConsent = useMutation({
    mutationFn: async ({ consent_type, granted }: { consent_type: string; granted: boolean }) => {
      const { error } = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "update_consent", consent_type, granted },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gdpr.consents });
      toast.success("Consenso aggiornato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestExport = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("gdpr-compliance", {
        body: { action: "request_export" },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gdpr.requests });
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
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gdpr.requests });
      setDeletionReason("");
      toast.success("Richiesta di cancellazione inviata. Un amministratore la esaminerà.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isMobile = useIsMobile();
  const consensoDi = (type: string) => consents.find((c) => c.consent_type === type);
  const getConsentValue = (type: string) => consensoDi(type)?.granted ?? false;

  /**
   * Da quando vale la scelta. È l'informazione che conta davvero oggi: il
   * consenso è un atto registrato e datato, e la data è la prova.
   */
  const dataConsenso = (type: string): string | null => {
    const c = consensoDi(type);
    const quando = c?.granted ? c.granted_at : c?.revoked_at;
    if (!quando) return null;
    const d = new Date(quando);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  };

  const hasPendingDeletion = requests.some(r => r.request_type === "deletion" && ["pending", "processing"].includes(r.status));

  return (
    <div className="space-y-6 max-sm:space-y-3">
      {/* Mobile no: il titolo è già nella testata delle impostazioni. */}
      <div className="max-sm:hidden">
        <h1 className="text-2xl font-bold">Privacy & GDPR</h1>
        <p className="text-muted-foreground">Gestisci i tuoi dati personali, consensi e richieste di privacy</p>
      </div>

      {/* Mobile: solo i consensi; esportazione, cancellazione e storico delle
          richieste si gestiscono al computer. */}
      <Tabs defaultValue="consents" className="space-y-4">
        <TabsList className="max-sm:hidden">
          <TabsTrigger value="consents" className="gap-2"><Shield className="h-4 w-4" /> Consensi</TabsTrigger>
          <TabsTrigger value="data" className="gap-2"><Download className="h-4 w-4" /> I miei dati</TabsTrigger>
          <TabsTrigger value="requests" className="gap-2"><FileCheck className="h-4 w-4" /> Storico richieste</TabsTrigger>
        </TabsList>

        {/* CONSENTS TAB */}
        <TabsContent value="consents" className="space-y-4">
          <Card>
            <CardHeader className="max-sm:p-4 max-sm:pb-2">
              <CardTitle className="text-lg max-sm:text-base">Gestione consensi</CardTitle>
              <CardDescription className="max-sm:hidden">
                Ogni scelta viene registrata con la data e resta nel registro
                accessi: è la prova di cosa hai acconsentito e da quando.
                Oggi però nessun invio la controlla da solo — se revochi un
                consenso e vuoi che abbia effetto subito, scrivilo
                all'assistenza.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-sm:space-y-2 max-sm:p-4 max-sm:pt-0">
              {CONSENT_TYPES.map((ct) => (
                <div key={ct.key} className="flex items-center justify-between p-4 border rounded-lg max-sm:gap-2 max-sm:px-3 max-sm:py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium max-sm:text-sm">{ct.label}</p>
                    <p className="text-sm text-muted-foreground max-sm:hidden">{ct.desc}</p>
                    {dataConsenso(ct.key) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {getConsentValue(ct.key) ? "Concesso il" : "Revocato il"} {dataConsenso(ct.key)}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={getConsentValue(ct.key)}
                    disabled={updateConsent.isPending}
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
                {/* Su telefono non si scarica: il diritto però resta dichiarato,
                    con dove esercitarlo. Nasconderlo e basta lo farebbe sparire. */}
                {isMobile ? (
                  <p className="text-sm text-muted-foreground">
                    Il download si fa da computer: apri questa pagina da lì e
                    trovi il pulsante per scaricare la copia dei tuoi dati.
                  </p>
                ) : (
                  <>
                    <Button onClick={() => requestExport.mutate()} disabled={requestExport.isPending} className="w-full gap-2">
                      <Download className="h-4 w-4" />
                      {requestExport.isPending ? "Preparazione export..." : "Scarica i miei dati"}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">Il link di download sarà valido per 24 ore.</p>
                  </>
                )}
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
                            disabled={requestDeletion.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {requestDeletion.isPending ? "Invio…" : "Conferma cancellazione"}
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
              {/* Su telefono la tabella a 4 colonne diventava illeggibile e
                  portava un pulsante di download: qui l'elenco è a schede e il
                  download resta al computer. */}
              {isMobile ? (
                <div className="divide-y">
                  {requests.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Nessuna richiesta</p>
                  ) : requests.map((req) => {
                    const status = STATUS_MAP[req.status] || STATUS_MAP.pending;
                    const StatusIcon = status.icon;
                    const pronto = req.request_type === "export" && req.status === "completed" && !!req.download_url;
                    return (
                      <div key={req.id} className="flex items-center justify-between gap-2 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {req.request_type === "export" ? "📦 Export" : req.request_type === "deletion" ? "🗑️ Cancellazione" : "✏️ Rettifica"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(req.created_at), "d MMM yyyy · HH:mm", { locale: it })}
                            {pronto && " · pronto da scaricare al computer"}
                          </p>
                        </div>
                        <Badge variant={status.variant} className="shrink-0 gap-1 text-[10px]">
                          <StatusIcon className="h-3 w-3" /> {status.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
