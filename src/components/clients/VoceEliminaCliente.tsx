/** La voce «Elimina» nel menu di una scheda: conferma, poi cancella cliente o committente col suo account. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import { queryKeys } from "@/lib/queryKeys";
import { usePermissions } from "@/hooks/usePermissions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function VoceEliminaCliente({
  id,
  commesse,
  chi = "cliente",
  tornaA = "/azienda/clienti",
  avviso,
  disabled = false,
}: {
  id: string;
  /** Quante commesse ha: con almeno una non si può eliminare. */
  commesse: number;
  chi?: "cliente" | "committente";
  tornaA?: string;
  /** Una frase in più nella conferma: cosa sparisce insieme. */
  avviso?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inCorso, setInCorso] = useState(false);
  const permissions = usePermissions();
  const bloccato = disabled || permissions.isLoading || permissions.solaLettura;
  const cli = chi === "cliente";
  const ordini = t(commesse === 1 ? "{n} ordine associato" : "{n} ordini associati", { n: commesse });

  const elimina = async () => {
    if (bloccato || inCorso) return;
    if (commesse > 0) {
      toast({ title: t("Impossibile eliminare"), description: (cli ? t("Il cliente ha {ordini}. Elimina prima gli ordini.", { ordini }) : t("Il committente ha {ordini}. Elimina prima gli ordini.", { ordini })), variant: "destructive" });
      return;
    }
    setInCorso(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("delete-company-user", {
        body: { userId: id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        let body: { error?: string } | null = null;
        try {
          const ctx = (res.error as { context?: unknown }).context;
          if (ctx instanceof Response) body = await ctx.json();
        } catch {
          body = null;
        }
        throw new Error(body?.error || res.error.message || "Errore eliminazione");
      }
      if (res.data?.error) throw new Error(res.data.error);
      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
      toast({ title: cli ? t("Cliente eliminato") : t("Committente eliminato"), description: cli ? t("Il cliente è stato eliminato con successo.") : t("Il committente è stato eliminato con successo.") });
      navigate(tornaA);
    } catch (error: unknown) {
      logger.error("Error deleting customer:", error);
      toast({ title: t("Errore"), description: error instanceof Error ? error.message : (cli ? t("Impossibile eliminare il cliente.") : t("Impossibile eliminare il committente.")), variant: "destructive" });
    } finally {
      setInCorso(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={bloccato || inCorso} className="text-destructive focus:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-2" /> {cli ? t("Elimina cliente") : t("Elimina committente")}
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{cli ? t("Eliminare questo cliente?") : t("Eliminare questo committente?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {commesse > 0
              ? (cli ? t("Impossibile eliminare: il cliente ha {ordini}. Elimina prima gli ordini.", { ordini }) : t("Impossibile eliminare: il committente ha {ordini}. Elimina prima gli ordini.", { ordini }))
              : `${cli ? t("Questa azione è irreversibile. Il cliente e il suo account verranno eliminati permanentemente.") : t("Questa azione è irreversibile. Il committente e il suo account verranno eliminati permanentemente.")}${avviso ? ` ${avviso}` : ""}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
          {commesse === 0 && (
            <AlertDialogAction disabled={bloccato || inCorso} onClick={elimina} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {inCorso ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("Elimina")}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
