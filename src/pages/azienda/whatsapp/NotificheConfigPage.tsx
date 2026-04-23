// MP04 — Configurazione trigger notifiche automatiche per company.

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  TRIGGER_LABELS,
  useToggleWATrigger,
  useWANotificheTriggers,
  type NotificaKind,
} from "@/hooks/whatsapp/useWANotifiche";

const KIND_ORDER: NotificaKind[] = [
  "fattura_scaduta",
  "ddt_pendente",
  "margine_basso",
  "approvazione_pendente",
  "preventivo_inviato",
  "sal_raggiunto",
  "fattura_emessa",
  "custom",
];

const AVAILABLE_MP03: NotificaKind[] = ["fattura_scaduta", "approvazione_pendente"];

export default function NotificheConfigPage() {
  const { data: triggers, isLoading } = useWANotificheTriggers();
  const toggle = useToggleWATrigger();

  const byKind = useMemo(() => {
    const map = new Map<NotificaKind, { id: string; enabled: boolean; last_fired_at: string | null; fire_count: number | null }>();
    for (const t of triggers ?? []) {
      map.set(t.trigger_kind as NotificaKind, {
        id: t.id,
        enabled: t.enabled ?? false,
        last_fired_at: t.last_fired_at,
        fire_count: t.fire_count,
      });
    }
    return map;
  }, [triggers]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Notifiche automatiche</h1>
        <p className="text-sm text-muted-foreground">
          Abilita i trigger per ricevere alert proattivi via WhatsApp sui numeri di scopo "notifiche".
          Richiede un numero WhatsApp configurato con purpose=notifiche e template Meta approvato.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trigger disponibili</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {KIND_ORDER.map((kind) => {
            const trigger = byKind.get(kind);
            const available = AVAILABLE_MP03.includes(kind);
            return (
              <div key={kind} className="flex items-center justify-between py-4 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`trigger-${kind}`} className="font-medium">
                      {TRIGGER_LABELS[kind]}
                    </Label>
                    {!available && (
                      <Badge variant="secondary" className="text-xs">
                        In arrivo
                      </Badge>
                    )}
                    {trigger?.fire_count != null && trigger.fire_count > 0 && (
                      <Badge variant="outline" className="text-xs">
                        Inviate: {trigger.fire_count}
                      </Badge>
                    )}
                  </div>
                  {trigger?.last_fired_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Ultima notifica: {new Date(trigger.last_fired_at).toLocaleString("it-IT")}
                    </p>
                  )}
                </div>
                <Switch
                  id={`trigger-${kind}`}
                  checked={trigger?.enabled ?? false}
                  disabled={!available || !trigger || toggle.isPending}
                  onCheckedChange={(checked) => {
                    if (trigger) {
                      toggle.mutate({ id: trigger.id, enabled: checked });
                    }
                  }}
                  aria-label={`Abilita trigger ${TRIGGER_LABELS[kind]}`}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Come funzionano</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Un cron gira ogni 15 minuti e valuta le condizioni di ogni trigger attivo.</p>
          <p>• Anti-spam: la stessa notifica per lo stesso soggetto (es. stessa fattura) viene inviata al massimo 1 volta ogni 24h.</p>
          <p>• I trigger scritti "In arrivo" saranno aggiunti in una release successiva (richiedono DB triggers event-driven).</p>
          <p>• Per iniziare serve: (1) numero WhatsApp con purpose=notifiche collegato, (2) template UTILITY approvato su Meta, (3) configurazione del trigger con template_name e destinatario.</p>
        </CardContent>
      </Card>
    </div>
  );
}
