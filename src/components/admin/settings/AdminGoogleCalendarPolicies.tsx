/**
 * Regole della sincronizzazione Google Calendar per tutte le aziende.
 *
 * Stavano nella pagina Integrazioni, ma non sono un collegamento: decidono quali
 * opzioni ogni utente trova nelle sue preferenze di sincronizzazione. Dal
 * 25/11/2026 stanno con i calendari.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { GoogleCalendarLogo } from "@/components/integrations/brand-logos";

type SettingsMap = Record<string, { value: string }>;

const REGOLE = [
  {
    key: "google_calendar_allow_two_way",
    label: "Sincronizzazione nei due sensi",
    description: "Gli utenti possono far tornare nel CRM le modifiche fatte su Google Calendar.",
  },
  {
    key: "google_calendar_allow_guest_contact_create",
    label: "Crea contatti dagli invitati",
    description: "I partecipanti degli eventi Google diventano contatti del CRM.",
  },
  {
    key: "google_calendar_allow_google_to_crm_import",
    label: "Importa eventi Google come appuntamenti",
    description: "Gli eventi Google, secondo le regole di importazione, diventano appuntamenti del CRM.",
  },
] as const;

export default function AdminGoogleCalendarPolicies() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: queryKeys.admin.platformSettings,
    queryFn: async () => {
      const res = await supabase.functions.invoke("manage-super-admins", { body: { action: "get-settings" } });
      if (res.error) throw new Error(res.error.message);
      return res.data?.settings as SettingsMap | undefined;
    },
    staleTime: 60 * 1000,
  });

  const salva = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const res = await supabase.functions.invoke("manage-super-admins", { body: { action: "update-settings", settings: updates } });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      toast.success("Regola salvata");
      qc.invalidateQueries({ queryKey: queryKeys.admin.platformSettings });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GoogleCalendarLogo className="h-4 w-4" /> Google Calendar delle aziende
        </CardTitle>
        <CardDescription>Le opzioni che ogni utente trova nelle preferenze di sincronizzazione.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y p-0 px-6">
        {REGOLE.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.description}</p>
            </div>
            <Switch
              checked={settings?.[r.key]?.value === "true"}
              onCheckedChange={(v) => salva.mutate({ [r.key]: v ? "true" : "false" })}
              disabled={isLoading || salva.isPending}
              aria-label={r.label}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
