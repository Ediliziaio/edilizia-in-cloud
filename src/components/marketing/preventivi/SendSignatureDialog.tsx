import { useState, useEffect, useRef } from "react";
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/**
 * Shape della risposta attesa da `send-quote-signature` edge function,
 * limitata ai soli campi effettivamente letti dal dialog. Campi extra sono
 * tollerati ma non usati: l'edge fn può evolvere senza rompere questo contratto.
 */
export interface SendSignatureResult {
  signature_link?: string;
  expires_at?: string;
  [key: string]: unknown;
}

interface SendSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientEmail: string | null;
  clientName: string | null;
  clientPhone?: string | null;
  quoteNumber: string;
  /** Giorni di validita' scritti nel builder: unica fonte per il default. */
  validityDays?: number | null;
  onSend: (params: SendSignatureParams) => Promise<SendSignatureResult>;
  isSending: boolean;
}

export function SendSignatureDialog({
  open,
  onOpenChange,
  clientEmail,
  clientName,
  clientPhone,
  quoteNumber,
  validityDays,
  onSend,
  isSending,
}: SendSignatureDialogProps) {
  const t = useT();
  const defaultDays = validityDays && validityDays > 0 ? validityDays : 30;
  const [email, setEmail] = useState(clientEmail || "");
  const [name, setName] = useState(clientName || "");
  const [phone, setPhone] = useState(clientPhone || "");
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(defaultDays);
  const [sent, setSent] = useState(false);
  const [resultLink, setResultLink] = useState<string | null>(null);

  const eraAperto = useRef(false);
  // Un refetch dopo l'invio può aggiornare l'anagrafica: il link resta visibile.
  useEffect(() => {
    if (open && !eraAperto.current) {
      setEmail(clientEmail || "");
      setName(clientName || "");
      setPhone(clientPhone || "");
      setMessage("");
      setDays(defaultDays);
      setSent(false);
      setResultLink(null);
    }
    eraAperto.current = open;
  }, [open, clientEmail, clientName, clientPhone, defaultDays]);

  const handleSend = async () => {
    if (!email.trim()) {
      toast.error(t("Inserisci l'email del destinatario"));
      return;
    }
    try {
      const result = await onSend({
        recipientEmail: email.trim(),
        recipientName: name.trim() || "Cliente",
        recipientPhone: phone.trim() || undefined,
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
      toast.success(t("Link copiato!"));
    }
  };

  const generateWhatsAppText = () =>
    encodeURIComponent(
      `Salve${name ? ` ${name}` : ""},\n\n` +
      `Le inviamo il preventivo ${quoteNumber} per la sua approvazione con firma elettronica.\n\n` +
      `Può visualizzare e firmare il preventivo direttamente da questo link:\n` +
      `${resultLink || "[link non disponibile]"}\n\n` +
      `Il link è valido per ${days} giorni.\n\n` +
      `Per qualsiasi informazione è a nostra disposizione.\n\nCordiali saluti.`
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent struttura="scorrevole" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Invia per firma")}</DialogTitle>
          <DialogDescription className="max-sm:sr-only">{t("Invia l'offerta {quoteNumber} al cliente: riceve un'email con il link per leggerla e firmarla.", { quoteNumber: String(quoteNumber ?? "") })}</DialogDescription>
        </DialogHeader>

        {!sent ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sig-email">{t("Email destinatario *")}</Label>
              <Input id="sig-email" type="email" autoComplete="email" className="min-h-11"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sig-name">{t("Nome destinatario")}</Label>
              <Input id="sig-name" autoComplete="name" className="min-h-11"
                value={name} onChange={(e) => setName(e.target.value)} placeholder="Mario Rossi" />
            </div>
            <details className="rounded-lg border px-3">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                {t("Opzioni di invio · {n} giorni", { n: days })}{phone.trim() ? " · SMS" : ""}
              </summary>
              <div className="space-y-3 pb-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                  <div className="space-y-1.5">
                    <Label htmlFor="sig-phone">{t("Cellulare (opzionale)")}</Label>
                    <Input id="sig-phone" type="tel" inputMode="tel" autoComplete="tel" className="min-h-11"
                      value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="333 123 4567" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sig-days">{t("Validità (giorni)")}</Label>
                    <Input id="sig-days" type="number" min={1} max={365} className="min-h-11"
                      value={days} onChange={(e) => setDays(parseInt(e.target.value) || defaultDays)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t("Il codice può arrivare anche via SMS se l'azienda ha credito.")}</p>
                <div className="space-y-1.5">
                  <Label htmlFor="sig-message">{t("Messaggio (opzionale)")}</Label>
                  <Textarea id="sig-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
                </div>
              </div>
            </details>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle className="h-12 w-12 text-primary" />
              <p className="font-medium">{t("Richiesta di firma inviata")}</p>
              <p className="text-sm text-muted-foreground">
                {t("Il cliente può aprire il link e richiedere il codice.")}
              </p>
            </div>

            {resultLink && (
              <div className="space-y-2">
                <Label>{t("Link di firma")}</Label>
                <div className="flex gap-2">
                  <Input aria-label={t("Link di firma")} value={resultLink} readOnly className="min-h-11 text-xs" />
                  <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label={t("Copia link di firma")} onClick={handleCopy}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="size-11 shrink-0" asChild>
                    <a href={resultLink} target="_blank" rel="noopener noreferrer" aria-label={t("Apri link di firma")}>
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
                  const numero = phone.replace(/\D/g, "");
                  const url = numero
                    ? `https://wa.me/${numero}?text=${generateWhatsAppText()}`
                    : `https://wa.me/?text=${generateWhatsAppText()}`;
                  window.open(url, "_blank");
                }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {t("Invia via WhatsApp")}
              </Button>
            )}
          </div>
        )}
        <DialogFooter>
          {sent ? <Button className="min-h-11" onClick={() => onOpenChange(false)}>{t("Chiudi")}</Button> : (
            <>
              <Button variant="outline" className="min-h-11 max-sm:hidden" onClick={() => onOpenChange(false)}>{t("Annulla")}</Button>
              <Button className="min-h-11" onClick={handleSend} disabled={isSending || !email.trim()}>
                {isSending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                {isSending ? t("Invio in corso…") : t("Invia per la firma")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
