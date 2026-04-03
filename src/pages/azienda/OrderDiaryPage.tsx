import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { OrderDiaryTab } from "@/components/orders/OrderDiaryTab";

export default function OrderDiaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();

  const { data: order, isLoading } = useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description, current_status_id, customer:customers(id, first_name, last_name, email, phone)")
        .eq("id", id!)
        .eq("company_id", effectiveCompany!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user && !!effectiveCompany,
  });

  const customerName = order?.customer
    ? `${(order.customer as any).first_name} ${(order.customer as any).last_name}`
    : undefined;
  const customerEmail = (order?.customer as any)?.email;
  const customerPhone = (order?.customer as any)?.phone ?? undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/azienda/ordini/${id}`)}
            className="text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Torna all'ordine
          </Button>
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-gray-900">
              Diario dell'Ordine
            </span>
            {order && (
              <span className="text-sm text-gray-400">
                — {order.order_code} · {order.description}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !order ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            Ordine non trovato.
          </div>
        ) : (
          <OrderDiaryTab
            orderId={id!}
            customerName={customerName}
            customerEmail={customerEmail}
            customerPhone={customerPhone}
          />
        )}
      </div>
    </div>
  );
}
