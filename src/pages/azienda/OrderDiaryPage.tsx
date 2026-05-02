import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, BookOpen, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { useOrderDiary } from "@/hooks/useOrderDiary";
import { OrderDiaryTab } from "@/components/orders/OrderDiaryTab";
import { DiaryEmptyState } from "@/components/orders/DiaryEmptyState";
import { DiaryComposer, type DiaryComposerPayload } from "@/components/orders/DiaryComposer";
import { toast } from "sonner";

type Channel = "email" | "sms" | "whatsapp" | "nota_interna";

interface OrderDiaryCustomer {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

interface OrderDiaryOrder {
  id: string;
  order_code: string | null;
  description: string | null;
  current_status_id: string | null;
  customer: OrderDiaryCustomer | null;
}

export default function OrderDiaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();

  const [composerChannel, setComposerChannel] = useState<Channel | null>(null);

  // ── Carica dati ordine ────────────────────────────────────────────────────
  const { data: order, isLoading } = useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_code, description, current_status_id, customer:customers(id, first_name, last_name, email, phone)"
        )
        .eq("id", id!)
        .eq("company_id", effectiveCompany!.id)
        .single();
      if (error) throw error;
      return data as OrderDiaryOrder;
    },
    enabled: !!id && !!user && !!effectiveCompany,
  });

  // ── Hook diario (timeline + mutations) ───────────────────────────────────
  const {
    timeline,
    templates,
    sendMutation,
    addNoteMutation,
    isLoading: diaryLoading,
    isError: diaryError,
  } = useOrderDiary(id);

  const customerName = order?.customer
    ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(" ")
    : "";
  const customerEmail = order?.customer?.email ?? undefined;
  const customerPhone = order?.customer?.phone ?? undefined;

  const isEmpty = !diaryLoading && timeline.length === 0;

  // ── Invio messaggio ───────────────────────────────────────────────────────
  const handleSend = async (payload: DiaryComposerPayload) => {
    try {
      if (payload.channel === "nota_interna") {
        await addNoteMutation.mutateAsync(payload.body);
      } else {
        await sendMutation.mutateAsync({
          channel: payload.channel,
          to_name: payload.to_name,
          to_email: payload.to_email,
          to_phone: payload.to_phone,
          subject: payload.subject,
          body: payload.body,
        });
      }
      setComposerChannel(null);
      toast.success(
        payload.channel === "nota_interna" ? "Nota salvata" : "Messaggio inviato"
      );
    } catch {
      toast.error("Errore durante l'invio. Riprova.");
      throw new Error("Errore durante l'invio");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header fisso ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/azienda/ordini/${id}`)}
            className="text-gray-500 hover:text-gray-800 shrink-0"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Torna alla commessa
          </Button>
          <div className="h-4 w-px bg-gray-200 shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-medium text-gray-900 shrink-0">
              Diario della Commessa
            </span>
            {order && (
              <span className="text-sm text-gray-400 truncate hidden sm:block">
                — {order.order_code} · {order.description}
              </span>
            )}
          </div>
          {/* Bottone scrivi nuovo messaggio (quando ci sono già messaggi) */}
          {!isEmpty && !composerChannel && (
            <Button
              size="sm"
              onClick={() => setComposerChannel("email")}
              className="ml-auto shrink-0 bg-orange-500 hover:bg-orange-600 text-white text-xs"
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Nuovo messaggio
            </Button>
          )}
        </div>
      </div>

      {/* ── Contenuto ────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !order ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            Commessa non trovata.
          </div>
        ) : (
          <>
            {/* Composer (aperto) */}
            {composerChannel && (
              <DiaryComposer
                channel={composerChannel}
                toName={customerName}
                toEmail={customerEmail}
                toPhone={customerPhone}
                onSend={handleSend}
                onCancel={() => setComposerChannel(null)}
                onChangeChannel={setComposerChannel}
              />
            )}

            {/* Empty state (nessun messaggio + composer chiuso) */}
            {diaryLoading && (
              <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            )}

            {diaryError && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Diario non aggiornato in tempo reale</p>
                  <p className="mt-0.5 text-amber-700">
                    Alcune voci potrebbero non essere state caricate. Riprova o aggiorna la pagina.
                  </p>
                </div>
              </div>
            )}

            {isEmpty && !composerChannel && (
              <DiaryEmptyState onSelectChannel={setComposerChannel} />
            )}

            {/* Timeline diario (sempre visibile se ci sono voci) */}
            {!diaryLoading && !isEmpty && (
              <OrderDiaryTab
                orderId={id!}
                customerName={customerName}
                customerEmail={customerEmail}
                customerPhone={customerPhone}
                timeline={timeline}
                templates={templates}
                onSend={sendMutation.mutate}
                onAddNote={addNoteMutation.mutate}
                isSending={sendMutation.isPending || addNoteMutation.isPending}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
