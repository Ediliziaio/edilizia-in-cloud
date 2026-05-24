/**
 * Magazzino campo — 2 tab:
 * - Furgone: scorte assegnate all'operaio con +/- e segnalazione riordino
 * - Cantiere: warehouse_items dell'ordine attivo (sola lettura)
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, AlertTriangle, Minus, Plus, Loader2, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Tab = "furgone" | "cantiere";

export default function CampoMagazzino() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const companyId = (profile as any)?.company_id ?? null;
  const [activeTab, setActiveTab] = useState<Tab>("furgone");
  const [segnalazioneId, setSegnalazioneId] = useState<string | null>(null);

  // Scorte furgone
  const { data: scorte = [], isLoading: loadingScorte } = useQuery({
    queryKey: ["scorte-furgone-campo", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("scorte_furgone")
        .select("*")
        .eq("tecnico_id", user!.id)
        .eq("attivo", true)
        .order("nome_materiale");
      return data ?? [];
    },
    enabled: !!user?.id && activeTab === "furgone",
  });

  // Cantieri attivi per warehouse
  const { data: cantieri = [] } = useQuery({
    queryKey: ["campo-cantieri-attivi", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_campo_assignments")
        .select("order_id, order:orders(id, order_code)")
        .eq("user_id", user!.id);
      return (data ?? []).map((a: any) => a.order).filter(Boolean);
    },
    enabled: !!user?.id,
  });

  const [selectedCantiere, setSelectedCantiere] = useState<string>("");

  useEffect(() => {
    if (activeTab !== "cantiere") return;

    if (cantieri.length === 1 && !selectedCantiere) {
      setSelectedCantiere(cantieri[0]?.id ?? "");
      return;
    }

    if (selectedCantiere && !cantieri.some((c: any) => c.id === selectedCantiere)) {
      setSelectedCantiere("");
    }
  }, [activeTab, cantieri, selectedCantiere]);

  // Warehouse items del cantiere selezionato
  const { data: warehouseItems = [], isLoading: loadingWarehouse } = useQuery({
    queryKey: ["warehouse-cantiere", selectedCantiere],
    queryFn: async () => {
      const { data } = await supabase
        .from("warehouse_items")
        .select("*")
        .eq("order_id", selectedCantiere)
        .order("name");
      return data ?? [];
    },
    enabled: !!selectedCantiere && activeTab === "cantiere",
  });

  const updateQtaMutation = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: number }) => {
      const scorta = scorte.find((s: any) => s.id === id) as any;
      if (!scorta) throw new Error("non trovata");
      const newQta = Math.max(0, (scorta.quantita_attuale ?? 0) + delta);
      const { error } = await supabase
        .from("scorte_furgone")
        .update({ quantita_attuale: newQta })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scorte-furgone-campo"] }),
    onError: () => toast.error("Errore aggiornamento"),
  });

  const segnalaMutation = useMutation({
    mutationFn: async (scorta: any) => {
      const { error } = await supabase.from("tasks").insert({
        company_id: companyId,
        title: `Riordino: ${scorta.nome_materiale}`,
        notes: `Scorta in esaurimento. Qta attuale: ${scorta.quantita_attuale} ${scorta.unita_misura ?? "pz"}`,
        category: "riordino_materiali",
        assigned_to: user!.id,
        created_by: user!.id,
        status: "da_fare",
        priority: "alta",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Segnalazione inviata");
      setSegnalazioneId(null);
    },
    onError: (err) => {
      toast.error("Errore segnalazione riordino", {
        description: err instanceof Error ? err.message : "Riprova tra qualche istante.",
      });
      setSegnalazioneId(null);
    },
  });

  const scarseCount = scorte.filter((s: any) => s.quantita_attuale <= (s.quantita_minima ?? 1)).length;

  return (
    <div className="flex flex-col h-full">
      {/* Tab selector */}
      <div className="bg-muted border-b border-border px-4 py-3">
        <div className="flex gap-2">
          {(["furgone", "cantiere"] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-medium transition-colors",
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {tab === "furgone" ? "Furgone" : "Cantiere"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">

        {/* TAB FURGONE */}
        {activeTab === "furgone" && (
          <>
            {scarseCount > 0 && (
              <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-xl mb-4">
                <AlertTriangle className="w-4 h-4 text-primary shrink-0" />
                <p className="text-xs text-primary">
                  {scarseCount} articol{scarseCount > 1 ? "i" : "o"} in esaurimento
                </p>
              </div>
            )}

            {loadingScorte ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : scorte.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-center">
                <Package className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">Nessuna scorta assegnata</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scorte.map((s: any) => {
                  const isScarso = s.quantita_attuale <= (s.quantita_minima ?? 1);
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "bg-muted border rounded-2xl p-4",
                        isScarso ? "border-primary/30" : "border-border"
                      )}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium text-foreground">{s.nome_materiale}</p>
                          {s.codice && <p className="text-xs text-muted-foreground">{s.codice}</p>}
                        </div>
                        {isScarso && (
                          <span className="text-[10px] bg-primary/10 text-primary border border-primary/30 rounded-full px-2 py-0.5">
                            Scarso
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => updateQtaMutation.mutate({ id: s.id, delta: -1 })}
                            disabled={s.quantita_attuale <= 0 || updateQtaMutation.isPending}
                            className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center active:bg-muted disabled:opacity-30"
                          >
                            <Minus className="w-4 h-4 text-foreground" />
                          </button>
                          <span className="text-xl font-bold text-foreground w-12 text-center">
                            {s.quantita_attuale}
                          </span>
                          <button
                            onClick={() => updateQtaMutation.mutate({ id: s.id, delta: 1 })}
                            disabled={updateQtaMutation.isPending}
                            className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center active:bg-muted"
                          >
                            <Plus className="w-4 h-4 text-foreground" />
                          </button>
                          <span className="text-xs text-muted-foreground">{s.unita_misura ?? "pz"}</span>
                        </div>

                        {isScarso && segnalazioneId !== s.id && (
                          <button
                            onClick={() => { setSegnalazioneId(s.id); segnalaMutation.mutate(s); }}
                            className="text-xs bg-primary/10 text-primary border border-primary/30 px-3 py-1.5 rounded-lg"
                          >
                            Segnala
                          </button>
                        )}
                        {segnalazioneId === s.id && segnalaMutation.isPending && (
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* TAB CANTIERE */}
        {activeTab === "cantiere" && (
          <>
            {cantieri.length > 1 && (
              <select
                value={selectedCantiere}
                onChange={e => setSelectedCantiere(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-foreground text-sm mb-4 focus:outline-none focus:border-primary"
              >
                <option value="">— Seleziona cantiere —</option>
                {cantieri.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.order_code}</option>
                ))}
              </select>
            )}
            {!selectedCantiere ? (
              <div className="flex flex-col items-center py-16 gap-3 text-center">
                <Warehouse className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">
                  {cantieri.length === 1 ? "Preparazione cantiere…" : "Seleziona un cantiere"}
                </p>
              </div>
            ) : loadingWarehouse ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : warehouseItems.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-center">
                <Package className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">Nessun materiale in magazzino cantiere</p>
              </div>
            ) : (
              <div className="space-y-3">
                {warehouseItems.map((item: any) => (
                  <div key={item.id} className="bg-muted border border-border rounded-2xl p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-foreground">{item.name || item.description}</p>
                        {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-foreground">
                          {item.quantity ?? 0} <span className="text-sm text-muted-foreground">{item.unit ?? "pz"}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
