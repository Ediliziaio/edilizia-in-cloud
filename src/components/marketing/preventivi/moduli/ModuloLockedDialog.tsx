import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ModuloVenditaView } from "@/lib/moduli-vendita";

interface ModuloLockedDialogProps {
  view: ModuloVenditaView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog informativo per modulo bloccato (stato "bloccato"):
 *  - mostra descrizione lunga + lista benefici + prezzo indicativo
 *  - permette di richiedere l'attivazione tramite edge function
 *    `richiesta-attivazione-modulo`; conferma solo con risposta positiva.
 */
export function ModuloLockedDialog({ view, open, onOpenChange }: ModuloLockedDialogProps) {
  const { effectiveCompany, user } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const sendingRef = useRef(false);

  if (!view) return null;
  const { modulo } = view;
  const Icon = modulo.icon;

  const handleRichiediAttivazione = async () => {
    if (sendingRef.current) return;
    if (!effectiveCompany?.id || !user?.id) {
      toast.error("Impossibile inviare la richiesta", {
        description: "Sessione non valida, ricarica la pagina e riprova.",
      });
      return;
    }
    sendingRef.current = true;
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("richiesta-attivazione-modulo", {
        body: {
          companyId: effectiveCompany.id,
          userId: user.id,
          moduloSlug: modulo.slug,
          moduloNome: modulo.nome,
          featureKey: modulo.flag,
        },
      });
      if (error) throw error;
      if (data?.ok !== true) throw new Error("Il servizio non ha confermato la ricezione.");
      toast.success("Richiesta inviata", {
        description: `Ti contatteremo a breve per attivare il modulo ${modulo.nome}.`,
      });
      onOpenChange(false);
    } catch {
      // Un errore di rete/404 non prova che la richiesta sia stata registrata.
      toast.error("Invio non confermato", {
        description: "Non abbiamo conferma della ricezione. Riprova più tardi oppure contatta il supporto.",
      });
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <Badge variant="outline" className="border-primary/30 text-primary">
              <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
              Modulo Premium
            </Badge>
          </div>
          <DialogTitle className="text-2xl">Modulo {modulo.nome}</DialogTitle>
          <DialogDescription className="text-base">{modulo.descrizione}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold">Cosa include</h4>
            <ul className="space-y-2">
              {modulo.benefici.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Prezzo indicativo</span>
              <span className="text-lg font-bold">
                {new Intl.NumberFormat("it-IT", {
                  style: "currency",
                  currency: "EUR",
                  maximumFractionDigits: 0, useGrouping: "always" }).format(modulo.prezzoMensile)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/mese</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Il prezzo finale può variare in base al piano e a eventuali condizioni speciali.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Chiudi
          </Button>
          <Button onClick={handleRichiediAttivazione} disabled={isSending}>
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Invio in corso...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                Richiedi attivazione
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
