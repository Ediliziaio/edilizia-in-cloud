import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, Loader2, CheckCircle, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { SendSignatureParams } from "@/hooks/useSignatureActions";

interface SendSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientEmail: string | null;
  clientName: string | null;
  quoteNumber: string;
  onSend: (params: SendSignatureParams) => Promise<any>;
  isSending: boolean;
}

export function SendSignatureDialog({
  open,
  onOpenChange,
  clientEmail,
  clientName,
  quoteNumber,
  onSend,
  isSending,
}: SendSignatureDialogProps) {
  const [email, setEmail] = useState(clientEmail || "");
  const [name, setName] = useState(clientName || "");
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(30);
  const [sent, setSent] = useState(false);
  const [resultLink, setResultLink] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setEmail(clientEmail || "");
      setName(clientName || "");
      setMessage("");
      setDays(30);
      setSent(false);
      setResultLink(null);
    }
  }, [open, clientEmail, clientName]);

  const handleSend = async () => {
    if (!email.trim()) {
      toast.error("Inserisci l'email del destinatario");
      return;
    }
    try {
      const result = await onSend({
        recipientEmail: email.trim(),
        recipientName: name.trim() || "Cliente",
        customMessage: message.trim() || undefined,
        expiresDays: days,
      });
      if (result?.signature_link) {
        setResultLink(result.signature_link);
      }
      setSent(true);
    } catch {
      // error handled by mutation
    }
  };

  const handleCopy = () => {
    if (resultLink) {
      navigator.clipboard.writeText(resultLink);
      toast.success("Link copiato!");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invia per Firma</DialogTitle>
          <DialogDescription>
            Invia l'offerta {quoteNumber} al cliente per la firma digitale.
          </DialogDescription>
        </DialogHeader>

        {!sent ? (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="sig-email">Email destinatario *</Label>
                <Input
                  id="sig-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@email.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sig-name">Nome destinatario</Label>
                <Input
                  id="sig-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mario Rossi"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sig-message">Messaggio personalizzato (opzionale)</Label>
                <Textarea
                  id="sig-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Gentile cliente, le invio la nostra migliore offerta..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sig-days">Validità (giorni)</Label>
                <Input
                  id="sig-days"
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value) || 30)}
                  className="max-w-[120px]"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button onClick={handleSend} disabled={isSending || !email.trim()}>
                {isSending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {isSending ? "Invio in corso..." : "Invia Email"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle className="h-12 w-12 text-primary" />
              <p className="font-medium">Offerta inviata con successo!</p>
              <p className="text-sm text-muted-foreground">
                Il cliente riceverà un'email con il link per visualizzare e firmare l'offerta.
              </p>
            </div>

            {resultLink && (
              <div className="space-y-2">
                <Label>Link di firma</Label>
                <div className="flex gap-2">
                  <Input value={resultLink} readOnly className="text-xs" />
                  <Button variant="outline" size="icon" onClick={handleCopy}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" asChild>
                    <a href={resultLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Chiudi</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
