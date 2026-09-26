import { forwardRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Mail, MessageSquare, Phone, ShieldCheck, ShieldX, Smartphone } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface ContactDndTabProps {
  contact: any;
  /** extra: campi accessori scritti nello stesso UPDATE (es. optout_at col toggle). */
  onUpdate: (field: string, value: any, extra?: Record<string, any>) => void;
}

const DND_CHANNELS = [
  { field: "optout_whatsapp", label: "WhatsApp", icon: MessageSquare, color: "text-emerald-600" },
  { field: "optout_email", label: "Email", icon: Mail, color: "text-violet-600" },
  { field: "optout_sms", label: "SMS", icon: Smartphone, color: "text-blue-600" },
  { field: "optout_call", label: "Chiamate", icon: Phone, color: "text-orange-600" },
] as const;

export const ContactDndTab = forwardRef<HTMLDivElement, ContactDndTabProps>(function ContactDndTab({ contact, onUpdate }, ref) {
  const anyOptout = DND_CHANNELS.some(ch => contact?.[ch.field]);
  const [motivoBozza, setMotivoBozza] = useState<string | null>(null);

  const dataIt = (iso: string | null | undefined) =>
    iso ? format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: it }) : null;

  // Consenso a tre stati: null = mai registrato, true = dato, false = negato.
  const consenso: boolean | null = contact?.marketing_consent ?? null;
  const registraConsenso = (valore: boolean) =>
    onUpdate("marketing_consent", valore, {
      marketing_consent_at: new Date().toISOString(),
      marketing_consent_source: "manuale — scheda contatto",
    });

  return (
    <div ref={ref} className="space-y-4">
      {/* Consenso marketing: il positivo. Prima esisteva solo il "non disturbare",
          e nessun posto dove dimostrare che il contatto aveva DETTO SÌ. */}
      <div className="rounded-md border p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Consenso marketing</Label>
          {consenso === true ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 max-md:text-[11px]">
              <ShieldCheck className="h-3 w-3" /> Dato
            </span>
          ) : consenso === false ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive max-md:text-[11px]">
              <ShieldX className="h-3 w-3" /> Negato
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground max-md:text-[11px]">Mai registrato</span>
          )}
        </div>
        {consenso !== null && contact?.marketing_consent_at && (
          <p className="text-[10px] text-muted-foreground max-md:text-[11px]">
            Registrato il {dataIt(contact.marketing_consent_at)}
            {contact.marketing_consent_source ? ` · ${contact.marketing_consent_source}` : ""}
          </p>
        )}
        <div className="flex gap-1.5">
          {consenso !== true && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 max-md:text-[11px]" onClick={() => registraConsenso(true)}>
              Registra consenso
            </Button>
          )}
          {consenso !== false && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-destructive max-md:text-[11px]" onClick={() => registraConsenso(false)}>
              {consenso === true ? "Revoca" : "Segna negato"}
            </Button>
          )}
        </div>
      </div>

      <div>
        <Label className="text-xs font-semibold">Do Not Disturb</Label>
        <p className="text-[10px] text-muted-foreground mt-0.5 max-md:text-[11px]">
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
              onCheckedChange={(checked) =>
                // La data dell'opt-out si scrive col gesto, nello stesso UPDATE:
                // optout_at esisteva in DB ma non la scriveva nessuno.
                onUpdate(field, checked, checked ? { optout_at: new Date().toISOString() } : undefined)
              }
            />
          </div>
        ))}
      </div>

      {contact?.unsubscribed && (
        <div className="text-[10px] text-destructive flex items-center gap-1 pt-2 border-t max-md:text-[11px]">
          <AlertCircle className="h-3 w-3" />
          Disiscritto il{" "}
          {contact.unsubscribed_at
            ? format(new Date(contact.unsubscribed_at), "dd/MM/yyyy", { locale: it })
            : "data sconosciuta"}
        </div>
      )}

      {anyOptout && (
        <div className="rounded-md bg-muted/50 p-2 mt-2 space-y-1.5">
          <p className="text-[10px] text-muted-foreground max-md:text-[11px]">
            I canali disattivati non verranno usati nelle automazioni e campagne.
            {contact?.optout_at ? ` Ultimo opt-out: ${dataIt(contact.optout_at)}.` : ""}
          </p>
          <div className="flex gap-1.5">
            <Input
              placeholder="Motivo opt-out (opzionale)…"
              value={motivoBozza ?? contact?.optout_reason ?? ""}
              onChange={(e) => setMotivoBozza(e.target.value)}
              className="h-6 text-[10px] max-md:text-[11px]"
            />
            {motivoBozza !== null && motivoBozza !== (contact?.optout_reason ?? "") && (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 text-[10px] px-2 max-md:text-[11px]"
                onClick={() => { onUpdate("optout_reason", motivoBozza.trim() || null); setMotivoBozza(null); }}
              >
                Salva
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
