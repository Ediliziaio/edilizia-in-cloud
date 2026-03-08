import { forwardRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, MessageSquare, Smartphone, Phone, ArrowRight, Bot, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

interface ContactActionsTabProps {
  contact: any;
  companyId: string;
}

export const ContactActionsTab = forwardRef<HTMLDivElement, ContactActionsTabProps>(function ContactActionsTab({ contact, companyId }, ref) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const [showAICallDialog, setShowAICallDialog] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [callingAI, setCallingAI] = useState(false);

  const { data: aiAgents = [] } = useQuery({
    queryKey: ["ai-agents-for-call", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_agents" as never)
        .select("id, name, status")
        .eq("company_id", companyId)
        .eq("status", "active")
        .order("name");
      return (data || []) as { id: string; name: string; status: string }[];
    },
    enabled: !!companyId,
  });

  const handleSendMessage = (channel: string) => {
    if (channel === "whatsapp" && contact.phone) {
      navigate(`/azienda/marketing/messaggi?contact=${contact.id}&channel=whatsapp`);
    } else if (channel === "email" && contact.email) {
      navigate(`/azienda/marketing/messaggi?contact=${contact.id}&channel=email`);
    } else if (channel === "sms" && contact.phone) {
      navigate(`/azienda/marketing/messaggi?contact=${contact.id}&channel=sms`);
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

  const handleAICall = async () => {
    if (!selectedAgentId) {
      toast.error("Seleziona un agente AI");
      return;
    }
    setCallingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke("initiate-outbound-call", {
        body: { agent_id: selectedAgentId, contact_id: contact.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || "Chiamata AI avviata");
      setShowAICallDialog(false);
    } catch (err: any) {
      toast.error(err.message || "Errore nella chiamata AI");
    } finally {
      setCallingAI(false);
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
    {
      label: "Chiama con AI",
      icon: Bot,
      color: "text-primary",
      disabled: !contact.phone || contact.optout_call || aiAgents.length === 0,
      onClick: () => setShowAICallDialog(true),
    },
  ];

  return (
    <div ref={ref} className="space-y-2">
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

      <Dialog open={showAICallDialog} onOpenChange={setShowAICallDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Chiama con Agente AI
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Seleziona un agente AI per chiamare{" "}
              <strong>{contact.first_name} {contact.last_name}</strong> ({contact.phone}).
            </p>
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger><SelectValue placeholder="Seleziona agente..." /></SelectTrigger>
              <SelectContent>
                {aiAgents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAICallDialog(false)}>Annulla</Button>
            <Button onClick={handleAICall} disabled={callingAI || !selectedAgentId}>
              {callingAI && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Avvia chiamata
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
