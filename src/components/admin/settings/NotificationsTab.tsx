import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Building2, Clock, MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Prefs {
  new_company: boolean;
  trial_expiring: boolean;
  new_ticket: boolean;
}

const defaults: Prefs = { new_company: true, trial_expiring: true, new_ticket: true };

export default function NotificationsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: prefs = defaults, isLoading } = useQuery({
    queryKey: ["admin-notification-prefs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_notification_prefs" as any)
        .select("new_company, trial_expiring, new_ticket")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return defaults;
      return data as unknown as Prefs;
    },
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async (updated: Prefs) => {
      const { error } = await supabase
        .from("admin_notification_prefs" as any)
        .upsert({ user_id: user!.id, ...updated } as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notification-prefs"] });
      toast.success("Preferenze aggiornate");
    },
    onError: () => toast.error("Errore nel salvataggio"),
  });

  const toggle = (key: keyof Prefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    mutation.mutate(updated);
  };

  const items: { key: keyof Prefs; icon: typeof Bell; label: string; desc: string }[] = [
    { key: "new_company", icon: Building2, label: "Nuova azienda registrata", desc: "Ricevi una notifica quando una nuova azienda si registra sulla piattaforma" },
    { key: "trial_expiring", icon: Clock, label: "Trial in scadenza", desc: "Ricevi un alert quando un periodo di prova sta per scadere" },
    { key: "new_ticket", icon: MessageSquare, label: "Nuovo ticket di supporto", desc: "Ricevi una notifica per ogni nuovo ticket di assistenza aperto" },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Preferenze Notifiche</CardTitle>
        <CardDescription>Configura quali notifiche ricevere.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {items.map(({ key, icon: Icon, label, desc }) => (
          <div key={key} className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 mt-0.5"><Icon className="h-4 w-4 text-primary" /></div>
              <div>
                <Label className="text-sm font-medium">{label}</Label>
                <p className="text-xs text-muted-foreground mt-1">{desc}</p>
              </div>
            </div>
            <Switch checked={prefs[key]} onCheckedChange={() => toggle(key)} disabled={mutation.isPending} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
