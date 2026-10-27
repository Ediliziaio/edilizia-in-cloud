import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
interface Status { configured: boolean; vat_number: string | null }
export function ItalaPlatformConnection({ companyId, connected, hasDirect }: { companyId?: string; connected: boolean; hasDirect: boolean }) {
  const cache = useQueryClient();
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ["itala-platform", companyId], enabled: !!companyId, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("billing-connect", { body: { action: "itala_platform_status", company_id: companyId } });
      if (error || data?.error) throw new Error(data?.error || "Collegamento non disponibile. Contatta l'assistenza.");
      return data as Status;
    } });
  const connect = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-connect", { body: { action: "connect_platform_itala", company_id: companyId, consent_provider: true } });
      if (error) {
        const response = (error as { context?: Response }).context;
        const details = response instanceof Response ? await response.clone().json().catch(() => null) : null;
        throw new Error(details?.error || "Collegamento non riuscito.");
      }
      if (data?.error) throw new Error(data.error);
      await cache.invalidateQueries({ queryKey: ["billing_integrations"] });
      toast.success("Recupero fatture collegato", { description: hasDirect ? "Il tuo programma resta il collegamento principale." : "Puoi recuperare lo storico e importare le fatture disponibili." });
      setConfirm(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Collegamento non riuscito."); }
    finally { setBusy(false); }
  };
  return <Card>
    <CardHeader><CardTitle className="text-base">Recupero fatture con Edilizia in Cloud</CardTitle><CardDescription>
      Se il tuo programma permette il collegamento diretto, collega prima quello. In alternativa recupera le fatture tramite il servizio ITALA collegato a Edilizia in Cloud.
    </CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {status.isLoading ? <Skeleton className="h-12 w-full" /> : <>
        <p className="text-sm">Partita IVA dall'anagrafica aziendale: <strong>{status.data?.vat_number || "da completare nell'anagrafica"}</strong></p>
        {status.error && <Alert variant="destructive"><AlertDescription>{status.error.message}</AlertDescription></Alert>}
        {status.data && !status.data.configured && <p className="text-sm text-muted-foreground">Il servizio è in preparazione. Puoi già collegare il tuo programma.</p>}
        {connected ? <p className="text-sm text-emerald-700">ITALA collegato. Per lo storico apri «Recupera da AdE».</p> : <Button disabled={!status.data?.configured || !status.data.vat_number || busy} onClick={() => setConfirm(true)}><Link2 className="h-4 w-4 mr-2" />Collega il recupero fatture</Button>}
        {hasDirect && <p className="text-sm text-muted-foreground">Il programma già collegato resta la fonte principale. I documenti già presenti vengono riconosciuti durante l'importazione.</p>}
      </>}
      <AlertDialog open={confirm} onOpenChange={v => { if (!busy) setConfirm(v); }}><AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Collega la partita IVA {status.data?.vat_number}</AlertDialogTitle><AlertDialogDescription>
          Edilizia in Cloud trasmetterà ragione sociale, partita IVA e codice fiscale dell'anagrafica aziendale a Itala Tecnologia Informatica S.r.l. per attivare il collegamento. Le credenziali del servizio restano sul server. Per recuperare lo storico dovrai abilitare ITALA in Fatture e Corrispettivi e firmare la richiesta; gli eventuali crediti verranno mostrati prima della conferma.
        </AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void connect(); }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Conferma collegamento</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent></AlertDialog>
    </CardContent>
  </Card>;
}
