/**
 * «Contabilità generale in casa» (10/11/2026, docs/piano-contabilita-un-posto-solo.md).
 *
 * La partita doppia serve solo a chi tiene la contabilità in casa: con l'interruttore spento la
 * voce non compare nel menu e le scritture non si generano. È una colonna di `companies`
 * (contabilita_generale_attiva): la cambia chi può modificare il profilo dell'azienda, e si salva
 * subito, come la bozza serale del giornale.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MessaggioPerUtente, motivoDelRifiuto, righeToccate } from "@/lib/impostazioni/erroriPerUtente";

const chiave = (companyId: string | undefined) => ["contabilita-generale-attiva", companyId];

/** L'interruttore dell'azienda in uso. `undefined` finché non si sa: il menu mostra la voce solo quando è `true`. */
export function useContabilitaGeneraleAttiva(): { attiva: boolean | undefined; companyId: string | undefined } {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { data } = useQuery({
    queryKey: chiave(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.from("companies").select("contabilita_generale_attiva" as never).eq("id", companyId!).maybeSingle();
      if (error) throw error;
      return (data as { contabilita_generale_attiva?: boolean } | null)?.contabilita_generale_attiva === true;
    },
  });
  return { attiva: data, companyId };
}

export function ContabilitaInCasa({ inLinea = false }: { inLinea?: boolean }) {
  const queryClient = useQueryClient();
  const permessi = usePermissions();
  const { attiva, companyId } = useContabilitaGeneraleAttiva();
  const [inSalvataggio, setInSalvataggio] = useState(false);
  const puo = permessi.isAdmin || permessi.canEditSettingsProfile;

  const cambia = async (valore: boolean) => {
    if (!companyId) return;
    setInSalvataggio(true);
    try {
      const { data, error } = await supabase.from("companies")
        .update({ contabilita_generale_attiva: valore } as never).eq("id", companyId).select("id");
      if (error) throw error;
      if (righeToccate(data) === 0) throw new MessaggioPerUtente("Il tuo utente non può cambiare le impostazioni dell'azienda: chiedi all'amministratore.");
      queryClient.setQueryData(chiave(companyId), valore);
      toast.success(valore ? "Contabilità generale accesa" : "Contabilità generale spenta",
        { description: valore ? "La trovi nel menu Contabilità. Le scritture si fanno da sole ogni quarto d'ora." : "La voce sparisce dal menu; le scritture già fatte restano." });
    } catch (e) {
      toast.error(motivoDelRifiuto(e, "Non sono riuscito a salvare: riprova."));
    } finally {
      setInSalvataggio(false);
    }
  };

  return (
    <div className={inLinea ? "flex items-start justify-between gap-4" : "flex items-start justify-between gap-4 rounded-xl border bg-card p-4"}>
      <div className="min-w-0">
        <Label htmlFor="contabilita-in-casa" className="text-sm font-medium">Contabilità generale in casa (partita doppia)</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Per chi tiene la contabilità con Edilizia in Cloud: libro giornale, mastrini, liquidazione IVA, bilancio, chiusura
          dell'esercizio. Le scritture nascono da sole da fatture, Prima nota, F24 e cedolini. Se i libri li tiene il
          commercialista, lasciala spenta.
        </p>
        {!puo && <p className="mt-1 text-xs text-muted-foreground">La cambia chi può modificare il profilo dell'azienda.</p>}
      </div>
      <Switch
        id="contabilita-in-casa"
        checked={attiva === true}
        disabled={!puo || attiva === undefined || inSalvataggio}
        onCheckedChange={(v) => void cambia(v)}
      />
    </div>
  );
}
