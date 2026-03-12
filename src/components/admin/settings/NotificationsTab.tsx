import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bell, Building2, Clock, MessageSquare, CreditCard, Pause, Users, Loader2, Monitor, Mail } from "lucide-react";
import { toast } from "sonner";

interface Prefs {
  new_company: boolean;
  trial_expiring: boolean;
  new_ticket: boolean;
  payment_failed_alert: boolean;
  company_suspended_alert: boolean;
  new_referral_signup: boolean;
  new_company_email: boolean;
  trial_expiring_email: boolean;
  new_ticket_email: boolean;
  payment_failed_alert_email: boolean;
  company_suspended_alert_email: boolean;
  new_referral_signup_email: boolean;
}

const defaults: Prefs = {
  new_company: true,
  trial_expiring: true,
  new_ticket: true,
  payment_failed_alert: true,
  company_suspended_alert: true,
  new_referral_signup: false,
  new_company_email: true,
  trial_expiring_email: true,
  new_ticket_email: true,
  payment_failed_alert_email: true,
  company_suspended_alert_email: true,
  new_referral_signup_email: false,
};

const SELECT_COLS = "new_company, trial_expiring, new_ticket, payment_failed_alert, company_suspended_alert, new_referral_signup, new_company_email, trial_expiring_email, new_ticket_email, payment_failed_alert_email, company_suspended_alert_email, new_referral_signup_email";

type EventKey = "new_company" | "trial_expiring" | "new_ticket" | "payment_failed_alert" | "company_suspended_alert" | "new_referral_signup";

interface NotifItem {
  key: EventKey;
  icon: typeof Bell;
  label: string;
  desc: string;
}

const items: NotifItem[] = [
  { key: "new_company", icon: Building2, label: "Nuova azienda registrata", desc: "Quando una nuova azienda si registra sulla piattaforma" },
  { key: "trial_expiring", icon: Clock, label: "Trial in scadenza", desc: "Quando un periodo di prova sta per scadere" },
  { key: "new_ticket", icon: MessageSquare, label: "Nuovo ticket di supporto", desc: "Per ogni nuovo ticket di assistenza aperto" },
  { key: "payment_failed_alert", icon: CreditCard, label: "Pagamento fallito", desc: "Quando un'azienda ha un pagamento non riuscito" },
  { key: "company_suspended_alert", icon: Pause, label: "Azienda sospesa", desc: "Quando un'azienda viene sospesa automaticamente" },
  { key: "new_referral_signup", icon: Users, label: "Nuovo referral", desc: "Quando un referrer porta una nuova registrazione" },
];

export default function NotificationsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: prefs = defaults, isLoading } = useQuery({
    queryKey: ["admin-notification-prefs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_notification_prefs")
        .select(SELECT_COLS)
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
        .from("admin_notification_prefs")
        .upsert({ user_id: user!.id, ...updated }, { onConflict: "user_id" });
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
        <CardDescription>Configura quali notifiche ricevere e su quale canale.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Channel legend */}
        <div className="flex items-center gap-4 mb-4 pb-4 border-b">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Monitor className="h-3.5 w-3.5" /> In-app
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5" /> Email
          </div>
        </div>

        <div className="space-y-4">
          {items.map(({ key, icon: Icon, label, desc }) => {
            const emailKey = `${key}_email` as keyof Prefs;
            return (
              <div key={key} className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="rounded-lg bg-primary/10 p-2 mt-0.5 shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-sm font-medium">{label}</Label>
                    <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex flex-col items-center gap-1">
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                    <Switch
                      checked={prefs[key]}
                      onCheckedChange={() => toggle(key)}
                      disabled={mutation.isPending}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <Switch
                      checked={prefs[emailKey]}
                      onCheckedChange={() => toggle(emailKey)}
                      disabled={mutation.isPending}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
