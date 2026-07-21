import { useState } from "react";
import { ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * Toggle "Area privata clienti".
 *
 * Quando attivo → i clienti creati ricevono un account portale (password + email
 *   di benvenuto opzionali).
 * Quando disattivo → la creazione cliente salva solo l'anagrafica, senza
 *   account auth utilizzabile. I clienti esistenti mantengono l'accesso,
 *   ma non ne vengono più creati di nuovi.
 *
 * Il setting è persistito su `companies.customer_portal_enabled` ed è letto
 * anche lato server-side nell'edge function `create-customer` per forzare
 * il comportamento indipendentemente da cosa invia il client.
 */
export function CustomerPortalToggle() {
  const { effectiveCompany, refreshAuth } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();

  const initial = (effectiveCompany as { customer_portal_enabled?: boolean } | null)
    ?.customer_portal_enabled !== false;

  const [enabled, setEnabled] = useState<boolean>(initial);
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = async (next: boolean) => {
    if (!effectiveCompany?.id) return;

    // ATTIVAZIONE → doppia conferma. Aprire l'area privata è un'azione sensibile:
    // da quel momento ogni nuovo cliente riceve un account con credenziali di
    // accesso (password + email). Richiediamo DUE conferme esplicite. Se una
    // delle due viene annullata, l'interruttore resta com'era (controllato da
    // `enabled`, che non tocchiamo finché entrambe non sono confermate).
    if (next) {
      const first = await confirm({
        title: "Attivare l'area privata clienti?",
        description:
          "I nuovi clienti riceveranno un account con email e password per accedere al portale privato. Vuoi procedere?",
        confirmLabel: "Sì, continua",
      });
      if (!first) return;
      const second = await confirm({
        title: "Confermi l'attivazione?",
        description:
          "Seconda conferma. Attivando l'area privata, ogni nuovo cliente creato potrà accedere con le proprie credenziali. Confermi definitivamente?",
        confirmLabel: "Attiva area privata",
      });
      if (!second) return;
    }

    setIsSaving(true);
    const previous = enabled;
    setEnabled(next); // ottimistic update

    try {
      const { error } = await supabase
        .from("companies")
        .update({ customer_portal_enabled: next } as never)
        .eq("id", effectiveCompany.id);

      if (error) throw error;

      toast({
        title: next ? "Area privata attivata" : "Area privata disattivata",
        description: next
          ? "I nuovi clienti riceveranno un account di accesso al portale."
          : "I nuovi clienti verranno creati solo in anagrafica (nessun account).",
      });

      await refreshAuth();
    } catch (e) {
      setEnabled(previous); // rollback
      toast({
        title: "Errore",
        description: e instanceof Error ? e.message : "Impossibile aggiornare l'impostazione.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
            enabled ? "bg-emerald-500/10" : "bg-muted"
          }`}>
            {enabled ? (
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
            ) : (
              <ShieldOff className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <Label htmlFor="customer-portal-toggle" className="text-sm font-semibold">
              Area privata clienti
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Consenti ai clienti di accedere al portale privato con email e password.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch
            id="customer-portal-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={isSaving}
          />
        </div>
      </div>

      <Separator />

      {enabled ? (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription className="text-xs">
            L'area privata è <strong>attiva</strong>. Alla creazione di un cliente verrà
            generato un account con password; puoi comunque scegliere caso-per-caso se
            creare l'account o salvare solo l'anagrafica.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="default" className="border-amber-300 bg-amber-50/50 dark:bg-amber-900/10">
          <ShieldOff className="h-4 w-4" />
          <AlertDescription className="text-xs">
            L'area privata è <strong>disattivata</strong>. I nuovi clienti saranno creati
            solo in anagrafica: niente account portale, niente email di benvenuto,
            niente password da gestire. I clienti già esistenti continuano ad accedere.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
