/**
 * UnlockFeatureDialog — v8.6.62
 *
 * Dialog mostrato quando l'utente clicca un'azione in modalità preview.
 * Spiega che la feature è in demo, offre form per richiedere lo sblocco
 * (crea ticket feature_unlock_requests assegnato al consulente).
 */
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, MessageSquare, Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chiave feature da sbloccare (es. "render_ai"). */
  featureKey: string;
  /** Nome user-friendly da mostrare nel dialog. */
  featureLabel: string;
  /** Etichetta dell'azione che l'utente ha tentato (es. "Genera render"). */
  actionLabel?: string;
}

export function UnlockFeatureDialog({
  open, onOpenChange, featureKey, featureLabel, actionLabel,
}: Props) {
  const { user, effectiveCompany } = useAuth();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!effectiveCompany?.id) {
      toast.error("Sessione non valida");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase
        .from("feature_unlock_requests" as never)
        .insert({
          company_id: effectiveCompany.id,
          feature_key: featureKey,
          requested_by: user?.id ?? null,
          requested_email: user?.email ?? null,
          message: message.trim() || null,
          source_url: window.location.pathname + window.location.search,
          action_label: actionLabel ?? null,
        } as never);
      if (error) throw error;
      setSent(true);
      toast.success("Richiesta inviata al tuo consulente");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore";
      toast.error("Errore nell'invio: " + msg);
    } finally {
      setSending(false);
    }
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      // Reset per la prossima apertura
      setTimeout(() => { setMessage(""); setSent(false); }, 200);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {sent ? (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <DialogTitle className="text-center">Richiesta inviata</DialogTitle>
              <DialogDescription className="text-center">
                Il tuo consulente ti contatterà a breve per sbloccare <strong>{featureLabel}</strong>.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button className="w-full" onClick={() => handleClose(false)}>OK</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-amber-600" />
              </div>
              <DialogTitle className="text-center">Sblocca {featureLabel}</DialogTitle>
              <DialogDescription className="text-center">
                Stai usando <strong>{featureLabel}</strong> in modalità demo.
                {actionLabel && <> Per {actionLabel.toLowerCase()} ti serve l'accesso completo.</>}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Contatta il tuo consulente per attivare la funzione. Ti risponderà
                entro 24 ore con dettagli e prezzi.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="unlock-msg" className="text-xs">
                  Aggiungi un messaggio (opzionale)
                </Label>
                <Textarea
                  id="unlock-msg"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Es: vorrei usare questa funzione per il progetto X..."
                  rows={3}
                  maxLength={500}
                />
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={sending}>
                Più tardi
              </Button>
              <Button onClick={handleSubmit} disabled={sending}>
                {sending ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Invio…</>
                ) : (
                  <><MessageSquare className="h-4 w-4 mr-1.5" />Contatta consulente</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
