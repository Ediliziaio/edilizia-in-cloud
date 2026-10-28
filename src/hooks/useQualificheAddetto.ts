import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "./usePermissions";
import type {
  DatiQualifica,
  QuadroQualifiche,
  TipoPersonaQualifica,
} from "@/lib/sicurezza/qualificheAddetti";
export const chiaveQualifiche = (
  company: string,
  tipo: TipoPersonaQualifica,
  persona: string,
) => ["qualifiche-addetto", company, tipo, persona];
export function useQualificheAddetto(
  company: string,
  tipo: TipoPersonaQualifica,
  persona: string,
  attivo = true,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: chiaveQualifiche(company, tipo, persona),
    enabled:
      attivo &&
      !!company &&
      !!persona &&
      (tipo === "hr"
        ? p.canViewPersone || p.canViewSicurezzaCantiere
        : p.canViewSicurezzaCantiere),
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "sicurezza_qualifiche_quadro" as never,
        { _company: company, _tipo: tipo, _persona: persona } as never,
      );
      if (error) throw error;
      const q = data as unknown as QuadroQualifiche;
      if (
        !q ||
        q.company_id !== company ||
        q.persona?.id !== persona ||
        q.persona.tipo !== tipo ||
        !Array.isArray(q.fonti) ||
        !Array.isArray(q.registrazioni) ||
        q.fonti.length > 200 ||
        q.registrazioni.length > 200
      )
        throw new Error("Quadro qualifiche non pertinente o incompleto");
      return q;
    },
  });
}
export interface RegistraQualifica {
  id: string;
  precedente: string | null;
  azione: "riesamina" | "revoca";
  fonte: string | null;
  impronta: string | null;
  dati: DatiQualifica | null;
  motivo: string;
}
export function useRegistraQualifica(
  company: string,
  tipo: TipoPersonaQualifica,
  persona: string,
) {
  const qc = useQueryClient(),
    p = usePermissions();
  return useMutation({
    mutationFn: async (r: RegistraQualifica) => {
      if (
        p.solaLettura ||
        !(tipo === "hr" ? p.canViewPersone : p.canViewSicurezzaCantiere)
      )
        throw new Error("Non puoi gestire le qualifiche di questa persona");
      const { data, error } = await supabase.rpc(
        "sicurezza_qualifica_registra" as never,
        {
          _id: r.id,
          _company: company,
          _tipo: tipo,
          _persona: persona,
          _precedente: r.precedente,
          _azione: r.azione,
          _fonte: r.fonte,
          _impronta: r.impronta,
          _dati: r.dati,
          _motivo: r.motivo,
        } as never,
      );
      if (error) throw error;
      const a = data as unknown as {
        id: string;
        versione: number;
        famiglia_id: string;
      };
      if (
        a?.id !== r.id ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          a.famiglia_id || "",
        ) ||
        !Number.isInteger(a.versione) ||
        a.versione < 1 ||
        (!r.precedente && (a.famiglia_id !== r.id || a.versione !== 1))
      )
        throw new Error(
          "Registrazione non confermata: rileggi lo storico e riprova con la stessa richiesta",
        );
      return a;
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: chiaveQualifiche(company, tipo, persona),
        }),
        qc.invalidateQueries({
          queryKey: ["addetti-qualifiche-commessa", company],
        }),
        qc.invalidateQueries({ queryKey: ["pos-riesame-proprio", company] }),
      ]),
  });
}
