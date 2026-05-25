/**
 * ConfirmWithPasswordDialog — re-auth con password prima di azioni distruttive.
 *
 * Pattern di sicurezza standard (Google/Stripe/GitHub usano questo prima di
 * delete account / API key reveal / payout settings).
 *
 * Razionale: Florin con sessione attiva può resettare password a chiunque
 * o cancellare utenti senza secondo fattore. Una sessione rubata (es. token
 * leak) potrebbe fare danni gravi. Richiedere la password prima dell'azione
 * limita drasticamente il blast radius.
 *
 * Implementazione: usa Supabase `signInWithPassword` come ré-validation
 * della password attuale (NON crea una nuova sessione, ma fallisce se la
 * password è sbagliata).
 *
 * Uso:
 *   <ConfirmWithPasswordDialog
 *     open={confirmOpen}
 *     onOpenChange={setConfirmOpen}
 *     title="Rimuovere utente dal team?"
 *     description="L'utente perderà accesso. Inserisci la tua password per confermare."
 *     destructiveLabel="Rimuovi utente"
 *     onConfirmed={() => deleteMutation.mutate(target.id)}
 *   />
 */
import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  /** Label del bottone destructive (es. "Rimuovi utente", "Reimposta password"). */
  destructiveLabel: string;
  /** Callback eseguito DOPO password verificata correttamente. */
  onConfirmed: () => void | Promise<void>;
}

export function ConfirmWithPasswordDialog({
  open,
  onOpenChange,
  title,
  description,
  destructiveLabel,
  onConfirmed,
}: Props) {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPassword("");
    setBusy(false);
  };

  const handleClose = (next: boolean) => {
    if (busy) return; // niente close durante verifica
    if (!next) reset();
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (!user?.email) {
      toast.error("Sessione utente non disponibile");
      return;
    }
    if (!password.trim()) {
      toast.error("Inserisci la password per confermare");
      return;
    }
    setBusy(true);
    try {
      // Re-validate password — Supabase signInWithPassword non crea una NUOVA
      // sessione, fa solo refresh dell'access token. Se la password è sbagliata,
      // ritorna error.
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password.trim(),
      });
      if (error) {
        toast.error("Password non corretta", { description: "Riprova" });
        setPassword("");
        return;
      }
      await onConfirmed();
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error("Verifica password fallita", {
        description: (err as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-500" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">{description}</span>
            <span className="block text-xs text-muted-foreground">
              Per ragioni di sicurezza, inserisci la tua password admin per confermare.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="confirm-password" className="text-sm">
            La tua password
          </Label>
          <Input
            id="confirm-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) void handleConfirm();
            }}
            autoFocus
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={busy || !password.trim()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {destructiveLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
