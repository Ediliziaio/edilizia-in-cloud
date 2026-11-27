import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Loader2, Link2, CheckCircle2, ArrowRight, Download } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
interface Status { configured: boolean; vat_number: string | null }
export function ItalaPlatformConnection({ companyId, connected, hasDirect, onRecuperaStorico, onScollega }: { companyId?: string; connected: boolean; hasDirect: boolean; onRecuperaStorico?: () => void; onScollega?: () => void }) {
  const t = useT();
  const cache = useQueryClient();
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [confermaScollega, setConfermaScollega] = useState(false);
  const status = useQuery({ queryKey: ["itala-platform", companyId], enabled: !!companyId, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("billing-connect", { body: { action: "itala_platform_status", company_id: companyId } });
      if (error || data?.error) throw new Error(data?.error || t("Collegamento non disponibile. Contatta l'assistenza."));
      return data as Status;
    } });
  const connect = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-connect", { body: { action: "connect_platform_itala", company_id: companyId, consent_provider: true } });
      if (error) {
        const response = (error as { context?: Response }).context;
        const details = response instanceof Response ? await response.clone().json().catch((): null => null) : null;
        throw new Error(details?.error || t("Collegamento non riuscito."));
      }
      if (data?.error) throw new Error(data.error);
      await cache.invalidateQueries({ queryKey: ["billing_integrations"] });
      toast.success(t("Recupero fatture collegato"), { description: hasDirect ? t("Il tuo programma resta il collegamento principale.") : t("Puoi recuperare lo storico e importare le fatture disponibili.") });
      setConfirm(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("Collegamento non riuscito.")); }
    finally { setBusy(false); }
  };
  return <Card className={connected ? undefined : "border-primary/40 bg-primary/5"}>
    <CardHeader>
      <CardTitle className="text-base flex items-center gap-2">
        {t("Recupero fatture con Edilizia in Cloud")}
        {!connected && <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] align-middle">{t("Consigliato")}</Badge>}
      </CardTitle>
      <CardDescription>
        {t("Il modo più semplice per portare qui le fatture: leggiamo la partita IVA della tua azienda e importiamo le fatture emesse e ricevute passate dallo SDI. Non servono chiavi né password.")}
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {status.isLoading ? <Skeleton className="h-12 w-full" /> : <>
        <p className="text-sm">{t("Partita IVA dall'anagrafica aziendale:")} <strong>{status.data?.vat_number || t("da completare nell'anagrafica")}</strong></p>
        {status.error && <Alert variant="destructive"><AlertDescription>{status.error.message}</AlertDescription></Alert>}
        {status.data && !status.data.configured && <p className="text-sm text-muted-foreground">{t("Il servizio è in preparazione. Puoi già collegare il tuo programma.")}</p>}
        {connected
          ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-3 dark:border-emerald-900 dark:bg-emerald-950/40">
              <p className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" />{t("Collegato. Le fatture emesse e ricevute arrivano in automatico.")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => onRecuperaStorico?.()}><Download className="h-4 w-4 mr-2" />{t("Recupera lo storico da AdE")}<ArrowRight className="h-4 w-4 ml-2" /></Button>
                {onScollega && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfermaScollega(true)}>{t("Scollega")}</Button>}
              </div>
            </div>
          : <Button disabled={!status.data?.configured || !status.data.vat_number || busy} onClick={() => setConfirm(true)}><Link2 className="h-4 w-4 mr-2" />{t("Collega il recupero fatture")}</Button>}
        {hasDirect && <p className="text-sm text-muted-foreground">{t("Il programma già collegato resta la fonte principale. I documenti già presenti vengono riconosciuti durante l'importazione.")}</p>}
      </>}
      <AlertDialog open={confirm} onOpenChange={v => { if (!busy) setConfirm(v); }}><AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t("Collega la partita IVA {vat_number}", { vat_number: String(status.data?.vat_number ?? "") })}</AlertDialogTitle><AlertDialogDescription>
          {t("Edilizia in Cloud trasmetterà ragione sociale, partita IVA e codice fiscale dell'anagrafica aziendale a Itala Tecnologia Informatica S.r.l. per attivare il collegamento. Le credenziali del servizio restano sul server. Per recuperare lo storico dovrai abilitare ITALA in Fatture e Corrispettivi e firmare la richiesta; gli eventuali crediti verranno mostrati prima della conferma.")}
        </AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("Annulla")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void connect(); }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{t("Conferma collegamento")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent></AlertDialog>
      <AlertDialog open={confermaScollega} onOpenChange={setConfermaScollega}><AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t("Scollegare il recupero fatture?")}</AlertDialogTitle><AlertDialogDescription>{t("Le fatture già importate restano. Potrai ricollegare quando vuoi.")}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{t("Annulla")}</AlertDialogCancel><AlertDialogAction onClick={() => { setConfermaScollega(false); onScollega?.(); }}>{t("Scollega")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent></AlertDialog>
    </CardContent>
  </Card>;
}
