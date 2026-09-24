import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  userId: string;
  isBlocked: boolean;
  blockedAt?: string | null;
  blockReason?: string | null;
  /** Amministratore o permesso sulle persone, mai su se stessi né su un amministratore. */
  puoBloccare: boolean;
}

/** Blocca o ripristina l'accesso di una persona senza cancellare niente: dati e storico restano a suo nome. */
export function BloccoAccessoCard({ userId, isBlocked, blockedAt, blockReason, puoBloccare }: Props) {
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const cambiaAccesso = useMutation({
    mutationFn: async (blocca: boolean) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_blocked: blocca,
          blocked_at: blocca ? new Date().toISOString() : null,
          blocked_by: blocca ? user?.id ?? null : null,
          block_reason: blocca ? "Bloccato dall'amministratore" : null,
        } as never)
        .eq("id", userId);
      if (error) throw error;
      if (effectiveCompany?.id && user?.id) {
        await supabase.from("user_audit_log").insert({
          company_id: effectiveCompany.id,
          actor_id: user.id,
          target_user_id: userId,
          action: blocca ? "user_locked" : "user_unlocked",
          details: { source: "scheda_utente", blocked: blocca },
        });
      }
    },
    onSuccess: (_, blocca) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast({
        title: blocca ? "Accesso bloccato" : "Accesso ripristinato",
        description: blocca ? "Non può più entrare, e non vede più niente anche se era già dentro." : "Può di nuovo accedere.",
      });
    },
    onError: () => toast({ title: "Errore", description: "Impossibile modificare lo stato dell'accesso.", variant: "destructive" }),
  });

  if (!puoBloccare) return null;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
        isBlocked ? "border-destructive/50 bg-destructive/5" : "bg-card"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {isBlocked
          ? <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />}
        <div className="min-w-0">
          <p className={`text-sm font-medium ${isBlocked ? "text-destructive" : ""}`}>
            {isBlocked ? "Accesso bloccato" : "Accesso all'app consentito"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isBlocked
              ? [blockedAt && `Dal ${format(new Date(blockedAt), "dd/MM/yyyy HH:mm", { locale: it })}`, blockReason].filter(Boolean).join(" · ") || "Non può entrare."
              : "Per chi non lavora più qui: blocca l'accesso invece di eliminare, dati e storico restano."}
          </p>
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          {isBlocked ? (
            <Button variant="outline" size="sm" className="shrink-0" disabled={cambiaAccesso.isPending}>
              <ShieldCheck className="mr-1.5 h-4 w-4 text-green-600" /> Ripristina accesso
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10" disabled={cambiaAccesso.isPending}>
              <ShieldOff className="mr-1.5 h-4 w-4" /> Blocca accesso
            </Button>
          )}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isBlocked ? "Ripristinare l'accesso?" : "Bloccare l'accesso?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isBlocked
                ? "Potrà di nuovo entrare e ritroverà tutto come prima."
                : "Non potrà più entrare, e anche se è già dentro non vedrà più niente. Non si cancella nulla: contatti, opportunità, note e storico restano a suo nome, e l'accesso si può ripristinare quando vuoi."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cambiaAccesso.mutate(!isBlocked)}
              className={isBlocked ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            >
              {isBlocked ? "Ripristina accesso" : "Blocca accesso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
