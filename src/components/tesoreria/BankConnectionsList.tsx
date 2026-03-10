import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Landmark, Plus, Search, MoreVertical, RefreshCw, Unlink, Loader2, ShieldCheck, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow, differenceInDays, isPast } from "date-fns";
import { it } from "date-fns/locale";

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  authenticating: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  expired: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  pending: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  disconnected: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
};

function getExpiryInfo(expiresAt: string | null) {
  if (!expiresAt) return null;
  const expDate = new Date(expiresAt);
  if (isPast(expDate)) return { level: "expired" as const, days: 0, text: "Connessione scaduta — ricollegati" };
  const days = differenceInDays(expDate, new Date());
  if (days <= 15) return { level: "warning" as const, days, text: `Scade tra ${days} giorni` };
  return null;
}

interface Props {
  companyId: string;
  hasPendingCallback?: boolean;
}

export default function BankConnectionsList({ companyId, hasPendingCallback }: Props) {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSelectBank, setShowSelectBank] = useState(false);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInstitution, setSelectedInstitution] = useState<any>(null);
  const [showConfirmConnect, setShowConfirmConnect] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pendingRequisitionId, setPendingRequisitionId] = useState<string | null>(null);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);

  useEffect(() => {
    if (companyId) loadConnections();
  }, [companyId]);

  useEffect(() => {
    if (hasPendingCallback && connections.length > 0) {
      // Fix 9: Use ref from URL for precise correlation, fallback to status-based lookup
      const urlParams = new URLSearchParams(window.location.search);
      const ref = urlParams.get("ref");
      const pending = ref
        ? connections.find((c) => c.requisition_id === ref)
        : connections.find((c) => c.status === "authenticating");
      if (pending) {
        setPendingRequisitionId(pending.requisition_id);
        setShowCompleteDialog(true);
      }
    }
  }, [hasPendingCallback, connections]);

  async function loadConnections() {
    setLoading(true);
    const { data } = await supabase
      .from("bank_connections")
      .select("*")
      .eq("company_id", companyId)
      .neq("status", "disconnected")
      .order("created_at", { ascending: false });
    setConnections(data || []);
    setLoading(false);
  }

  async function loadInstitutions() {
    setLoadingInstitutions(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-list-institutions", {
        body: { country: "IT" },
      });
      if (error) throw error;
      setInstitutions(data?.institutions || []);
    } catch (e: any) {
      toast.error("Errore caricamento banche: " + e.message);
    }
    setLoadingInstitutions(false);
  }

  function handleOpenSelectBank() {
    setShowSelectBank(true);
    setSearchQuery("");
    if (institutions.length === 0) loadInstitutions();
  }

  function handleSelectInstitution(inst: any) {
    setSelectedInstitution(inst);
    setShowSelectBank(false);
    setShowConfirmConnect(true);
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-connect-start", {
        body: {
          institution_id: selectedInstitution.id,
          institution_name: selectedInstitution.name,
          institution_logo: selectedInstitution.logo,
          redirect_url: window.location.origin + "/azienda/tesoreria?bank_callback=1", // ref added after response
        },
      });
      if (error) throw error;
      if (data?.success) {
        setPendingRequisitionId(data.requisition_id);
        setShowConfirmConnect(false);
        window.open(data.auth_url, "_blank");
        setShowCompleteDialog(true);
        loadConnections();
      } else {
        toast.error("Errore: " + (data?.error || "Sconosciuto"));
      }
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    }
    setConnecting(false);
  }

  async function handleComplete() {
    if (!pendingRequisitionId) return;
    setCompleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-connect-complete", {
        body: { requisition_id: pendingRequisitionId },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`${data.accounts_count} conti sincronizzati`);
        setShowCompleteDialog(false);
        setPendingRequisitionId(null);
        loadConnections();
      } else {
        toast.error("Completamento fallito");
      }
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    }
    setCompleting(false);
  }

  async function handleDisconnect() {
    if (!disconnectId) return;
    try {
      const { data, error } = await supabase.functions.invoke("bank-disconnect", {
        body: { connection_id: disconnectId },
      });
      if (error) throw error;
      toast.success("Connessione disconnessa");
      loadConnections();
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    }
    setDisconnectId(null);
  }

  async function handleSyncOne(connectionId: string) {
    toast.info("Sincronizzazione in corso...");
    const { data, error } = await supabase.functions.invoke("bank-sync", {
      body: { company_id: companyId, connection_id: connectionId },
    });
    if (error) toast.error(error.message);
    else if (data?.success) {
      toast.success(`${data.accounts_synced} conti, ${data.transactions_fetched} transazioni`);
      loadConnections();
    }
  }

  const filteredInstitutions = institutions.filter((i: any) =>
    i.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Connessioni Bancarie</h2>
        <Button onClick={handleOpenSelectBank} size="sm">
          <Plus className="h-4 w-4 mr-2" /> Collega Nuova Banca
        </Button>
      </div>

      {connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-4 text-center">
          <Landmark className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Nessuna banca collegata</p>
          <Button onClick={handleOpenSelectBank}>
            <Plus className="h-4 w-4 mr-2" /> Collega la tua prima banca
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => {
            const expiry = getExpiryInfo(conn.expires_at);
            return (
              <Card key={conn.id}>
                {/* Expiry banner */}
                {expiry && (
                  <div className={`px-4 py-2 text-sm flex items-center gap-2 rounded-t-lg ${
                    expiry.level === "expired"
                      ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                  }`}>
                    {expiry.level === "expired" ? (
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 shrink-0" />
                    )}
                    <span>{expiry.text}</span>
                    {expiry.level === "expired" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto h-7 text-xs"
                        onClick={handleOpenSelectBank}
                      >
                        Ricollega
                      </Button>
                    )}
                  </div>
                )}
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    {conn.institution_logo ? (
                      <img src={conn.institution_logo} alt="" className="h-10 w-10 rounded-lg object-contain" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <Landmark className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{conn.institution_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={statusColors[conn.status] || ""} variant="secondary">
                          {conn.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {conn.accounts_count || 0} conti
                        </span>
                        {conn.last_sync_at && (
                          <span className="text-xs text-muted-foreground">
                            · Sync {formatDistanceToNow(new Date(conn.last_sync_at), { addSuffix: true, locale: it })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleSyncOne(conn.id)}>
                        <RefreshCw className="h-4 w-4 mr-2" /> Sincronizza ora
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setDisconnectId(conn.id)}>
                        <Unlink className="h-4 w-4 mr-2" /> Disconnetti
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Select Bank Dialog */}
      <Dialog open={showSelectBank} onOpenChange={setShowSelectBank}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Seleziona la tua banca</DialogTitle>
            <DialogDescription>Cerca tra le banche disponibili in Italia</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca banca..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex-1 overflow-auto space-y-1 min-h-0">
            {loadingInstitutions ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : filteredInstitutions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nessuna banca trovata</p>
            ) : (
              filteredInstitutions.map((inst: any) => (
                <button
                  key={inst.id}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
                  onClick={() => handleSelectInstitution(inst)}
                >
                  {inst.logo ? (
                    <img src={inst.logo} alt="" className="h-8 w-8 rounded object-contain" />
                  ) : (
                    <Landmark className="h-8 w-8 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium text-sm">{inst.name}</p>
                    {inst.countries && <p className="text-xs text-muted-foreground">{inst.countries?.join(", ")}</p>}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Connect Dialog */}
      <Dialog open={showConfirmConnect} onOpenChange={setShowConfirmConnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connetti a {selectedInstitution?.name}</DialogTitle>
            <DialogDescription>
              Sarai reindirizzato alla pagina di login della banca per autorizzare l'accesso.
              GoCardless accede SOLO in LETTURA al tuo conto. Non può effettuare pagamenti.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 py-2">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            <Badge variant="outline">Protetto da PSD2 · Sola lettura</Badge>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmConnect(false)}>Annulla</Button>
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Connetti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Completa l'autenticazione</DialogTitle>
            <DialogDescription>
              Completa l'autenticazione nella finestra della banca. Quando hai finito, clicca il pulsante qui sotto.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompleteDialog(false)}>Annulla</Button>
            <Button onClick={handleComplete} disabled={completing}>
              {completing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ho completato l'autenticazione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Alert */}
      <AlertDialog open={!!disconnectId} onOpenChange={() => setDisconnectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnetti banca</AlertDialogTitle>
            <AlertDialogDescription>
              I conti verranno marcati come inattivi. Le transazioni storiche saranno conservate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect}>Disconnetti</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
