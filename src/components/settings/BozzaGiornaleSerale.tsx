/**
 * «Prepara ogni sera la bozza del giornale»: la colonna è di `companies`, che si
 * scrive con il permesso sul profilo azienda (non con «Configurazione Ordini» come
 * il resto della pagina), e l'interruttore si salva subito.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MessaggioPerUtente, motivoDelRifiuto, righeToccate } from "@/lib/impostazioni/erroriPerUtente";

const chiave = (companyId: string | undefined) => ["giornale-bozza-serale", companyId];

export function useBozzaGiornaleSerale(companyId: string | undefined) {
  return useQuery({
    queryKey: chiave(companyId),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.from("companies").select("giornale_auto_enabled" as never).eq("id", companyId!).maybeSingle();
      if (error) throw error;
      return (data as { giornale_auto_enabled?: boolean } | null)?.giornale_auto_enabled === true;
    },
    enabled: !!companyId,
  });
}

export function BozzaGiornaleSerale({
  companyId, canEdit, evidenziata,
}: { companyId: string; canEdit: boolean; evidenziata?: boolean }) {
  const queryClient = useQueryClient();
  const { data: acceso, isLoading, isError, refetch } = useBozzaGiornaleSerale(companyId);
  const [inSalvataggio, setInSalvataggio] = useState(false);

  const cambia = async (valore: boolean) => {
    setInSalvataggio(true);
    try {
      const { data, error } = await supabase.from("companies")
        .update({ giornale_auto_enabled: valore } as never).eq("id", companyId).select("id");
      if (error) throw error;
      if (righeToccate(data) === 0) throw new MessaggioPerUtente("Il tuo utente non può cambiare le impostazioni dell'azienda: chiedi all'amministratore.");
      queryClient.setQueryData(chiave(companyId), valore);
      void queryClient.invalidateQueries({ queryKey: ["automazioni-che-partono-da-sole", companyId] });
      toast.success(valore ? "Bozza serale accesa" : "Bozza serale spenta");
    } catch (e) {
      toast.error(motivoDelRifiuto(e, "Non sono riuscito a salvare: riprova."));
    } finally {
      setInSalvataggio(false);
    }
  };

  return (
    <SezioneImpostazione
      id="bozza-giornale"
      evidenziata={evidenziata}
      titolo="Bozza del giornale dei lavori"
      descrizione="Si salva subito, senza «Salva modifiche»."
    >
      {isError ? (
        <div className="p-4 text-sm text-muted-foreground">
          Non riesco a leggere questa impostazione.{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <Label htmlFor="bozza-giornale-serale" className="text-sm font-medium">Prepara ogni sera la bozza del giornale</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Ogni sera prepara una bozza per i cantieri con lavoro registrato. Nessuna pagina viene firmata da sola.</p>
            {!canEdit && <p className="mt-1 text-xs text-muted-foreground">La cambia chi può modificare il profilo dell'azienda.</p>}
          </div>
          <Switch
            id="bozza-giornale-serale"
            checked={acceso === true}
            disabled={!canEdit || isLoading || inSalvataggio}
            onCheckedChange={(v) => void cambia(v)}
          />
        </div>
      )}
    </SezioneImpostazione>
  );
}
