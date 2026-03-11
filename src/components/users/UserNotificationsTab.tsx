import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  useUserNotifPrefs,
  useSaveUserNotifPrefs,
  DEFAULT_NOTIF_PREFS,
} from "@/hooks/useUserNotificationPrefs";
import type { NotifPrefs } from "@/hooks/useUserNotificationPrefs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Smartphone, Mail, MonitorSmartphone, AlertCircle } from "lucide-react";

type Channel = "in_app" | "email" | "sms";

interface NotifEvent {
  key: string;
  label: string;
}

interface NotifSection {
  id: string;
  title: string;
  description: string;
  events: NotifEvent[];
}

const SECTIONS: NotifSection[] = [
  {
    id: "lead",
    title: "Lead & Opportunità",
    description: "Notifiche relative ai contatti e alle opportunità nel CRM.",
    events: [
      { key: "lead_new", label: "Nuovo lead creato" },
      { key: "lead_assigned", label: "Lead assegnato a te" },
      { key: "lead_stage_changed", label: "Cambio di stage" },
      { key: "lead_won", label: "Opportunità vinta" },
    ],
  },
  {
    id: "order",
    title: "Ordini",
    description: "Notifiche relative agli ordini e al loro avanzamento.",
    events: [
      { key: "order_new", label: "Nuovo ordine creato" },
      { key: "order_assigned", label: "Ordine assegnato a te" },
      { key: "order_status_changed", label: "Cambio di stato ordine" },
      { key: "order_completed", label: "Ordine completato" },
    ],
  },
  {
    id: "appointment",
    title: "Appuntamenti",
    description: "Notifiche relative al calendario e agli appuntamenti.",
    events: [
      { key: "appointment_new", label: "Nuovo appuntamento" },
      { key: "appointment_reminder", label: "Promemoria appuntamento" },
      { key: "appointment_cancelled", label: "Appuntamento cancellato" },
      { key: "appointment_rescheduled", label: "Appuntamento spostato" },
    ],
  },
  {
    id: "task",
    title: "Task & Attività",
    description: "Notifiche relative ai compiti assegnati e alle scadenze.",
    events: [
      { key: "task_assigned", label: "Task assegnata a te" },
      { key: "task_due_soon", label: "Scadenza imminente (24h)" },
      { key: "task_overdue", label: "Task scaduta" },
      { key: "task_completed", label: "Task completata" },
    ],
  },
  {
    id: "message",
    title: "Messaggi",
    description: "Notifiche per i messaggi in arrivo.",
    events: [
      { key: "message_whatsapp", label: "Messaggio WhatsApp ricevuto" },
      { key: "message_email_received", label: "Email ricevuta" },
    ],
  },
  {
    id: "report",
    title: "Report",
    description: "Digest periodici con statistiche e KPI.",
    events: [
      { key: "report_daily", label: "Report giornaliero" },
      { key: "report_weekly", label: "Report settimanale" },
      { key: "report_monthly", label: "Report mensile" },
    ],
  },
];

const CHANNELS: { id: Channel; label: string; icon: typeof Mail }[] = [
  { id: "in_app", label: "In-app", icon: MonitorSmartphone },
  { id: "email", label: "Email", icon: Mail },
  { id: "sms", label: "SMS", icon: Smartphone },
];

function prefKey(eventKey: string, channel: Channel): keyof NotifPrefs {
  return `${eventKey}_${channel}` as keyof NotifPrefs;
}

export function UserNotificationsTab() {
  const { userId } = useParams<{ userId: string }>();
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id as string | undefined;
  const { toast } = useToast();

  const { data: prefsData, isLoading } = useUserNotifPrefs(userId);
  const saveMutation = useSaveUserNotifPrefs(userId, companyId);

  const { data: userProfile } = useQuery({
    queryKey: ["user-phone-check", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);

  useEffect(() => {
    if (prefsData) setPrefs(prefsData);
  }, [prefsData]);

  const hasSmsPhone = !!userProfile?.phone;

  const toggle = (eventKey: string, channel: Channel, value: boolean) => {
    const key = prefKey(eventKey, channel);
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  const toggleAll = (section: NotifSection, channel: Channel, value: boolean) => {
    setPrefs((p) => {
      const updates: Partial<NotifPrefs> = {};
      section.events.forEach((evt) => {
        updates[prefKey(evt.key, channel)] = value;
      });
      return { ...p, ...updates };
    });
  };

  const isSectionAllEnabled = (section: NotifSection, channel: Channel) =>
    section.events.every((evt) => prefs[prefKey(evt.key, channel)]);

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync(prefs);
      toast({ title: "Preferenze salvate", description: "Le impostazioni di notifica sono state aggiornate." });
    } catch {
      toast({ title: "Errore", description: "Impossibile salvare le preferenze.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* SMS warning */}
      {!hasSmsPhone && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Le notifiche SMS sono disabilitate perché questo utente non ha un numero di telefono configurato.
            Aggiungilo nel tab <strong>Informazioni Utente</strong>.
          </AlertDescription>
        </Alert>
      )}

      {/* Matrix per section */}
      {SECTIONS.map((section) => (
        <Card key={section.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Header row */}
            <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 mb-3 items-end">
              <div /> {/* empty label col */}
              {CHANNELS.map((ch) => {
                const Icon = ch.icon;
                const allOn = isSectionAllEnabled(section, ch.id);
                const smsDisabled = ch.id === "sms" && !hasSmsPhone;
                return (
                  <div key={ch.id} className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      {ch.label}
                    </div>
                    <button
                      type="button"
                      onClick={() => !smsDisabled && toggleAll(section, ch.id, !allOn)}
                      className={`text-xs underline ${
                        smsDisabled
                          ? "opacity-30 cursor-not-allowed"
                          : "hover:text-foreground text-muted-foreground"
                      }`}
                      disabled={smsDisabled}
                    >
                      {allOn ? "Disattiva" : "Attiva"} tutti
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Event rows */}
            <div className="space-y-1">
              {section.events.map((evt) => (
                <div
                  key={evt.key}
                  className="grid grid-cols-[1fr_80px_80px_80px] gap-2 items-center py-2 border-t border-border"
                >
                  <span className="text-sm">{evt.label}</span>
                  {CHANNELS.map((ch) => {
                    const key = prefKey(evt.key, ch.id);
                    const checked = prefs[key];
                    const disabled = ch.id === "sms" && !hasSmsPhone;
                    return (
                      <div key={ch.id} className="flex justify-center">
                        <Switch
                          checked={checked}
                          onCheckedChange={(v) => toggle(evt.key, ch.id, v)}
                          disabled={disabled}
                          className={disabled ? "opacity-30" : ""}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Salva Preferenze
        </Button>
      </div>
    </div>
  );
}
