import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Mail, MessageSquare, Smartphone, Phone, ArrowRight, Bot } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ContactActionsTabProps {
  contact: any;
  companyId: string;
}

export const ContactActionsTab = forwardRef<HTMLDivElement, ContactActionsTabProps>(function ContactActionsTab({ contact, companyId }, ref) {
  const navigate = useNavigate();

  const handleSendMessage = (channel: string) => {
    // Navigate to messaging with pre-filled contact
    if (channel === "whatsapp" && contact.phone) {
      navigate(`/azienda/marketing/messaggi?contact=${contact.id}&channel=whatsapp`);
    } else if (channel === "email" && contact.email) {
      navigate(`/azienda/marketing/messaggi?contact=${contact.id}&channel=email`);
    } else if (channel === "sms" && contact.phone) {
      toast.info("SMS: funzionalità in arrivo con integrazione Twilio");
    } else {
      toast.error(`Dati di contatto mancanti per ${channel}`);
    }
  };

  const handleCall = () => {
    if (contact.phone) {
      window.open(`tel:${contact.phone}`, "_self");
    } else {
      toast.error("Numero di telefono mancante");
    }
  };

  const actions = [
    {
      label: "Invia WhatsApp",
      icon: MessageSquare,
      color: "text-emerald-600",
      disabled: !contact.phone || contact.optout_whatsapp,
      onClick: () => handleSendMessage("whatsapp"),
    },
    {
      label: "Invia Email",
      icon: Mail,
      color: "text-violet-600",
      disabled: !contact.email || contact.optout_email,
      onClick: () => handleSendMessage("email"),
    },
    {
      label: "Invia SMS",
      icon: Smartphone,
      color: "text-blue-600",
      disabled: !contact.phone || contact.optout_sms,
      onClick: () => handleSendMessage("sms"),
    },
    {
      label: "Chiama",
      icon: Phone,
      color: "text-orange-600",
      disabled: !contact.phone || contact.optout_call,
      onClick: handleCall,
    },
    {
      label: "Aggiungi ad automazione",
      icon: ArrowRight,
      color: "text-primary",
      disabled: false,
      onClick: () => navigate(`/azienda/marketing/automazioni`),
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">Azioni rapide</p>
      <div className="space-y-1.5">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            size="sm"
            className="w-full justify-start h-8 text-[11px]"
            disabled={action.disabled}
            onClick={action.onClick}
          >
            <action.icon className={`h-3.5 w-3.5 mr-2 ${action.disabled ? "text-muted-foreground" : action.color}`} />
            {action.label}
            {action.disabled && (
              <span className="ml-auto text-[9px] text-muted-foreground">
                {(action.label.includes("WhatsApp") && contact.optout_whatsapp) ||
                 (action.label.includes("Email") && contact.optout_email) ||
                 (action.label.includes("SMS") && contact.optout_sms) ||
                 (action.label.includes("Chiama") && contact.optout_call)
                  ? "Opt-out"
                  : "Mancante"}
              </span>
            )}
          </Button>
        ))}
      </div>
    </div>
  );
}
