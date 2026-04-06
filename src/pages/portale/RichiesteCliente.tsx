import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PortaleLayout } from "@/components/portale/PortaleLayout";
import { usePortaleAuth } from "@/hooks/usePortaleAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const STATO_CONFIG: Record<string, { label: string; color: string }> = {
  inviata: { label: "Inviata", color: "bg-blue-100 text-blue-700" },
  in_lavorazione: { label: "In lavorazione", color: "bg-amber-100 text-amber-700" },
  preventivo_inviato: { label: "Preventivo inviato", color: "bg-purple-100 text-purple-700" },
  approvato: { label: "Approvato", color: "bg-green-100 text-green-700" },
  completato: { label: "Completato", color: "bg-gray-100 text-gray-600" },
  annullato: { label: "Annullato", color: "bg-red-100 text-red-600" },
};

const URGENZA_CONFIG: Record<string, { label: string; color: string }> = {
  normale: { label: "Normale", color: "bg-gray-100 text-gray-600" },
  urgente: { label: "Urgente", color: "bg-amber-100 text-amber-700" },
  emergenza: { label: "Emergenza", color: "bg-red-100 text-red-700" },
};

const FILTER_OPTIONS = [
  { value: "tutte", label: "Tutte" },
  { value: "aperte", label: "Aperte" },
  { value: "in_lavorazione", label: "In Lavorazione" },
  { value: "completate", label: "Completate" },
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function SkeletonCard() {
  return (
    <Card className="border-0 shadow-sm bg-white rounded-xl">
      <CardContent className="p-4 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-full" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function RichiesteCliente() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { loading, valido, cliente } = usePortaleAuth(token);
  const [filtro, setFiltro] = useState("tutte");

  useEffect(() => {
    if (!loading && !valido) {
      navigate("/portale/accesso-scaduto", { replace: true });
    }
  }, [loading, valido, navigate]);

  const { data: richieste = [], isLoading: richiesteLoading } = useQuery({
    queryKey: ["portale-richieste-all", cliente?.cliente_id, cliente?.company_id],
    enabled: !!cliente,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("portale_richieste")
        .select("id, created_at, tipo, urgenza, stato, descrizione")
        .eq("cliente_id", cliente!.cliente_id)
        .eq("company_id", cliente!.company_id)
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  const filteredRichieste = richieste.filter((r: any) => {
    if (filtro === "tutte") return true;
    if (filtro === "aperte") return ["inviata", "preventivo_inviato"].includes(r.stato);
    if (filtro === "in_lavorazione") return r.stato === "in_lavorazione";
    if (filtro === "completate") return ["completato", "approvato"].includes(r.stato);
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#1E3A5F] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!valido || !cliente) return null;

  return (
    <PortaleLayout cliente={cliente} token={token!}>
      <div className="p-4 space-y-4">
        <div className="pt-2">
          <h1 className="text-xl font-bold text-gray-900">Le mie richieste</h1>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFiltro(opt.value)}
              className={cn(
                "flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-150 border",
                filtro === opt.value
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-white text-gray-600 border-gray-200"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Loading skeletons */}
        {richiesteLoading && (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* List */}
        {!richiesteLoading && filteredRichieste.length === 0 && (
          <Card className="border-0 shadow-sm bg-white rounded-xl">
            <CardContent className="p-8 text-center">
              <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-700 mb-1">Nessuna richiesta</p>
              <p className="text-xs text-gray-500 mb-4">
                {filtro === "tutte"
                  ? "Non hai ancora inviato nessuna richiesta."
                  : "Nessuna richiesta corrisponde al filtro selezionato."}
              </p>
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white h-9 text-xs rounded-lg"
                onClick={() => navigate(`/portale/${token}/nuova-richiesta`)}
              >
                <Plus className="w-4 h-4 mr-1" /> Nuova Richiesta
              </Button>
            </CardContent>
          </Card>
        )}

        {!richiesteLoading && filteredRichieste.length > 0 && (
          <div className="space-y-3">
            {filteredRichieste.map((r: any) => {
              const stato = STATO_CONFIG[r.stato] ?? { label: r.stato, color: "bg-gray-100 text-gray-600" };
              const urgenza = URGENZA_CONFIG[r.urgenza] ?? { label: r.urgenza, color: "bg-gray-100 text-gray-600" };
              return (
                <Card key={r.id} className="border-0 shadow-sm bg-white rounded-xl">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">{formatDate(r.created_at)}</p>
                        <p className="text-sm font-semibold text-gray-900 mt-0.5">
                          {r.tipo ?? "Richiesta"}
                        </p>
                        {r.descrizione && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                            {r.descrizione}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", stato.color)}>
                            {stato.label}
                          </span>
                          <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", urgenza.color)}>
                            {urgenza.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Bottom padding for FAB */}
        <div className="h-4" />
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate(`/portale/${token}/nuova-richiesta`)}
        className="fixed right-4 w-14 h-14 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-150 z-40"
        aria-label="Nuova richiesta"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>
    </PortaleLayout>
  );
}
