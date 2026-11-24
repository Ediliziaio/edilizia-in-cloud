import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
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
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  userId: string;
  isBlocked: boolean;
  blockedAt?: string | null;
  blockReason?: string | null;
  /** Solo l'amministratore (lo rifiuta il server a chiunque altro), mai su se stesso né su un altro amministratore. */
  puoBloccare: boolean;
  compatto?: boolean;
}

/** Blocca o ripristina l'accesso di una persona senza cancellare niente: dati e storico restano a suo nome. */
export function BloccoAccessoCard({ userId, isBlocked, blockedAt, blockReason, puoBloccare, compatto }: Props) {
  const t = useT();
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const cambiaAccesso = useMutation({
    mutationFn: async (blocca: boolean) => {
      const { error, count } = await supabase
        .from("profiles")
        .update({
          is_blocked: blocca,
          blocked_at: blocca ? new Date().toISOString() : null,
          blocked_by: blocca ? user?.id ?? null : null,
          block_reason: blocca ? "Bloccato dall'amministratore" : null,
        } as never, { count: "exact" })
        .eq("id", userId);
      if (error) throw error;
      if (count === 0) throw new Error("Account non aggiornato");
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
      queryClient.invalidateQueries({ queryKey: ["stati-app-operai"] });
      toast({
        title: blocca ? t("Accesso bloccato") : t("Accesso ripristinato"),
        description: blocca ? t("Non può più entrare, e non vede più niente anche se era già dentro.") : t("Può di nuovo accedere."),
      });
    },
    onError: () => toast({ title: t("Errore"), description: t("Impossibile modificare lo stato dell'accesso."), variant: "destructive" }),
  });

  if (!puoBloccare) return null;

  return (
    <div
      className={compatto ? "inline-flex" : `flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 max-sm:px-3 max-sm:py-2 ${
        isBlocked ? "border-destructive/50 bg-destructive/5" : "bg-card"
      }`}
    >
      {!compatto && <div className="flex min-w-0 items-start gap-2">
        {isBlocked
          ? <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />}
        <div className="min-w-0">
          <p className={`text-sm font-medium max-sm:text-xs ${isBlocked ? "text-destructive" : ""}`}>
            {isBlocked ? t("Accesso bloccato") : <><span className="max-sm:hidden">{t("Accesso all'app consentito")}</span><span className="sm:hidden">{t("Accesso consentito")}</span></>}
          </p>
          {/* Mobile: la spiegazione resta solo nella conferma. */}
          <p className={`text-xs text-muted-foreground ${isBlocked ? "" : "max-sm:hidden"}`}>
            {isBlocked
              ? [blockedAt && t("Dal {data}", { data: format(new Date(blockedAt), "dd/MM/yyyy HH:mm", { locale: dateFnsCampo() }) }), blockReason].filter(Boolean).join(" · ") || t("Non può entrare.")
              : t("Per chi non lavora più qui: blocca l'accesso invece di eliminare, dati e storico restano.")}
          </p>
        </div>
      </div>}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          {isBlocked ? (
            <Button variant="outline" size="sm" className="shrink-0" disabled={cambiaAccesso.isPending}>
              <ShieldCheck className="mr-1.5 h-4 w-4 text-green-600" /> {t("Ripristina accesso")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10" disabled={cambiaAccesso.isPending}>
              <ShieldOff className="mr-1.5 h-4 w-4" /> {t("Blocca accesso")}
            </Button>
          )}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isBlocked ? t("Ripristinare l'accesso?") : t("Bloccare l'accesso?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {isBlocked
                ? t("Potrà di nuovo entrare e ritroverà tutto come prima.")
                : t("Non potrà più entrare, e anche se è già dentro non vedrà più niente. Non si cancella nulla: contatti, opportunità, note e storico restano a suo nome, e l'accesso si può ripristinare quando vuoi.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cambiaAccesso.mutate(!isBlocked)}
              className={isBlocked ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            >
              {isBlocked ? t("Ripristina accesso") : t("Blocca accesso")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
