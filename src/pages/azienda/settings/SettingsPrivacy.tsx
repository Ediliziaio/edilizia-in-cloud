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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Shield, Download, Trash2, FileCheck, Clock, CheckCircle, XCircle, AlertTriangle, FileText } from "lucide-react";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { messaggioErrorePersone } from "@/lib/users/erroriPersone";

/**
 * Privacy personale: consensi, copia dei propri dati, richiesta di cancellazione.
 *
 * I cinque consensi registrano una scelta con la data (è la prova di cosa si è
 * accettato e da quando) ma NESSUN invio li controlla da solo: nessun codice li
 * legge, solo `gdpr-compliance` li scrive e li rilegge. La pagina lo dice, invece
 * di lasciar credere che un interruttore spento fermi gli invii. Se i consensi
 * devono comandare qualcosa, o se la privacy personale deve stare in «Il mio
 * profilo», lo decide Florin (D6).
 */
const CONSENT_TYPES = [
  { key: "marketing_email", label: "Email marketing", desc: "Acconsento a ricevere comunicazioni commerciali via email" },
  { key: "marketing_sms", label: "SMS marketing", desc: "Acconsento a ricevere comunicazioni commerciali via SMS" },
  { key: "analytics", label: "Analisi di utilizzo", desc: "Acconsento alla raccolta di dati anonimi sull'utilizzo della piattaforma" },
  { key: "third_party", label: "Condivisione con terzi", desc: "Acconsento alla condivisione dei miei dati con partner selezionati" },
  { key: "profiling", label: "Profilazione", desc: "Acconsento all'uso dei miei dati per personalizzare i contenuti" },
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  pending: { label: "In attesa", variant: "secondary", icon: Clock },
  processing: { label: "In elaborazione", variant: "outline", icon: Clock },
  completed: { label: "Completata", variant: "default", icon: CheckCircle },
  rejected: { label: "Rifiutata", variant: "destructive", icon: XCircle },
  expired: { label: "Scaduta", variant: "secondary", icon: AlertTriangle },
};

/** Che tipo di richiesta è. Le richieste di rettifica non le crea nessuna schermata: se ne arrivasse una vecchia, «Altra richiesta». */
function tipoRichiesta(tipo: string): { nome: string; icona: typeof Download } {
  if (tipo === "export") return { nome: "Copia dei dati", icona: Download };
  if (tipo === "deletion") return { nome: "Cancellazione", icona: Trash2 };
  return { nome: "Altra richiesta", icona: FileText };
}

/** Chiama gdpr-compliance; se risponde male, l'errore porta il motivo vero (sta nel corpo della risposta). */
async function chiamaGdpr<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gdpr-compliance", { body });
  if (error) throw new Error(await edgeErrorMessage(error, ""));
  return data as T;
}

