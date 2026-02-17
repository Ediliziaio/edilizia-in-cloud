import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Building2, Clock, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "admin_notification_prefs";

interface Prefs {
  newCompany: boolean;
  trialExpiring: boolean;
  newTicket: boolean;
}

const defaults: Prefs = { newCompany: true, trialExpiring: true, newTicket: true };

export default function NotificationsTab() {
  const [prefs, setPrefs] = useState<Prefs>(defaults);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setPrefs(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const toggle = (key: keyof Prefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    toast.success("Preferenze aggiornate");
  };

  const items: { key: keyof Prefs; icon: typeof Bell; label: string; desc: string }[] = [
    { key: "newCompany", icon: Building2, label: "Nuova azienda registrata", desc: "Ricevi una notifica quando una nuova azienda si registra sulla piattaforma" },
    { key: "trialExpiring", icon: Clock, label: "Trial in scadenza", desc: "Ricevi un alert quando un periodo di prova sta per scadere" },
    { key: "newTicket", icon: MessageSquare, label: "Nuovo ticket di supporto", desc: "Ricevi una notifica per ogni nuovo ticket di assistenza aperto" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Preferenze Notifiche</CardTitle>
        <CardDescription>Configura quali notifiche ricevere. Queste preferenze sono salvate localmente per ora.</CardDescription>
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
            <Switch checked={prefs[key]} onCheckedChange={() => toggle(key)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
