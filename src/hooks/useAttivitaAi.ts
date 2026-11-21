import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { AttivitaAi } from "../../shared/aiAttivita";
import type { StatoBollaMonitor, StatoPreventivoMonitor } from "@/lib/ai/attivita";

export const LIMITE_ATTIVITA_AI = 120;
const GIORNO = 24 * 60 * 60 * 1000;
const righeVuote: AttivitaAi[] = [];

export function useAttivitaAi(aperta: boolean) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const ambito = companyId && userId ? `${companyId}:${userId}` : null;
  const queryClient = useQueryClient();
  const [connesso, setConnesso] = useState<string | null>(null);
  const inDiretta = ambito !== null && connesso === ambito;
  const query = useQuery({
    queryKey: ["attivita-ai", ambito, aperta ? "giorno" : "in-corso"],
    enabled: !!ambito,
    refetchInterval: inDiretta ? 30_000 : 12_000,
    queryFn: async ({ signal }) => {
      let richiesta = supabase.from("ai_attivita_live").select("*").eq("company_id", companyId!);
      richiesta = aperta
        ? richiesta.gte("updated_at", new Date(Date.now() - GIORNO).toISOString())
        : richiesta.eq("stato", "in_corso").gte("updated_at", new Date(Date.now() - 8 * 60_000).toISOString());
      const { data, error } = await richiesta.order("updated_at", { ascending: false })
        .limit(LIMITE_ATTIVITA_AI).abortSignal(signal);
      if (error) throw error;
      return data ?? righeVuote;
    },
  });
  const righe = query.data ?? righeVuote;
  const idBolle = Array.from(new Set(righe.flatMap(r => r.bolla_id ? [r.bolla_id] : []))).sort();
  const idRichieste = Array.from(new Set(righe.flatMap(r => r.richiesta?.tipo === "preventivo" ? [r.richiesta.id] : []))).sort();
  const bolle = useQuery<StatoBollaMonitor[]>({
    queryKey: ["ddt-documenti", companyId, userId, "attivita-ai", idBolle],
    enabled: aperta && !!ambito && idBolle.length > 0,
    refetchInterval: 8000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("ddt_document_jobs").select("id,status,updated_at")
        .eq("company_id", companyId!).in("id", idBolle).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });
  const preventivi = useQuery<StatoPreventivoMonitor[]>({
    queryKey: ["attivita-ai-preventivi", ambito, idRichieste],
    enabled: aperta && !!ambito && idRichieste.length > 0,
    refetchInterval: 8000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("quotes").select("id,ai_richiesta_id,ai_richiesta_salvata_il")
        .eq("company_id", companyId!).in("ai_richiesta_id", idRichieste).is("deleted_at", null)
        .order("ai_richiesta_salvata_il", { ascending: false, nullsFirst: false }).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!ambito || !companyId) return;
    let attivo = true;
    let timer: number | undefined;
    const aggiorna = () => {
      if (timer !== undefined || !attivo) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void queryClient.invalidateQueries({ queryKey: ["attivita-ai", ambito] });
      }, 160);
    };
    const channel = supabase.channel(`attivita-ai:${companyId}:${crypto.randomUUID()}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "ai_attivita_live", filter: `company_id=eq.${companyId}`,
      }, aggiorna)
      .subscribe(stato => {
        if (!attivo) return;
        setConnesso(stato === "SUBSCRIBED" ? ambito : null);
        if (stato === "SUBSCRIBED") aggiorna();
      });
    return () => {
      attivo = false;
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [ambito, companyId, queryClient]);

  function refetch() {
    return Promise.allSettled([
      query.refetch(),
      ...(idBolle.length ? [bolle.refetch()] : []),
      ...(idRichieste.length ? [preventivi.refetch()] : []),
    ]);
  }

  return {
    ...query, righe, refetch, isFetching: query.isFetching || bolle.isFetching || preventivi.isFetching,
    esiti: { bolle: bolle.data, preventivi: preventivi.data }, inDiretta, ambito,
  };
}
