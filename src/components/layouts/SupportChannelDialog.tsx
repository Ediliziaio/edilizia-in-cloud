import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Mail, PhoneCall } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SupportChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChat: () => void;
}

export function SupportChannelDialog({ open, onOpenChange, onOpenChat }: SupportChannelDialogProps) {
  const { user, effectiveCompany } = useAuth();
  const [showCallback, setShowCallback] = useState(false);
  const [phone, setPhone] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [sending, setSending] = useState(false);

  const handleChat = () => {
    onOpenChange(false);
    onOpenChat();
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Richiesta assistenza - ${effectiveCompany?.name || ""}`);
    window.open(`mailto:supporto@ediliziacloud.it?subject=${subject}`, "_blank");
    onOpenChange(false);
  };

  const handleCallback = async () => {
    if (!phone.trim() || !user || !effectiveCompany) return;
    setSending(true);
    const message = `[RICHIAMATA] Telefono: ${phone.trim()}${preferredTime ? ` | Orario preferito: ${preferredTime}` : ""}`;
    await supabase.from("support_messages").insert({
      company_id: effectiveCompany.id,
      sender_id: user.id,
      sender_role: "company",
      message,
    });
    toast.success("Richiesta di richiamata inviata!");
    setPhone("");
    setPreferredTime("");
    setShowCallback(false);
    setSending(false);
    onOpenChange(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) setShowCallback(false);
    onOpenChange(v);
  };

  const channels = [
    {
      icon: MessageSquare,
      title: "Chat in tempo reale",
      description: "Parla subito con il nostro team di supporto",
      onClick: handleChat,
    },
    {
      icon: Mail,
      title: "Invia email",
      description: "Scrivi a supporto@ediliziacloud.it",
      onClick: handleEmail,
    },
    {
      icon: PhoneCall,
      title: "Richiedi richiamata",
      description: "Ti ricontattiamo noi all'orario che preferisci",
      onClick: () => setShowCallback(true),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Come possiamo aiutarti?</DialogTitle>
          <DialogDescription>Scegli il canale di assistenza che preferisci</DialogDescription>
        </DialogHeader>

        {showCallback ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Numero di telefono *</label>
              <Input
                placeholder="+39 333 1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Orario preferito</label>
              <Input
                placeholder="es. 10:00 - 12:00"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCallback(false)}>
                Indietro
              </Button>
              <Button className="flex-1" onClick={handleCallback} disabled={!phone.trim() || sending}>
                {sending ? "Invio..." : "Invia richiesta"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((ch) => (
              <Card
                key={ch.title}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={ch.onClick}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <ch.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{ch.title}</p>
                    <p className="text-sm text-muted-foreground">{ch.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
