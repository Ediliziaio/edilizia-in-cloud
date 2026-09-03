/**
 * useOperatorePresenza — "sono al pezzo, passatemi pure le chiamate".
 *
 * L'assistente vocale trasferisce solo a chi risulta libero adesso. "Adesso"
 * ha bisogno di due cose: una dichiarazione esplicita (il collega accende
 * l'interruttore) e un battito che dice che è ancora lì. Senza il battito, un
 * "disponibile" acceso il lunedì manderebbe clienti nel vuoto per tutta la
 * settimana, e nessuno se ne accorgerebbe.
 *
 * Il battito parte SOLO da disponibile: chi non riceve chiamate non fa
 * traffico inutile. Lato database la soglia è 3 minuti, qui si batte ogni 60
 * secondi — così un buco di rete non fa sparire nessuno dall'elenco.
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";

const BATTITO_MS = 60_000;

export interface OperatoreLibero {
  user_id: string;
  nome: string;
  telefono: string | null;
}

export function useOperatorePresenza() {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [salvataggio, setSalvataggio] = useState(false);

  // La mia riga: interruttore e numero su cui squillare.
  const mia = useQuery({
    queryKey: ["presenza-mia", companyId, user?.id],
    enabled: !!companyId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operatori_presenza")
        .select("telefono, disponibile, ultimo_segnale, occupato_fino_a")
        .eq("company_id", companyId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) {
        console.error("[presenza] lettura fallita:", error.message);
        return null;
      }
      return data;
    },
  });

  // Chi altro è libero: serve a capire se si può staccare senza lasciare
  // scoperto il telefono.
  const liberi = useQuery({
    queryKey: ["operatori-liberi", companyId],
    enabled: !!companyId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operatori_presenza")
        .select("user_id, telefono, disponibile, ultimo_segnale, occupato_fino_a, profiles!operatori_presenza_user_id_fkey(first_name, last_name, email)")
        .eq("company_id", companyId!)
        .eq("disponibile", true);
      if (error) {
        console.error("[presenza] elenco fallito:", error.message);
        return [];
      }
      const adesso = Date.now();
      return (data ?? [])
        .map((r) => {
          const p = (r.profiles ?? {}) as { first_name?: string; last_name?: string; email?: string };
          const vivo = new Date(r.ultimo_segnale as string).getTime() > adesso - 3 * 60_000;
          const occupato = r.occupato_fino_a ? new Date(r.occupato_fino_a as string).getTime() > adesso : false;
          return {
            user_id: r.user_id as string,
            nome: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Collega",
            telefono: (r.telefono as string | null) ?? null,
            // "Disponibile" non basta: senza battito recente non c'è, e con una
            // chiamata appena passata è occupato.
            libero: vivo && !occupato && !!r.telefono,
            occupato,
            vivo,
          };
        })
        .sort((a, b) => Number(b.libero) - Number(a.libero) || a.nome.localeCompare(b.nome));
    },
  });

  const segnala = useCallback(
    async (disponibile: boolean, telefono?: string | null) => {
      if (!companyId) return;
      const { error } = await supabase.rpc("segnala_presenza_operatore", {
        p_company_id: companyId,
        p_disponibile: disponibile,
        p_telefono: telefono ?? null,
      });
      if (error) throw new Error(error.message);
    },
    [companyId],
  );

  /** Accende o spegne la disponibilità, salvando anche il numero. */
  const impostaDisponibilita = useCallback(
    async (disponibile: boolean, telefono?: string | null) => {
      setSalvataggio(true);
      try {
        await segnala(disponibile, telefono);
        await queryClient.invalidateQueries({ queryKey: ["presenza-mia"] });
        await queryClient.invalidateQueries({ queryKey: ["operatori-liberi"] });
      } finally {
        setSalvataggio(false);
      }
    },
    [segnala, queryClient],
  );

  // Battito: solo mentre sono disponibile.
  const sonoDisponibile = !!mia.data?.disponibile;
  useEffect(() => {
    if (!sonoDisponibile || !companyId) return;
    let vivo = true;
    const battito = () => {
      if (!vivo) return;
      // Il battito NON manda il numero: così non sovrascrive con null quello
      // già salvato (la funzione SQL tiene il vecchio se non ne arriva uno).
      segnala(true).catch((e) => console.warn("[presenza] battito fallito:", e?.message ?? e));
    };
    battito();
    const id = window.setInterval(battito, BATTITO_MS);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [sonoDisponibile, companyId, segnala]);

  return {
    disponibile: sonoDisponibile,
    telefono: (mia.data?.telefono as string | null) ?? "",
    occupatoFinoA: (mia.data?.occupato_fino_a as string | null) ?? null,
    caricamento: mia.isLoading,
    salvataggio,
    impostaDisponibilita,
    colleghi: liberi.data ?? [],
  };
}