export default function SettingsPrivacy() {
  const queryClient = useQueryClient();
  const [deletionReason, setDeletionReason] = useState("");

  // Consents
  const { data: consents = [], isLoading: consentsLoading, isError: consentsError, refetch: reloadConsents } = useQuery({
    queryKey: queryKeys.gdpr.consents,
    queryFn: () =>
      chiamaGdpr<Array<{ consent_type: string; granted: boolean; granted_at: string | null; revoked_at: string | null }>>({ action: "get_consents" }),
  });

  // Requests
  const { data: requests = [], isLoading: requestsLoading, isError: requestsError, refetch: reloadRequests } = useQuery({
    queryKey: queryKeys.gdpr.requests,
    queryFn: () =>
      chiamaGdpr<Array<{ id: string; request_type: string; status: string; download_url: string | null; expires_at: string | null; created_at: string; reason: string | null }>>({ action: "get_requests" }),
  });

  const updateConsent = useMutation({
    mutationFn: ({ consent_type, granted }: { consent_type: string; granted: boolean }) =>
      chiamaGdpr({ action: "update_consent", consent_type, granted }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gdpr.consents });
      toast.success("Consenso registrato");
    },
    onError: (e: Error) => toast.error(messaggioErrorePersone(e, "Non sono riuscito a registrare il consenso. Riprova tra un attimo.")),
  });

  const requestExport = useMutation({
    mutationFn: () => chiamaGdpr<{ download_url?: string }>({ action: "request_export" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gdpr.requests });
      if (data?.download_url) {
        // Se il browser blocca la nuova scheda (il file è arrivato dopo qualche
        // secondo) il file resta nello «Storico richieste», valido 24 ore.
        const finestra = window.open(data.download_url, "_blank");
        if (finestra) {
          toast.success("File pronto: il download parte da solo");
        } else {
          toast.success("File pronto", { description: "Il browser ha bloccato il download: lo trovi in «Storico richieste», con il pulsante «Scarica»." });
        }
      } else {
        toast.success("Richiesta inviata");
      }
    },
    onError: (e: Error) => toast.error(messaggioErrorePersone(e, "Non sono riuscito a preparare il file. Riprova tra un attimo.")),
  });

  const requestDeletion = useMutation({
    mutationFn: () => chiamaGdpr({ action: "request_deletion", reason: deletionReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gdpr.requests });
      setDeletionReason("");
      // La richiesta la tratta oggi solo la schermata dell'assistenza (super admin):
      // un amministratore d'azienda non ha dove vederla.
      toast.success("Richiesta inviata. La esamina l'assistenza di Edilizia in Cloud.");
    },
    onError: (e: Error) => toast.error(messaggioErrorePersone(e, "Non sono riuscito a inviare la richiesta. Riprova tra un attimo.")),
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
        <h2 className="text-2xl font-bold">Privacy e consensi</h2>
        <p className="text-muted-foreground">I tuoi dati personali, i consensi che hai dato e le richieste di privacy.</p>
      </div>

      {/* Mobile: solo i consensi; esportazione, cancellazione e storico delle
          richieste si gestiscono al computer. */}
      <Tabs defaultValue="consents" className="space-y-4">
        <TabsList className="max-sm:hidden">
          <TabsTrigger value="consents" className="gap-2"><Shield className="h-4 w-4" aria-hidden="true" /> Consensi</TabsTrigger>
          <TabsTrigger value="data" className="gap-2"><Download className="h-4 w-4" aria-hidden="true" /> I miei dati</TabsTrigger>
          <TabsTrigger value="requests" className="gap-2"><FileCheck className="h-4 w-4" aria-hidden="true" /> Storico richieste</TabsTrigger>
        </TabsList>

        {/* CONSENTS TAB */}
        <TabsContent value="consents" className="space-y-4">
          <Card>
            <CardHeader className="max-sm:p-4 max-sm:pb-2">
              <CardTitle className="text-lg max-sm:text-base">Consensi</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Qui si registra cosa hai accettato e da quando: ogni scelta resta
                con la sua data, ed è la prova. Per ora non comanda nessun invio:
                se revochi un consenso e vuoi che abbia effetto subito, scrivilo
                all'assistenza.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-sm:space-y-2 max-sm:p-4 max-sm:pt-0">
              {consentsError && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-2">Non riesco a leggere i consensi. Non sono stati modificati.<Button size="sm" variant="outline" onClick={() => reloadConsents()}>Riprova</Button></AlertDescription></Alert>}
              {consentsLoading && <p role="status" className="text-sm text-muted-foreground">Caricamento dei consensi…</p>}
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
                    aria-label={ct.label}
                    checked={getConsentValue(ct.key)}
                    disabled={updateConsent.isPending || consentsLoading || consentsError}
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
                  <Download className="h-5 w-5 text-primary" aria-hidden="true" /> Scarica i tuoi dati
                </CardTitle>
                <CardDescription>
                  Una copia dei tuoi dati personali in formato JSON (Art. 20 GDPR — portabilità dei dati): il tuo
                  profilo, la tua attività e i tuoi consensi. Gli amministratori con il permesso «Esporta Clienti»
                  trovano nel file anche commesse, contatti e appuntamenti dell'azienda.
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
                      <Download className="h-4 w-4" aria-hidden="true" />
                      {requestExport.isPending ? "Preparazione del file…" : "Scarica i miei dati"}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">Il link per scaricare vale 24 ore.</p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Deletion */}
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" aria-hidden="true" /> Cancella il tuo account
                </CardTitle>
                <CardDescription>
                  Chiedi la cancellazione del tuo account (Art. 17 GDPR — diritto all'oblio). La richiesta la esamina
                  l'assistenza di Edilizia in Cloud. Se viene approvata, il tuo accesso viene cancellato e il tuo
                  profilo anonimizzato: non si torna indietro.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {hasPendingDeletion ? (
                  <div className="p-3 bg-destructive/10 rounded-lg text-sm text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Hai già una richiesta di cancellazione in corso.
                  </div>
                ) : (
                  <>
                    <div>
                      <Label htmlFor="motivo-cancellazione">Motivo (facoltativo)</Label>
                      <Textarea
                        id="motivo-cancellazione"
                        value={deletionReason}
                        onChange={(e) => setDeletionReason(e.target.value)}
                        placeholder="Se vuoi, scrivi il motivo della richiesta…"
                        className="mt-1"
                        rows={2}
                      />
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full gap-2">
                          <Trash2 className="h-4 w-4" aria-hidden="true" /> Chiedi la cancellazione
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confermi la richiesta di cancellazione?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Se l'assistenza la approva, il tuo accesso viene cancellato e il tuo profilo anonimizzato
                            (nome, cognome, telefono e foto vengono tolti). <strong>Non si può annullare.</strong>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => requestDeletion.mutate()}
                            disabled={requestDeletion.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {requestDeletion.isPending ? "Invio…" : "Sì, chiedi la cancellazione"}
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
              <CardDescription>Le richieste di privacy che hai inviato</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {requestsError && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-2">Non riesco a leggere lo storico.<Button size="sm" variant="outline" onClick={() => reloadRequests()}>Riprova</Button></AlertDescription></Alert>}
              {requestsLoading && <p role="status" className="p-4 text-sm text-muted-foreground">Caricamento delle richieste…</p>}
              {/* Su telefono la tabella a 4 colonne diventava illeggibile e
                  portava un pulsante di download: qui l'elenco è a schede e il
                  download resta al computer. */}
              {!requestsLoading && !requestsError && (isMobile ? (
                <div className="divide-y">
                  {requests.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Nessuna richiesta</p>
                  ) : requests.map((req) => {
                    const status = STATUS_MAP[req.status] || STATUS_MAP.pending;
                    const StatusIcon = status.icon;
                    const tipo = tipoRichiesta(req.request_type);
                    const pronto = req.request_type === "export" && req.status === "completed" && !!req.download_url;
                    return (
                      <div key={req.id} className="flex items-center justify-between gap-2 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{tipo.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(req.created_at), "d MMM yyyy · HH:mm", { locale: it })}
                            {pronto && " · pronto da scaricare al computer"}
                          </p>
                        </div>
                        <Badge variant={status.variant} className="shrink-0 gap-1 text-[10px]">
                          <StatusIcon className="h-3 w-3" aria-hidden="true" /> {status.label}
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
                    <TableHead><span className="sr-only">Azioni</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nessuna richiesta</TableCell></TableRow>
                  ) : requests.map((req) => {
                    const status = STATUS_MAP[req.status] || STATUS_MAP.pending;
                    const StatusIcon = status.icon;
                    const tipo = tipoRichiesta(req.request_type);
                    const TipoIcona = tipo.icona;
                    const dataRichiesta = format(new Date(req.created_at), "dd MMM yyyy HH:mm", { locale: it });
                    return (
                      <TableRow key={req.id}>
                        <TableCell>
                          <Badge variant="outline" className="gap-1">
                            <TipoIcona className="h-3 w-3" aria-hidden="true" /> {tipo.nome}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="gap-1">
                            <StatusIcon className="h-3 w-3" aria-hidden="true" /> {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {dataRichiesta}
                        </TableCell>
                        <TableCell>
                          {req.request_type === "export" && req.status === "completed" && req.download_url && (
                            <Button size="sm" variant="outline" className="gap-1" aria-label={`Scarica la copia dei dati richiesta il ${dataRichiesta}`} onClick={() => window.open(req.download_url!, "_blank")}>
                              <Download className="h-3 w-3" aria-hidden="true" /> Scarica
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
