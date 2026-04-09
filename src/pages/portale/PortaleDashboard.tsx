import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, AlertTriangle, Wrench, ClipboardList, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PortaleLayout } from "@/components/portale/PortaleLayout";
import { usePortaleAuth } from "@/hooks/usePortaleAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const STATO_LABELS: Record<string, { label: string; color: string }> = {
  inviata: { label: "Inviata", color: "bg-blue-100 text-blue-700" },
  in_lavorazione: { label: "In lavorazione", color: "bg-amber-100 text-amber-700" },
  preventivo_inviato: { label: "Preventivo inviato", color: "bg-purple-100 text-purple-700" },
  approvato: { label: "Approvato", color: "bg-green-100 text-green-700" },
  completato: { label: "Completato", color: "bg-gray-100 text-gray-600" },
  annullato: { label: "Annullato", color: "bg-red-100 text-red-600" },
};

const URGENZA_LABELS: Record<string, { label: string; color: string }> = {
  normale: { label: "Normale", color: "bg-gray-100 text-gray-600" },
  urgente: { label: "Urgente", color: "bg-amber-100 text-amber-700" },
  emergenza: { label: "Emergenza", color: "bg-red-100 text-red-700" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PortaleDashboard() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { loading, valido, cliente, error } = usePortaleAuth(token);

  useEffect(() => {
    if (!loading && !valido) {
      navigate("/portale/accesso-scaduto", { replace: true });
    }
  }, [loading, valido, navigate]);

  // KPI: interventi aperti
  const { data: apertiCount = 0 } = useQuery({
    queryKey: ["portale-aperti", cliente?.cliente_id, cliente?.company_id],
    enabled: !!cliente,
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("portale_richieste")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", cliente!.cliente_id)
        .eq("company_id", cliente!.company_id)
        .in("stato", ["inviata", "in_lavorazione"]);
      return count ?? 0;
    },
  });

  // KPI: da approvare
  const { data: daApprovareCount = 0 } = useQuery({
    queryKey: ["portale-da-approvare", cliente?.cliente_id, cliente?.company_id],
    enabled: !!cliente,
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("portale_richieste")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", cliente!.cliente_id)
        .eq("company_id", cliente!.company_id)
        .eq("stato", "preventivo_inviato");
      return count ?? 0;
    },
  });

  // KPI: impianti
  const { data: impiantiCount = 0 } = useQuery({
    queryKey: ["portale-impianti-count", cliente?.cliente_id, cliente?.company_id],
    enabled: !!cliente,
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("impianti_cliente")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", cliente!.cliente_id)
        .eq("company_id", cliente!.company_id);
      return count ?? 0;
    },
  });

  // Last 5 richieste
  const { data: richieste = [] } = useQuery({
    queryKey: ["portale-richieste-last5", cliente?.cliente_id, cliente?.company_id],
    enabled: !!cliente,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("portale_richieste")
        .select("id, created_at, tipo, urgenza, stato, descrizione")
        .eq("cliente_id", cliente!.cliente_id)
        .eq("company_id", cliente!.company_id)
        .order("created_at", { ascending: false })
        .limit(5);
      return (data as any[]) ?? [];
    },
  });

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#1E3A5F] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!valido || !cliente) return null;

  const ora = new Date().getHours();
  const saluto = ora < 12 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera";

  return (
    <PortaleLayout cliente={cliente} token={token!}>
      <div className="p-4 space-y-5">
        {/* Greeting */}
        <div className="pt-2">
          <h1 className="text-xl font-bold text-gray-900">
            {saluto}, {cliente.first_name}!
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{cliente.company_name}</p>
        </div>

        {/* Alert preventivi da approvare */}
        {daApprovareCount > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-800">
                Hai {daApprovareCount} {daApprovareCount === 1 ? "preventivo" : "preventivi"} da approvare
              </p>
              <Button
                size="sm"
                className="mt-2 bg-orange-500 hover:bg-orange-600 text-white h-8 text-xs rounded-lg"
                onClick={() => navigate(`/portale/${token}/richieste`)}
              >
                Visualizza
              </Button>
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-0 shadow-sm bg-white rounded-xl">
            <CardContent className="p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mx-auto mb-2">
                <Wrench className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{apertiCount}</p>
              <p className="text-[10px] text-gray-500 leading-tight mt-0.5">Interventi aperti</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-white rounded-xl">
            <CardContent className="p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{daApprovareCount}</p>
              <p className="text-[10px] text-gray-500 leading-tight mt-0.5">Da approvare</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-white rounded-xl">
            <CardContent className="p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{impiantiCount}</p>
              <p className="text-[10px] text-gray-500 leading-tight mt-0.5">Impianti</p>
            </CardContent>
          </Card>
        </div>

        {/* Ultime richieste */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Ultime richieste</h2>
            <button
              className="text-xs text-orange-500 font-medium"
              onClick={() => navigate(`/portale/${token}/richieste`)}
            >
              Vedi tutte
            </button>
          </div>

          {richieste.length === 0 ? (
            <Card className="border-0 shadow-sm bg-white rounded-xl">
              <CardContent className="p-6 text-center">
                <ClipboardList className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Nessuna richiesta ancora inviata</p>
                <Button
                  size="sm"
                  className="mt-3 bg-orange-500 hover:bg-orange-600 text-white h-8 text-xs rounded-lg"
                  onClick={() => navigate(`/portale/${token}/nuova-richiesta`)}
                >
                  Nuova richiesta
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {richieste.map((r: any) => {
                const stato = STATO_LABELS[r.stato] ?? { label: r.stato, color: "bg-gray-100 text-gray-600" };
                const urgenza = URGENZA_LABELS[r.urgenza] ?? { label: r.urgenza, color: "bg-gray-100 text-gray-600" };
                return (
                  <Card key={r.id} className="border-0 shadow-sm bg-white rounded-xl">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-400">{formatDate(r.created_at)}</p>
                          <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">
                            {r.tipo ?? "Richiesta"}
                          </p>
                          {r.descrizione && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                              {r.descrizione}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", stato.color)}>
                            {stato.label}
                          </span>
                          <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", urgenza.color)}>
                            {urgenza.label}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate(`/portale/${token}/nuova-richiesta`)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-150 z-40"
        aria-label="Nuova richiesta"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>
    </PortaleLayout>
  );
}
