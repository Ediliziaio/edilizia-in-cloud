import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { usePermissions } from "@/hooks/usePermissions";
import { puoModificareCosti } from "@/lib/permessi/modificaSegueVisibilita";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { isValidEmail } from "@/lib/email/preferencesValidators";
import { AvvisoSolaLettura } from "@/components/common/AvvisoSolaLettura";
import { RigaImpostazione, RigaInterruttore, SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";

/**
 * Avvisi sulle scadenze (tabella `scadenza_alert_prefs`).
 *
 * Della tabella la pagina mostra solo le due colonne che qualcuno legge: `alert_enabled` e `alert_email`
 * (le legge la funzione `check-scadenze-alerts`, che per ora nessun cron chiama). Le altre colonne
 * (giorni di preavviso, avviso scadute / in arrivo, scadenze da fatture, riconciliazione) non le legge nessuno:
 * non sono più nella pagina, ma restano nel database com'erano.
 *
 * Alla prima volta la riga si crea con SOLO azienda, avvisi attivi, email e data: le colonne che la pagina
 * non mostra prendono i valori predefiniti del database (7 giorni, tutto acceso), gli stessi che prima si
 * scrivevano uno per uno (lo prova settingsFinanceSafety.test.tsx leggendo la migrazione).
 */
interface AlertPrefs {
  id?: string;
  company_id: string;
  alert_enabled: boolean;
  alert_email: string;
}

export function FinanceAutomationSettings() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const canEdit = puoModificareCosti(permissions);

  const { data: prefs, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.scadenzaPrefs.byCompany(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenza_alert_prefs")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as AlertPrefs | null;
    },
    enabled: !!companyId,
  });

  const [draft, setDraft] = useState<{ companyId: string | undefined; form: Partial<AlertPrefs> }>({ companyId, form: {} });
  const form = draft.companyId === companyId ? draft.form : {};
  const hasChanges = Object.keys(form).length > 0;

  // Quello che si vede: la bozza, altrimenti il salvato, altrimenti il valore di partenza (avvisi accesi, nessuna email).
  const alertEnabled = form.alert_enabled ?? (prefs ? prefs.alert_enabled === true : true);
  const alertEmail = form.alert_email ?? prefs?.alert_email ?? "";

  const upd = <K extends keyof AlertPrefs>(key: K, value: AlertPrefs[K]) =>
    setDraft(prev => ({ companyId, form: { ...(prev.companyId === companyId ? prev.form : {}), [key]: value } }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || isLoading || isError || !canEdit) throw new Error("Impostazioni non disponibili o in sola lettura.");
      const adesso = new Date().toISOString();
      const email = alertEmail.trim() || null;

      if (prefs?.id) {
        // Solo quello che è cambiato.
        const modifiche: { alert_enabled?: boolean; alert_email?: string | null } = {};
        if (form.alert_enabled !== undefined) modifiche.alert_enabled = form.alert_enabled;
        if (form.alert_email !== undefined) modifiche.alert_email = email;
        const { error } = await supabase
          .from("scadenza_alert_prefs")
          .update({ ...modifiche, updated_at: adesso })
          .eq("id", prefs.id)
          .eq("company_id", companyId)
          .select("id")
          .single();
        if (error) throw error;
      } else {
        // Prima volta: solo i campi che la pagina mostra. Il resto lo mette il database.
        const { error } = await supabase
          .from("scadenza_alert_prefs")
          .insert({ company_id: companyId, alert_enabled: alertEnabled, alert_email: email, updated_at: adesso });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success("Impostazioni salvate");
      await queryClient.invalidateQueries({ queryKey: queryKeys.scadenzaPrefs.byCompany(companyId) });
      setDraft(prev => prev.companyId === companyId ? { companyId, form: {} } : prev);
    },
    onError: (e) => toast.error("Impostazioni non salvate", { description: userErrorMessage(e, "Riprova tra poco.") }),
  });
  useSettingsDraftGuard(hasChanges || saveMutation.isPending);

  const salva = () => {
    if (!hasChanges || saveMutation.isPending) return;
    const email = alertEmail.trim();
    if (email && !isValidEmail(email)) {
      toast.error("Scrivi un indirizzo email valido, per esempio amministrazione@azienda.it.");
      return;
    }
    saveMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center rounded-lg border bg-card py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !companyId) {
    return <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">Non riesco a leggere le impostazioni. Nessuna modifica verrà salvata.<Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button></AlertDescription></Alert>;
  }

  return (
    <div className="max-w-3xl space-y-4">
      {!canEdit && (
        <AvvisoSolaLettura>
          Sola lettura: qui serve il permesso «Costi», e chi ce l&apos;ha in «Sola lettura» non può scrivere.
        </AvvisoSolaLettura>
      )}
      <fieldset disabled={!canEdit || saveMutation.isPending} className="m-0 min-w-0 border-0 p-0">
        <SezioneImpostazione
          id="avvisi-scadenze"
          titolo="Avvisi sulle scadenze"
          descrizione="I promemoria dei pagamenti in uscita arrivano già in campanella ogni mattina, a chi amministra l'azienda: non dipendono da questa pagina."
        >
          <RigaInterruttore
            id="finance-alert-enabled"
            titolo="Avvisi attivi"
            descrizione="Un riepilogo per email delle scadenze scadute e in arrivo."
            checked={alertEnabled}
            onCheckedChange={(v) => upd("alert_enabled", v)}
          />
          <RigaImpostazione titolo="Email per avvisi" htmlFor="finance-alert-email">
            <Input
              id="finance-alert-email"
              type="email"
              className="mt-2 max-w-sm"
              value={alertEmail}
              onChange={(e) => upd("alert_email", e.target.value)}
              placeholder="admin@azienda.it"
            />
          </RigaImpostazione>
          <div className="space-y-3 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              L&apos;invio di queste email non parte ancora da solo: la scelta resta salvata e varrà quando lo attiveremo.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="text-xs text-muted-foreground">{saveMutation.isPending ? "Salvataggio…" : hasChanges ? "Modifiche non salvate" : "Nessuna modifica da salvare"}</p>
              <Button
                onClick={salva}
                disabled={!hasChanges || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvataggio...</>
                ) : (
                  "Salva impostazioni"
                )}
              </Button>
            </div>
          </div>
        </SezioneImpostazione>
      </fieldset>
    </div>
  );
}
