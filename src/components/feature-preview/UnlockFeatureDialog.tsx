/**
 * UnlockFeatureDialog — v8.6.63
 *
 * Dialog mostrato quando l'utente clicca un'azione in modalità demo.
 *
 * Layout migliorato:
 *  - Hero con gradient + icona Sparkles
 *  - "Cosa otterrai sbloccando": lista benefit (3-5 punti)
 *  - Form messaggio opzionale + invio ticket
 *  - 3 modi rapidi: WhatsApp consulente, Email, Form interno
 *  - Stato success con conferma + tempo risposta
 *  - WhatsApp Business: l'add-on si compra da qui (AddonWhatsAppOfferta), il
 *    consulente resta come seconda strada
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
import {
  Sparkles, MessageSquare, Loader2, CheckCircle2, Check, Phone, Mail, Clock,
} from "lucide-react";
import { AddonWhatsAppOfferta } from "@/components/billing/AddonWhatsAppOfferta";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureKey: string;
  featureLabel: string;
  /** Etichetta azione tentata (es. "Genera render"). */
  actionLabel?: string;
  /** Descrizione di cosa fa la feature. */
  description?: string;
  /** Lista bullet points dei benefici (3-5 punti consigliati). */
  benefits?: string[];
}

const DEFAULT_BENEFITS = [
  "Uso illimitato (no limiti demo)",
  "Salvataggio e cronologia",
  "Integrazione con gli altri moduli",
  "Supporto prioritario",
];

const DEFAULT_DESCRIPTION = "Sbloccando questa funzione potrai usarla davvero, senza limiti demo.";

export function UnlockFeatureDialog({
  open, onOpenChange, featureKey, featureLabel, actionLabel,
  description = DEFAULT_DESCRIPTION,
  benefits = DEFAULT_BENEFITS,
}: Props) {
  const { user, effectiveCompany } = useAuth();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // WhatsApp Business è un add-on che l'azienda attiva da sola, pagando.
  const eAddonWhatsApp = featureKey === "whatsapp";
  const etichetta = eAddonWhatsApp ? "WhatsApp Business" : featureLabel;

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
      // toast inline non serve: lo stato success è chiaro
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore";
      toast.error("Errore nell'invio: " + msg);
    } finally {
      setSending(false);
    }
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setTimeout(() => { setMessage(""); setSent(false); }, 200);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        {sent ? (
          /* ─── SUCCESS STATE ───────────────────────────────────────────── */
          <div className="px-6 py-8">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <DialogHeader className="text-center">
              <DialogTitle className="text-xl">Richiesta inviata ✓</DialogTitle>
              <DialogDescription className="mt-2">
                Il tuo consulente è stato avvisato. Ti contatterà a breve per attivare
                <strong className="text-foreground"> {etichetta}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-5 rounded-lg bg-muted/60 px-4 py-3 flex items-center gap-3 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">
                Tempo medio di risposta: <strong className="text-foreground">entro 24h lavorative</strong>
              </span>
            </div>
            <DialogFooter className="mt-5">
              <Button className="w-full" onClick={() => handleClose(false)}>
                Continua a esplorare
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* ─── REQUEST STATE ───────────────────────────────────────────── */
          <>
            {/* Hero con gradient */}
            <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-amber-950/30 px-6 pt-6 pb-5 border-b">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-sm">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-lg leading-tight">
                    {eAddonWhatsApp ? "Attiva WhatsApp Business" : `Sblocca ${featureLabel}`}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm">
                    {actionLabel ? (
                      <>Per <strong className="text-foreground">{actionLabel.toLowerCase()}</strong> ti serve l'accesso completo.</>
                    ) : (
                      <>Stai esplorando la versione demo.</>
                    )}
                  </DialogDescription>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {eAddonWhatsApp ? (
                <AddonWhatsAppOfferta />
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{description}</p>

                  {/* Benefits */}
                  {benefits.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Cosa otterrai
                      </p>
                      <ul className="space-y-1.5">
                        {benefits.map((b, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Message form */}
                  <div className="pt-2 space-y-1.5">
                    <Label htmlFor="unlock-msg" className="text-xs">
                      Aggiungi un messaggio (opzionale)
                    </Label>
                    <Textarea
                      id="unlock-msg"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Es: vorrei usarla per il progetto Rossi…"
                      rows={2}
                      maxLength={500}
                      className="resize-none"
                    />
                    <p className="text-[10px] text-muted-foreground text-right">
                      {message.length}/500
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Footer azioni */}
            <div className="px-6 pb-5 space-y-3">
              <Button
                onClick={handleSubmit}
                disabled={sending}
                variant={eAddonWhatsApp ? "outline" : "default"}
                className={eAddonWhatsApp
                  ? "w-full"
                  : "w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-sm"}
                size={eAddonWhatsApp ? "default" : "lg"}
              >
                {sending ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Invio richiesta…</>
                ) : (
                  <><MessageSquare className="h-4 w-4 mr-1.5" />Contatta il consulente</>
                )}
              </Button>

              <div className="flex items-center gap-2 text-xs">
                <div className="flex-1 h-px bg-border" />
                <span className="text-muted-foreground">oppure direttamente</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href="tel:+393000000000" className="gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    Chiama
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`mailto:info@ediliziaincloud.com?subject=Sblocco%20${encodeURIComponent(etichetta)}&body=Ciao%2C%20vorrei%20attivare%20${encodeURIComponent(etichetta)}%20per%20la%20mia%20azienda.`}
                    className="gap-1.5"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </a>
                </Button>
              </div>

              <button
                onClick={() => handleClose(false)}
                className="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
              >
                Continua a esplorare la demo
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
