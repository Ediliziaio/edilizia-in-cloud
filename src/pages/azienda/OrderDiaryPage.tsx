import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, ArrowLeft, History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { useOrderDiary } from "@/hooks/useOrderDiary";
import { descrizioneEvento, etichettaEvento } from "@/lib/orders/eventiCommessa";
import { RegistroCommessa } from "@/components/orders/RegistroCommessa";
import { componiRegistro, type AzioneRegistro } from "@/lib/orders/registroCommessa";

interface OrderDiaryOrder {
  id: string;
  order_code: string | null;
  description: string | null;
  created_by: string | null;
}

export default function OrderDiaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();

  const { data: order, isLoading } = useQuery({
    queryKey: queryKeys.orders.diaryHeader(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description, created_by")
        .eq("id", id!)
        .eq("company_id", effectiveCompany!.id)
        .single();
      if (error) throw error;
      return data as OrderDiaryOrder;
    },
    enabled: !!id && !!user && !!effectiveCompany,
  });

  const { events, messages, auditEntries, isLoading: diaryLoading, isError: diaryError } = useOrderDiary(id);

  // Le azioni di tutti sulla commessa, con i valori prima e dopo.
  const { data: azioni = [], isLoading: azioniLoading, isError: azioniError } = useQuery({
    queryKey: ["registro-commessa", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("registro_commessa" as never, { p_order_id: id } as never);
      if (error) throw error;
      return (data ?? []) as unknown as AzioneRegistro[];
    },
    enabled: !!id && !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Gli stati si leggono per nome: nel registro c'è il loro identificativo.
  const { data: stati = {} } = useQuery({
    queryKey: ["registro-commessa-stati", effectiveCompany?.id],
    queryFn: async () => {
      const { data } = await supabase.from("order_statuses").select("id, name").eq("company_id", effectiveCompany!.id);
      return Object.fromEntries((data ?? []).map((s) => [s.id, s.name])) as Record<string, string>;
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 300_000,
  });

  const { data: creatoDa = null } = useQuery({
    queryKey: ["registro-commessa-autore", order?.created_by],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("first_name, last_name, email").eq("id", order!.created_by!).maybeSingle();
      return [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim() || data?.email || null;
    },
    enabled: !!order?.created_by,
    staleTime: 300_000,
  });

  const voci = useMemo(() => componiRegistro({
    azioni,
    eventi: events.map((e) => ({
      id: e.id, event_type: e.event_type, actor_name: e.actor_name, created_at: e.created_at,
      etichetta: etichettaEvento(e.event_type), descrizione: descrizioneEvento(e),
    })),
    audit: auditEntries,
    messaggi: messages,
    stati,
    creatoDa,
  }), [azioni, events, auditEntries, messages, stati, creatoDa]);

  const caricamento = isLoading || diaryLoading || azioniLoading;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={() => navigate(`/azienda/ordini/${id}`)}
            className="flex shrink-0 items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Torna alla commessa</span>
          </button>
          <div className="mx-1 h-5 w-px bg-gray-200" />
          <History className="h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-gray-800">Registro attività</h1>
            {order && <p className="truncate text-xs text-gray-400">{order.order_code} · {order.description}</p>}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
        {caricamento ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !order ? (
          <div className="py-16 text-center text-sm text-gray-400">Commessa non trovata.</div>
        ) : (
          <div className="space-y-3">
            {(diaryError || azioniError) && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Una parte del registro non si è caricata: qui sotto potrebbero mancare delle azioni. Aggiorna la pagina.</p>
              </div>
            )}
            <RegistroCommessa
              voci={voci}
              nomeFile={`registro-commessa-${order.order_code ?? id}-${format(new Date(), "yyyy-MM-dd")}`}
              titoloCommessa={`${order.order_code ?? ""} · ${order.description ?? ""}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
