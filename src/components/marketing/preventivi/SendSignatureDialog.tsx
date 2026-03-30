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
  clientPhone?: string | null;
  quoteNumber: string;
  onSend: (params: SendSignatureParams) => Promise<any>;
  isSending: boolean;
}

export function SendSignatureDialog({
  open,
  onOpenChange,
  clientEmail,
  clientName,
  clientPhone,
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

  const generateWhatsAppText = () =>
    encodeURIComponent(
      `Salve${name ? ` ${name}` : ""},\n\n` +
      `Le inviamo il preventivo ${quoteNumber} per la sua approvazione.\n\n` +
      `Può visualizzare e approvare il preventivo direttamente da questo link:\n` +
      `${resultLink || "[link non disponibile]"}\n\n` +
      `Il link è valido per ${days} giorni.\n\n` +
      `Per qualsiasi informazione è a nostra disposizione.\n\nCordiali saluti.`
    );

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

            {resultLink && (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-green-200 text-green-700 hover:bg-green-50"
                onClick={() => {
                  const phone = (clientPhone || "").replace(/\D/g, "");
                  const url = phone
                    ? `https://wa.me/${phone}?text=${generateWhatsAppText()}`
                    : `https://wa.me/?text=${generateWhatsAppText()}`;
                  window.open(url, "_blank");
                }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Invia via WhatsApp
              </Button>
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
