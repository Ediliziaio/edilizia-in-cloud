/** La voce «Elimina» nel menu di una scheda: conferma, poi cancella cliente o committente col suo account. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import { queryKeys } from "@/lib/queryKeys";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function VoceEliminaCliente({
  id,
  commesse,
  chi = "cliente",
  tornaA = "/azienda/clienti",
  avviso,
}: {
  id: string;
  /** Quante commesse ha: con almeno una non si può eliminare. */
  commesse: number;
  chi?: "cliente" | "committente";
  tornaA?: string;
  /** Una frase in più nella conferma: cosa sparisce insieme. */
  avviso?: string;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inCorso, setInCorso] = useState(false);
  const Chi = chi === "cliente" ? "Cliente" : "Committente";
  const quanteCommesse = `${commesse} ${commesse === 1 ? "ordine associato" : "ordini associati"}`;

  const elimina = async () => {
    if (commesse > 0) {
      toast({ title: "Impossibile eliminare", description: `Il ${chi} ha ${quanteCommesse}. Elimina prima gli ordini.`, variant: "destructive" });
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
      toast({ title: `${Chi} eliminato`, description: `Il ${chi} è stato eliminato con successo.` });
      navigate(tornaA);
    } catch (error: unknown) {
      logger.error("Error deleting customer:", error);
      toast({ title: "Errore", description: error instanceof Error ? error.message : `Impossibile eliminare il ${chi}.`, variant: "destructive" });
    } finally {
      setInCorso(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={inCorso} className="text-destructive focus:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Elimina {chi}
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare questo {chi}?</AlertDialogTitle>
          <AlertDialogDescription>
            {commesse > 0
              ? `Impossibile eliminare: il ${chi} ha ${quanteCommesse}. Elimina prima gli ordini.`
              : `Questa azione è irreversibile. Il ${chi} e il suo account verranno eliminati permanentemente.${avviso ? ` ${avviso}` : ""}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          {commesse === 0 && (
            <AlertDialogAction onClick={elimina} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {inCorso ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Elimina
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
