import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSimulateMessage, useAnalyzeMessage } from "@/hooks/useMessagingData";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (conversationId: string) => void;
}

export function SimulateMessageDialog({ open, onOpenChange, onCreated }: Props) {
  const [contactName, setContactName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+39");
  const [contactType, setContactType] = useState("cliente");
  const [messageType, setMessageType] = useState("text");
  const [content, setContent] = useState("");

  const simulateMsg = useSimulateMessage();
  const analyzeMsg = useAnalyzeMessage();
  const { effectiveCompany } = useAuth();

  const handleSubmit = async () => {
    if (!content.trim()) return;

    const result = await simulateMsg.mutateAsync({
      contactName: contactName || "Contatto simulato",
      phoneNumber,
      contactType,
      messageType,
      content: content.trim(),
    });

    // Auto-analyze
    if (effectiveCompany?.id) {
      analyzeMsg.mutate({ messageId: result.messageId, companyId: effectiveCompany.id });
    }

    onCreated?.(result.conversationId);
    onOpenChange(false);
    setContactName("");
    setPhoneNumber("+39");
    setContent("");
  };

  const isLoading = simulateMsg.isPending || analyzeMsg.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Simula Messaggio in Arrivo</DialogTitle>
          <DialogDescription>
            Simula un messaggio WhatsApp per testare il flusso AI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome contatto</Label>
              <Input
                placeholder="Mario Rossi"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Numero</Label>
              <Input
                placeholder="+39 333 1234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo contatto</Label>
              <Select value={contactType} onValueChange={setContactType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="operaio">Operaio</SelectItem>
                  <SelectItem value="collaboratore">Collaboratore</SelectItem>
                  <SelectItem value="sconosciuto">Sconosciuto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo messaggio</Label>
              <Select value={messageType} onValueChange={setMessageType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Testo</SelectItem>
                  <SelectItem value="audio">Audio (simula trascrizione)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              {messageType === "audio" ? "Trascrizione audio simulata" : "Testo messaggio"}
            </Label>
            <Textarea
              placeholder="Es: Mancano i coprifili nel cantiere Rossi, serve urgente..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={!content.trim() || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Invia e Analizza
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
