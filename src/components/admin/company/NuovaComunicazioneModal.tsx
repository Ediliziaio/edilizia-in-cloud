import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Info } from "lucide-react";
import type { NuovaComunicazione } from "@/hooks/useComunicazioniAzienda";
import { cn } from "@/lib/utils";

const SMS_LIMIT = 160; // 1 SMS standard
const SMS_EXTENDED_LIMIT = 1530; // 10 SMS concatenati max sensato
const EMAIL_OGGETTO_MAX = 200;
const CORPO_MAX = 10_000;

interface NuovaComunicazioneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    data: NuovaComunicazione,
    callbacks: { onSuccess: () => void },
  ) => void;
  isLoading: boolean;
}

const INITIAL_TIPO: NuovaComunicazione["tipo"] = "email";

export function NuovaComunicazioneModal({
  open, onOpenChange, onSubmit, isLoading,
}: NuovaComunicazioneModalProps) {
  const [tipo, setTipo] = useState<NuovaComunicazione["tipo"]>(INITIAL_TIPO);
  const [oggetto, setOggetto] = useState("");
  const [corpo, setCorpo] = useState("");

  const reset = () => {
    setTipo(INITIAL_TIPO);
    setOggetto("");
    setCorpo("");
  };

  // FIX: reset on close — prima riaprendo dopo "Annulla" o ESC vedevi il vecchio testo
  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const handleSubmit = () => {
    const c = corpo.trim();
    if (!c) return;
    if (c.length > CORPO_MAX) return;
    if (oggetto.length > EMAIL_OGGETTO_MAX) return;

    // FIX: reset SOLO su success — prima era pre-success, perdita input on fail.
    onSubmit(
      {
        tipo,
        oggetto: oggetto.trim() || undefined,
        corpo: c,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  // Char count SMS: standard 160, oltre = SMS multipli (concatenazione)
  const corpoLen = corpo.length;
  const smsCount =
    tipo === "sms" ? Math.max(1, Math.ceil(corpoLen / SMS_LIMIT)) : 0;
  const smsOver = tipo === "sms" && corpoLen > SMS_EXTENDED_LIMIT;
  const corpoOver = corpoLen > CORPO_MAX;
  const oggettoOver = oggetto.length > EMAIL_OGGETTO_MAX;

  const canSubmit =
    !!corpo.trim() && !corpoOver && !oggettoOver && !smsOver && !isLoading;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && isLoading) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova Comunicazione</DialogTitle>
          <DialogDescription>
            Invia una comunicazione manuale a questa azienda.
          </DialogDescription>
        </DialogHeader>

        {/* Disclaimer importante: la comunicazione viene loggata ma NON inviata
            realmente da questo flow (al momento è un record audit/storico).
            L'admin deve sapere che questo è un LOG, non un invio reale. */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Questa azione registra la comunicazione nello storico azienda.
            L'invio reale via email/SMS richiede un'integrazione provider
            separata (al momento è solo logging).
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tipo">Tipo</Label>
            <Select
              value={tipo}
              onValueChange={(v) => setTipo(v as NuovaComunicazione["tipo"])}
            >
              <SelectTrigger id="tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="notifica_inapp">Notifica in-app</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipo === "email" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="oggetto">Oggetto</Label>
                <span
                  className={cn(
                    "text-[10px]",
                    oggettoOver ? "text-destructive font-bold" : "text-muted-foreground",
                  )}
                >
                  {oggetto.length}/{EMAIL_OGGETTO_MAX}
                </span>
              </div>
              <Input
                id="oggetto"
                value={oggetto}
                onChange={(e) => setOggetto(e.target.value)}
                placeholder="Oggetto dell'email"
                className={oggettoOver ? "border-destructive" : ""}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="corpo">
                {tipo === "email"
                  ? "Corpo"
                  : tipo === "sms"
                    ? "Testo SMS"
                    : "Testo notifica"}{" "}
                <span className="text-destructive">*</span>
              </Label>
              {tipo === "sms" ? (
                <span
                  className={cn(
                    "text-[10px]",
                    smsOver
                      ? "text-destructive font-bold"
                      : smsCount > 1
                        ? "text-amber-600 font-medium"
                        : "text-muted-foreground",
                  )}
                >
                  {corpoLen}/{SMS_LIMIT * smsCount} char
                  {smsCount > 1 && ` · ${smsCount} SMS`}
                </span>
              ) : (
                <span
                  className={cn(
                    "text-[10px]",
                    corpoOver ? "text-destructive font-bold" : "text-muted-foreground",
                  )}
                >
                  {corpoLen}/{CORPO_MAX}
                </span>
              )}
            </div>
            <Textarea
              id="corpo"
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              placeholder="Inserisci il testo della comunicazione..."
              rows={5}
              className={cn(
                "resize-none",
                (corpoOver || smsOver) && "border-destructive",
              )}
            />
            {tipo === "sms" && smsCount > 1 && !smsOver && (
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                ⚠️ Verrà inviato come {smsCount} SMS concatenati
              </p>
            )}
            {smsOver && (
              <p className="text-[10px] text-destructive">
                Limite SMS: massimo {SMS_EXTENDED_LIMIT} caratteri (10 SMS)
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
