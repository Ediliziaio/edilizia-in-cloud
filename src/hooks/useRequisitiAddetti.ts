import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "./usePermissions";
import type {
  QuadroAddetti,
  DatiRiesameAddetti,
  RegistroRiesameAddetti,
} from "@/lib/sicurezza/requisitiAddetti";
export function useAddettiCommessa(
  company: string,
  ordine: string,
  dal: string,
  al: string,
  fase: string | null,
  attivo: boolean,
) {
  const p = usePermissions();
  return useQuery({
    refetchInterval: attivo ? 30000 : false,
    queryKey: ["addetti-qualifiche-commessa", company, ordine, dal, al, fase],
    enabled:
      attivo &&
      p.canViewSicurezzaCantiere &&
      !!company &&
      !!ordine &&
      !!dal &&
      !!al &&
      al >= dal,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "sicurezza_addetti_commessa" as never,
        {
          _company: company,
          _ordine: ordine,
          _dal: dal,
          _al: al,
          _fase: fase,
        } as never,
      );
      if (error)
        throw Object.assign(new Error(error.message), { code: error.code });
      const q = data as unknown as QuadroAddetti;
      if (
        !q ||
        q.company_id !== company ||
        q.order_id !== ordine ||
        q.dal !== dal ||
        q.al !== al ||
        q.fase_id !== fase ||
        !Array.isArray(q.persone) ||
        q.persone.length > 100 ||
        !Array.isArray(q.da_collegare) ||
        q.da_collegare.length > 100 ||
        !Array.isArray(q.qualifiche) ||
        q.qualifiche.length > 500 ||
        !/^[0-9a-f]{64}$/i.test(q.impronta)
      )
        throw new Error("Organico e qualifiche non pertinenti o incompleti");
      return q;
    },
  });
}
export function useStoricoAddetti(
  company: string,
  ordine: string,
  dal: string,
  al: string,
  fase: string | null,
  revisioni: boolean,
  attivo: boolean,
) {
  const p = usePermissions();
  return useQuery({
    refetchInterval: attivo ? 30000 : false,
    queryKey: ["riesami-addetti", company, ordine, dal, al, fase, revisioni],
    enabled:
      attivo &&
      p.canViewSicurezzaCantiere &&
      !!company &&
      !!ordine &&
      !!dal &&
      !!al &&
      al >= dal,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "sicurezza_addetti_storico" as never,
        {
          _company: company,
          _ordine: ordine,
          _dal: dal,
          _al: al,
          _fase: fase,
          _revisioni: revisioni,
        } as never,
      );
      if (error)
        throw Object.assign(new Error(error.message), { code: error.code });
      const q = data as unknown as {
        company_id: string;
        order_id: string;
        dal: string;
        al: string;
        fase_id: string | null;
        revisioni: boolean;
        registrazioni: RegistroRiesameAddetti[];
      };
      if (
        !q ||
        q.company_id !== company ||
        q.order_id !== ordine ||
        q.dal !== dal ||
        q.al !== al ||
        q.fase_id !== fase ||
        q.revisioni !== revisioni ||
        !Array.isArray(q.registrazioni) ||
        q.registrazioni.length > 50 ||
        q.registrazioni.some(
          (r) => r.company_id !== company || r.order_id !== ordine,
        )
      )
        throw new Error("Storico addetti non pertinente o incompleto");
      return q.registrazioni;
    },
  });
}
export interface ScriviRiesameAddetti {
  id: string;
  precedente: string | null;
  fase: string | null;
  dal: string;
  al: string;
  impronta: string;
  dati: DatiRiesameAddetti;
}
export function useRegistraRiesameAddetti(company: string, ordine: string) {
  const qc = useQueryClient(),
    p = usePermissions();
  return useMutation({
    mutationFn: async (r: ScriviRiesameAddetti) => {
      if (!p.canViewSicurezzaCantiere || p.solaLettura)
        throw new Error("Non puoi registrare il riesame");
      const { data, error } = await supabase.rpc(
        "sicurezza_registra_addetti" as never,
        {
          _id: r.id,
          _company: company,
          _ordine: ordine,
          _fase: r.fase,
          _dal: r.dal,
          _al: r.al,
          _precedente: r.precedente,
          _impronta: r.impronta,
          _dati: r.dati,
        } as never,
      );
      if (error)
        throw Object.assign(new Error(error.message), { code: error.code });
      const a = data as unknown as {
        id: string;
        famiglia_id: string;
        versione: number;
        stato: string;
      };
      if (
        a?.id !== r.id ||
        !a.famiglia_id ||
        !Number.isInteger(a.versione) ||
        a.versione < 1 ||
        !["parziale", "da_integrare", "riscontri_registrati"].includes(
          a.stato,
        ) ||
        (!r.precedente && (a.famiglia_id !== r.id || a.versione !== 1))
      )
        throw new Error(
          "Registrazione non confermata: rileggi lo storico e ritenta con la stessa richiesta",
        );
      return a;
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: ["riesami-addetti", company, ordine],
        }),
        qc.invalidateQueries({
          queryKey: ["addetti-qualifiche-commessa", company, ordine],
        }),
        qc.invalidateQueries({ queryKey: ["pos-riesame-proprio", company, ordine] }),
      ]),
  });
}
export function useDettaglioRiesameAddetti(
  company: string,
  ordine: string,
  id: string,
  attivo: boolean,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["riesame-addetti-dettaglio", company, ordine, id],
    enabled: attivo && p.canViewSicurezzaCantiere && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sicurezza_verifiche_addetti" as never)
        .select("id,company_id,order_id,riscontri")
        .eq("id", id)
        .eq("company_id", company)
        .eq("order_id", ordine)
        .maybeSingle();
      if (error)
        throw Object.assign(new Error(error.message), { code: error.code });
      const q = data as unknown as {
        id: string;
        company_id: string;
        order_id: string;
        riscontri: Array<
          import("@/lib/sicurezza/requisitiAddetti").RiscontroAddetto & {
            persona_snapshot: import("@/lib/sicurezza/requisitiAddetti").PersonaRequisiti;
            requisito_snapshot: {
              nome: string;
              versione: number;
              requisito: {
                titolo: string;
                riferimento: string;
                indicazioni: string;
              };
            };
            qualifica_snapshot:
              | import("@/lib/sicurezza/requisitiAddetti").QualificaContesto
              | null;
          }
        >;
      };
      if (
        !q ||
        q.id !== id ||
        q.company_id !== company ||
        q.order_id !== ordine ||
        !Array.isArray(q.riscontri) ||
        q.riscontri.length > 500
      )
        throw new Error("Riscontri non disponibili per questa registrazione");
      return q.riscontri;
    },
  });
}
