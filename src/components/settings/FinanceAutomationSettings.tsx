import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, Settings2, Bell, FileText } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { usePermissions } from "@/hooks/usePermissions";
import { puoModificareCosti } from "@/lib/permessi/modificaSegueVisibilita";

interface AlertPrefs {
  id?: string;
  company_id: string;
  alert_enabled: boolean;
  default_alert_days: number;
  alert_email: string;
  alert_on_overdue: boolean;
  alert_on_upcoming: boolean;
  auto_generate_from_invoices: boolean;
  auto_reconcile_payments: boolean;
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

  const currentPrefs: AlertPrefs = {
    company_id: companyId!,
    alert_enabled: true,
    default_alert_days: 7,
    alert_on_overdue: true,
    alert_on_upcoming: true,
    auto_generate_from_invoices: true,
    auto_reconcile_payments: true,
    ...prefs,
    ...form,
    alert_email: form.alert_email ?? prefs?.alert_email ?? "",
  };

  const upd = <K extends keyof AlertPrefs>(key: K, value: AlertPrefs[K]) =>
    setDraft(prev => ({ companyId, form: { ...(prev.companyId === companyId ? prev.form : {}), [key]: value } }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || isLoading || isError || !canEdit) throw new Error("Impostazioni non disponibili o in sola lettura.");
      if (!Number.isInteger(currentPrefs.default_alert_days) || currentPrefs.default_alert_days < 1 || currentPrefs.default_alert_days > 30) throw new Error("Il preavviso deve essere tra 1 e 30 giorni.");
      const payload = {
        company_id: companyId!,
        alert_enabled: currentPrefs.alert_enabled,
        default_alert_days: currentPrefs.default_alert_days,
        alert_email: currentPrefs.alert_email || null,
        alert_on_overdue: currentPrefs.alert_on_overdue,
        alert_on_upcoming: currentPrefs.alert_on_upcoming,
        auto_generate_from_invoices: currentPrefs.auto_generate_from_invoices,
        auto_reconcile_payments: currentPrefs.auto_reconcile_payments,
        updated_at: new Date().toISOString(),
      };

      if (prefs?.id) {
        const { error } = await (supabase as any)
          .from("scadenza_alert_prefs")
          .update({ ...form, updated_at: payload.updated_at })
          .eq("id", prefs.id)
          .eq("company_id", companyId)
          .select("id")
          .single();
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("scadenza_alert_prefs")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success("Impostazioni salvate");
      await queryClient.invalidateQueries({ queryKey: queryKeys.scadenzaPrefs.byCompany(companyId) });
      setDraft(prev => prev.companyId === companyId ? { companyId, form: {} } : prev);
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });
  useSettingsDraftGuard(hasChanges || saveMutation.isPending);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !companyId) {
    return <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">Non riesco a leggere le impostazioni. Nessuna modifica verrà salvata.<Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button></AlertDescription></Alert>;
  }

  return (
    <div className="space-y-6">
      {!canEdit && <p className="text-sm text-muted-foreground">Sola lettura: per modificare servono i permessi sui costi.</p>}
      <fieldset disabled={!canEdit || saveMutation.isPending} className="m-0 min-w-0 border-0 p-0">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Automazioni Finanziarie
          </CardTitle>
          <CardDescription>
            Configura la generazione automatica delle scadenze e gli avvisi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Auto-generation */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Generazione automatica
            </h4>

            <div className="flex items-center justify-between">
              <div>
                <Label>Scadenze da fatture</Label>
                <p className="text-xs text-muted-foreground">
                  Crea automaticamente una scadenza quando viene emessa una fattura con data di scadenza
                </p>
              </div>
              <Switch
                checked={currentPrefs.auto_generate_from_invoices}
                onCheckedChange={(v) => upd("auto_generate_from_invoices", v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Riconciliazione automatica</Label>
                <p className="text-xs text-muted-foreground">
                  Aggiorna automaticamente le scadenze quando una fattura viene segnata come pagata
                </p>
              </div>
              <Switch
                checked={currentPrefs.auto_reconcile_payments}
                onCheckedChange={(v) => upd("auto_reconcile_payments", v)}
              />
            </div>
          </div>

          <Separator />

          {/* Alerts */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Avvisi e notifiche
            </h4>

            <div className="flex items-center justify-between">
              <div>
                <Label>Avvisi attivi</Label>
                <p className="text-xs text-muted-foreground">
                  Abilita il sistema di notifiche per le scadenze
                </p>
              </div>
              <Switch
                checked={currentPrefs.alert_enabled}
                onCheckedChange={(v) => upd("alert_enabled", v)}
              />
            </div>

            {currentPrefs.alert_enabled && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Avviso scadenze in scadenza</Label>
                    <p className="text-xs text-muted-foreground">
                      Ricevi un avviso quando una scadenza si avvicina
                    </p>
                  </div>
                  <Switch
                    checked={currentPrefs.alert_on_upcoming}
                    onCheckedChange={(v) => upd("alert_on_upcoming", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Avviso scadenze scadute</Label>
                    <p className="text-xs text-muted-foreground">
                      Ricevi un avviso per scadenze non pagate oltre la data
                    </p>
                  </div>
                  <Switch
                    checked={currentPrefs.alert_on_overdue}
                    onCheckedChange={(v) => upd("alert_on_overdue", v)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="finance-alert-days" className="text-xs">Giorni di preavviso</Label>
                    <Input
                      id="finance-alert-days"
                      type="number"
                      min={1}
                      max={30}
                      value={currentPrefs.default_alert_days}
                      onChange={(e) => upd("default_alert_days", Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="finance-alert-email" className="text-xs">Email per avvisi</Label>
                    <Input
                      id="finance-alert-email"
                      type="email"
                      value={currentPrefs.alert_email}
                      onChange={(e) => upd("alert_email", e.target.value)}
                      placeholder="admin@azienda.it"
                    />
                  </div>
                </div>
              </>
            )}
          </div>


          {/* Save */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-xs text-muted-foreground">{saveMutation.isPending ? "Salvataggio…" : hasChanges ? "Modifiche non salvate" : "Nessuna modifica da salvare"}</p>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!hasChanges || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvataggio...</>
              ) : (
                "Salva impostazioni"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
      </fieldset>
    </div>
  );
}
