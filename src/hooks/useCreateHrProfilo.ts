import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrProfilo } from "@/types/hr";
import { toast } from "sonner";

export function useCreateHrProfilo() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<HrProfilo>) => {
      if (!companyId) throw new Error("companyId required");

      const { error } = await supabase
        .from("hr_profili")
        .insert({
          company_id: companyId,
          nome: data.nome || "",
          cognome: data.cognome || "",
          tipo_contratto: data.tipo_contratto || "indeterminato",
          orario_tipo: data.orario_tipo || "standard",
          ore_settimanali: data.ore_settimanali ?? 40,
          ore_giornaliere: data.ore_giornaliere ?? 8,
          attivo: data.attivo ?? true,
          mansione: data.mansione,
          reparto: data.reparto,
          responsabile_id: data.responsabile_id || null,
          sede_id: data.sede_id || null,
          codice_fiscale: data.codice_fiscale,
          data_nascita: data.data_nascita,
          email: data.email,
          telefono: data.telefono,
          data_assunzione: data.data_assunzione,
          data_cessazione: data.data_cessazione,
          ccnl: data.ccnl || "Edilizia",
          livello_ccnl: data.livello_ccnl,
          matricola: data.matricola,
          colore_avatar: data.colore_avatar || "#0EA5E9",
          pausa_pranzo_minuti: data.pausa_pranzo_minuti ?? 60,
          ferie_anno_giorni: data.ferie_anno_giorni ?? 26,
          ferie_residue: data.ferie_residue ?? 26,
          permessi_anno_ore: data.permessi_anno_ore ?? 32,
          permessi_residui_ore: data.permessi_residui_ore ?? 32,
          rol_anno_ore: data.rol_anno_ore ?? 0,
          rol_residuo_ore: data.rol_residuo_ore ?? 0,
          badge_id: data.badge_id,
          note_interne: data.note_interne,
          contatto_emergenza_nome: data.contatto_emergenza_nome,
          contatto_emergenza_telefono: data.contatto_emergenza_telefono,
          luogo_nascita: data.luogo_nascita,
          nazionalita: data.nazionalita || "Italiana",
        } as any);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-organigramma"] });
      queryClient.invalidateQueries({ queryKey: ["hr-profili-all"] });
      toast.success("Profilo HR creato con successo");
    },
    onError: (err: any) => {
      toast.error("Errore creazione profilo: " + err.message);
    },
  });
}
