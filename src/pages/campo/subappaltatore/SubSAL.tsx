/**
 * SAL (Stato Avanzamento Lavori) per il subappaltatore.
 * Lista SAL + form nuovo SAL.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  Plus, ChevronRight, CheckCircle, Clock, XCircle,
  FileText, Loader2, Euro, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Tab = "lista" | "nuovo";

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  bozza:    { label: "Bozza",     icon: Clock,         color: "bg-slate-700 text-slate-300" },
  inviato:  { label: "Inviato",   icon: Clock,         color: "bg-amber-500/20 text-amber-400 border-amber-500/20" },
  approvato:{ label: "Approvato", icon: CheckCircle,   color: "bg-green-500/20 text-green-400 border-green-500/20" },
  contestato:{ label: "Contestato",icon: XCircle,      color: "bg-red-500/20 text-red-400 border-red-500/20" },
};

export default function SubSAL() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const companyId = (profile as any)?.company_id ?? null;
  const [activeTab, setActiveTab] = useState<Tab>("lista");

  // Form state
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [importo, setImporto] = useState("");
  const [percentuale, setPercentuale] = useState("0");
  const [descrizione, setDescrizione] = useState("");

  // Lista SAL
  const { data: salList = [], isLoading } = useQuery({
    queryKey: ["sub-sal-list", user?.id],
    queryFn: async () => {
      // Get subappaltatore record
      const { data: sub } = await supabase
        .from("subappaltatori")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!sub) return [];

      const { data } = await supabase
        .from("sal_subappaltatori")
        .select(`
          *,
          order:orders(id, order_code, description)
        `)
        .eq("subappaltatore_id", sub.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Cantieri assegnati
  const { data: cantieri = [] } = useQuery({
    queryKey: ["campo-cantieri-sal", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_campo_assignments")
        .select("order_id, order:orders(id, order_code, description)")
        .eq("user_id", user!.id);
      return (data ?? []).map((a: any) => a.order).filter(Boolean);
    },
    enabled: !!user?.id,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrderId) throw new Error("Seleziona un cantiere");
      if (!importo || isNaN(parseFloat(importo))) throw new Error("Inserisci un importo valido");

      // Get subappaltatore ID
      const { data: sub } = await supabase
        .from("subappaltatori")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!sub) throw new Error("Account subappaltatore non trovato");

      // Get next numero_sal
      const { count } = await supabase
        .from("sal_subappaltatori")
        .select("*", { count: "exact", head: true })
        .eq("subappaltatore_id", sub.id)
        .eq("order_id", selectedOrderId);
      const nextNum = (count ?? 0) + 1;

      const { error } = await supabase.from("sal_subappaltatori").insert({
        subappaltatore_id: sub.id,
        order_id: selectedOrderId,
        company_id: companyId,
        numero_sal: nextNum,
        importo: parseFloat(importo),
        percentuale_avanzamento: parseInt(percentuale),
        descrizione: descrizione.trim() || null,
        status: "inviato",
        data_invio: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("SAL inviato all'ufficio");
      setActiveTab("lista");
      setSelectedOrderId("");
      setImporto("");
      setPercentuale("0");
      setDescrizione("");
      qc.invalidateQueries({ queryKey: ["sub-sal-list"] });
    },
    onError: (err: any) => toast.error(err.message ?? "Errore nell'invio del SAL"),
  });

  const salInAttesaCount = salList.filter((s: any) => s.status === "inviato").length;
  const totaleApprovato = salList
    .filter((s: any) => s.status === "approvato")
    .reduce((sum: number, s: any) => sum + (s.importo ?? 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Tab */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3">
        <div className="flex gap-2">
          {(["lista", "nuovo"] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-medium transition-colors",
                activeTab === tab
                  ? "bg-amber-500 text-black"
                  : "bg-slate-800 text-slate-400"
              )}
            >
              {tab === "lista" ? (
                <span className="flex items-center justify-center gap-1">
                  Lista SAL
                  {salInAttesaCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5">
                      {salInAttesaCount}
                    </span>
                  )}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1">
                  <Plus className="w-4 h-4" />
                  Nuovo SAL
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">

        {/* TAB LISTA */}
        {activeTab === "lista" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                <p className="text-2xl font-bold text-white">{salList.length}</p>
                <p className="text-xs text-slate-400">SAL totali</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                <p className="text-2xl font-bold text-green-400">
                  €{totaleApprovato.toLocaleString("it-IT", { minimumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-slate-400">Approvato</p>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
              </div>
            ) : salList.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-center">
                <FileText className="w-10 h-10 text-slate-700" />
                <p className="text-slate-400 text-sm">Nessun SAL presente</p>
                <button
                  onClick={() => setActiveTab("nuovo")}
                  className="text-amber-400 text-sm font-medium"
                >
                  Crea il primo SAL →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {salList.map((sal: any) => {
                  const statusCfg = STATUS_CONFIG[sal.status] ?? STATUS_CONFIG.bozza;
                  const Icon = statusCfg.icon;
                  return (
                    <div key={sal.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-white">
                            SAL #{sal.numero_sal} — {sal.order?.order_code}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                            {sal.order?.description}
                          </p>
                        </div>
                        <span className={cn(
                          "flex items-center gap-1 text-[10px] border rounded-full px-2 py-0.5 shrink-0",
                          statusCfg.color
                        )}>
                          <Icon className="w-3 h-3" />
                          {statusCfg.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-white font-bold">
                          €{(sal.importo ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-slate-400">{sal.percentuale_avanzamento ?? 0}% avanzamento</span>
                      </div>

                      {sal.data_invio && (
                        <p className="text-xs text-slate-500 mt-1">
                          {format(parseISO(sal.data_invio), "d MMM yyyy", { locale: it })}
                        </p>
                      )}

                      {sal.status === "contestato" && sal.note_contestazione && (
                        <div className="mt-2 p-2 bg-red-900/20 border border-red-500/20 rounded-lg">
                          <p className="text-xs text-red-400">{sal.note_contestazione}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* TAB NUOVO */}
        {activeTab === "nuovo" && (
          <div className="space-y-4">
            {/* Cantiere */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Cantiere *</label>
              <select
                value={selectedOrderId}
                onChange={e => setSelectedOrderId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="">— Seleziona cantiere —</option>
                {cantieri.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.order_code} — {c.description?.slice(0, 40)}
                  </option>
                ))}
              </select>
            </div>

            {/* Importo */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Importo (€) *</label>
              <div className="relative">
                <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  value={importo}
                  onChange={e => setImporto(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Percentuale avanzamento */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Avanzamento lavori: <span className="text-white font-medium">{percentuale}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={percentuale}
                onChange={e => setPercentuale(e.target.value)}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Descrizione */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Descrizione lavori</label>
              <textarea
                value={descrizione}
                onChange={e => setDescrizione(e.target.value)}
                placeholder="Descrivi i lavori eseguiti in questo periodo..."
                rows={4}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            <div className="flex items-start gap-2 p-3 bg-slate-900 border border-slate-800 rounded-xl">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-400">
                Il SAL verrà inviato all'ufficio per approvazione. Riceverai una notifica sull'esito.
              </p>
            </div>

            <button
              onClick={() => submitMutation.mutate()}
              disabled={!selectedOrderId || !importo || submitMutation.isPending}
              className="w-full bg-amber-500 text-black font-bold py-4 rounded-xl text-base disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              {submitMutation.isPending && <Loader2 className="w-5 h-5 animate-spin" />}
              INVIA SAL
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
