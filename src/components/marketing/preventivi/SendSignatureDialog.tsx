import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Send, Loader2, CheckCircle, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface SendSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientEmail: string | null;
  clientName: string | null;
  quoteNumber: string;
  onSend: () => Promise<any>;
  isSending: boolean;
  signatureLink?: string | null;
}

export function SendSignatureDialog({
  open,
  onOpenChange,
  clientEmail,
  clientName,
  quoteNumber,
  onSend,
  isSending,
  signatureLink,
}: SendSignatureDialogProps) {
  const [sent, setSent] = useState(false);
  const [resultLink, setResultLink] = useState<string | null>(signatureLink || null);

  const handleSend = async () => {
    try {
      const result = await onSend();
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

  const handleClose = (v: boolean) => {
    if (!v) {
      setSent(false);
      setResultLink(signatureLink || null);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
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
                <Label>Destinatario</Label>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{clientName || "Cliente"}</span>
                  <span className="text-muted-foreground">({clientEmail || "nessuna email"})</span>
                </div>
              </div>

              {!clientEmail && (
                <p className="text-sm text-destructive">
                  Il cliente non ha un indirizzo email. Aggiungilo prima di inviare.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Annulla
              </Button>
              <Button onClick={handleSend} disabled={isSending || !clientEmail}>
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
              <Button onClick={() => handleClose(false)}>Chiudi</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
