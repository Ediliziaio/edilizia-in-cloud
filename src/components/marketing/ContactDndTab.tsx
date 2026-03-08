import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertCircle, Mail, MessageSquare, Phone, Smartphone } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface ContactDndTabProps {
  contact: any;
  onUpdate: (field: string, value: any) => void;
}

const DND_CHANNELS = [
  { field: "optout_whatsapp", label: "WhatsApp", icon: MessageSquare, color: "text-emerald-600" },
  { field: "optout_email", label: "Email", icon: Mail, color: "text-violet-600" },
  { field: "optout_sms", label: "SMS", icon: Smartphone, color: "text-blue-600" },
  { field: "optout_call", label: "Chiamate", icon: Phone, color: "text-orange-600" },
] as const;

export function ContactDndTab({ contact, onUpdate }: ContactDndTabProps) {
  const anyOptout = DND_CHANNELS.some(ch => contact?.[ch.field]);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-semibold">Do Not Disturb</Label>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Disattiva i canali di comunicazione per questo contatto.
        </p>
      </div>

      <div className="space-y-3">
        {DND_CHANNELS.map(({ field, label, icon: Icon, color }) => (
          <div key={field} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className={`h-3.5 w-3.5 ${color}`} />
              <span className="text-[11px]">{label}</span>
            </div>
            <Switch
              checked={contact?.[field] || false}
              onCheckedChange={(checked) => onUpdate(field, checked)}
            />
          </div>
        ))}
      </div>

      {contact?.unsubscribed && (
        <div className="text-[10px] text-destructive flex items-center gap-1 pt-2 border-t">
          <AlertCircle className="h-3 w-3" />
          Disiscritto il{" "}
          {contact.unsubscribed_at
            ? format(new Date(contact.unsubscribed_at), "dd/MM/yyyy", { locale: it })
            : "data sconosciuta"}
        </div>
      )}

      {anyOptout && (
        <div className="rounded-md bg-muted/50 p-2 mt-2">
          <p className="text-[10px] text-muted-foreground">
            I canali disattivati non verranno usati nelle automazioni e campagne.
          </p>
        </div>
      )}
    </div>
  );
}
