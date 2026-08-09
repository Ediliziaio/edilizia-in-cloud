/**
 * Magazzino campo — 2 tab:
 * - Furgone: scorte personali (scorte_furgone) con +/- e segnalazione riordino
 * - Magazzino: giacenze aziendali (warehouse_stock) in sola lettura — la RLS
 *   mostra solo i magazzini assegnati all'operaio (get_my_warehouse_ids) o
 *   quelli visibili col permesso can_view_warehouse.
 *
 * Nota schema (verificato sul DB live): scorte_furgone ha
 * descrizione/quantita/quantita_minima/unita_misura/tecnico_id — NON
 * nome_materiale/quantita_attuale/attivo/codice che usava la prima versione
 * (tutte le query rispondevano 400 e la pagina sembrava solo "vuota").
 * La tabella warehouse_items NON esiste: il magazzino reale è warehouse_stock.
 * La segnalazione riordino via `tasks` era un vicolo cieco: la RLS INSERT dei
 * dipendenti impone assigned_to = auth.uid(), quindi l'operaio segnalava a se
 * stesso. Ora apre un TICKET (fonte campo), che l'ufficio vede davvero.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, AlertTriangle, Minus, Plus, Loader2, Warehouse, RefreshCcw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Tab = "furgone" | "magazzino";

interface ScortaFurgone {
  id: string;
  descrizione: string;
  quantita: number | null;
  quantita_minima: number | null;
  unita_misura: string | null;
}

interface StockRow {
  id: string;
  name: string | null;
  description: string | null;
  internal_code: string | null;
  quantity_available: number | null;
  quantity: number | null;
  min_stock_level: number | null;
}

export default function CampoMagazzino() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const [activeTab, setActiveTab] = useState<Tab>("furgone");
  const [segnalazioneId, setSegnalazioneId] = useState<string | null>(null);
  const [ricerca, setRicerca] = useState("");

  // Scorte furgone personali
  const scorteQuery = useQuery({
    queryKey: ["scorte-furgone-campo", user?.id],
    queryFn: async (): Promise<ScortaFurgone[]> => {
      const { data, error } = await supabase
        .from("scorte_furgone")
        .select("id, descrizione, quantita, quantita_minima, unita_misura")
        .eq("tecnico_id", user!.id)
        .order("descrizione");
      if (error) throw error;
      return (data ?? []) as ScortaFurgone[];
    },
    enabled: !!user?.id && activeTab === "furgone",
    staleTime: 30_000,
  });
  const scorte = scorteQuery.data ?? [];

  // Giacenze aziendali (RLS: solo i magazzini visibili all'operaio)
  const stockQuery = useQuery({
    queryKey: ["campo-warehouse-stock", companyId],
    queryFn: async (): Promise<StockRow[]> => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("id, name, description, internal_code, quantity_available, quantity, min_stock_level")
        .order("name")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as StockRow[];
    },
    enabled: !!user?.id && activeTab === "magazzino",
    staleTime: 60_000,
  });

  const stockFiltrato = (stockQuery.data ?? []).filter((r) => {
    if (!ricerca.trim()) return true;
    const q = ricerca.toLowerCase();
    return (
      (r.name ?? "").toLowerCase().includes(q) ||
      (r.description ?? "").toLowerCase().includes(q) ||
      (r.internal_code ?? "").toLowerCase().includes(q)
    );
  });

  const updateQtaMutation = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: number }) => {
      const scorta = scorte.find((s) => s.id === id);
      if (!scorta) throw new Error("Scorta non trovata");
      const newQta = Math.max(0, (scorta.quantita ?? 0) + delta);
      const { error } = await supabase
        .from("scorte_furgone")
        .update({ quantita: newQta })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scorte-furgone-campo"] }),
    onError: (err: unknown) =>
      toast.error("Errore aggiornamento", {
        description: err instanceof Error ? err.message : "Riprova tra qualche istante.",
      }),
  });

  // Riordino → ticket all'ufficio (stessa forma di CampoTicketNuovo)
  const segnalaMutation = useMutation({
    mutationFn: async (scorta: ScortaFurgone) => {
      if (!companyId) throw new Error("Azienda non disponibile, riprova tra un istante");
      const testo = `Scorta furgone in esaurimento: ${scorta.descrizione}. Quantità attuale: ${scorta.quantita ?? 0} ${scorta.unita_misura ?? "pz"} (minimo ${scorta.quantita_minima ?? 1}).`;
      const { error } = await supabase.from("tickets").insert({
        company_id: companyId,
        created_by: user!.id,
        customer_id: null,
        subject: `Riordino materiale: ${scorta.descrizione}`,
        titolo: `Riordino materiale: ${scorta.descrizione}`,
        descrizione: testo,
        priorita: "alta",
        priority: "alta",
        status: "aperto",
        fonte: "campo",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Segnalazione inviata all'ufficio");
      setSegnalazioneId(null);
    },
    onError: (err: unknown) => {
      toast.error("Errore segnalazione riordino", {
        description: err instanceof Error ? err.message : "Riprova tra qualche istante.",
      });
      setSegnalazioneId(null);
    },
  });

  const scarseCount = scorte.filter((s) => (s.quantita ?? 0) <= (s.quantita_minima ?? 1)).length;

  return (
    <div className="flex flex-col h-full">
      {/* Tab selector */}
      <div className="bg-muted border-b border-border px-4 py-3">
        <div className="flex gap-2">
          {(["furgone", "magazzino"] as Tab[]).map(tab => (
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
              {tab === "furgone" ? "Furgone" : "Magazzino"}
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

            {scorteQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : scorteQuery.isError ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border py-10 text-center">
                <p className="text-sm font-medium">Non riesco a caricare le scorte</p>
                <p className="text-xs text-muted-foreground">Controlla la connessione e riprova.</p>
                <Button variant="outline" size="sm" onClick={() => scorteQuery.refetch()} disabled={scorteQuery.isFetching}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  {scorteQuery.isFetching ? "Riprovo…" : "Riprova"}
                </Button>
              </div>
            ) : scorte.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-center">
                <Package className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">Nessuna scorta assegnata</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Le scorte del furgone le carica l'ufficio sulla tua scheda. Quando ci sono, le vedi qui e puoi aggiornarle a fine giornata.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {scorte.map((s) => {
                  const qta = s.quantita ?? 0;
                  const isScarso = qta <= (s.quantita_minima ?? 1);
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "bg-muted border rounded-2xl p-4",
                        isScarso ? "border-primary/30" : "border-border"
                      )}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <p className="font-medium text-foreground">{s.descrizione}</p>
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
                            disabled={qta <= 0 || updateQtaMutation.isPending}
                            aria-label={`Diminuisci ${s.descrizione}`}
                            className="w-11 h-11 rounded-xl bg-background border border-border flex items-center justify-center active:bg-muted disabled:opacity-30"
                          >
                            <Minus className="w-4 h-4 text-foreground" />
                          </button>
                          <span className="text-xl font-bold text-foreground w-12 text-center tabular-nums">
                            {qta}
                          </span>
                          <button
                            onClick={() => updateQtaMutation.mutate({ id: s.id, delta: 1 })}
                            disabled={updateQtaMutation.isPending}
                            aria-label={`Aumenta ${s.descrizione}`}
                            className="w-11 h-11 rounded-xl bg-background border border-border flex items-center justify-center active:bg-muted"
                          >
                            <Plus className="w-4 h-4 text-foreground" />
                          </button>
                          <span className="text-xs text-muted-foreground">{s.unita_misura ?? "pz"}</span>
                        </div>

                        {isScarso && segnalazioneId !== s.id && (
                          <button
                            onClick={() => { setSegnalazioneId(s.id); segnalaMutation.mutate(s); }}
                            className="text-xs bg-primary/10 text-primary border border-primary/30 px-3 py-2 rounded-lg"
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

        {/* TAB MAGAZZINO AZIENDALE (sola lettura) */}
        {activeTab === "magazzino" && (
          <>
            {stockQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : stockQuery.isError ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border py-10 text-center">
                <p className="text-sm font-medium">Non riesco a caricare il magazzino</p>
                <p className="text-xs text-muted-foreground">Controlla la connessione e riprova.</p>
                <Button variant="outline" size="sm" onClick={() => stockQuery.refetch()} disabled={stockQuery.isFetching}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  {stockQuery.isFetching ? "Riprovo…" : "Riprova"}
                </Button>
              </div>
            ) : (stockQuery.data ?? []).length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-center">
                <Warehouse className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">Nessun materiale visibile</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Vedi solo i magazzini che l'ufficio ti ha assegnato. Se ti serve l'accesso, chiedi in ufficio.
                </p>
              </div>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="search"
                    value={ricerca}
                    onChange={(e) => setRicerca(e.target.value)}
                    placeholder="Cerca materiale…"
                    className="w-full bg-muted border border-border rounded-xl pl-9 pr-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                {stockFiltrato.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Nessun materiale per "{ricerca}"</p>
                ) : (
                  <div className="space-y-3">
                    {stockFiltrato.map((item) => {
                      const disponibile = item.quantity_available ?? item.quantity ?? 0;
                      const scarso = item.min_stock_level != null && disponibile <= item.min_stock_level;
                      return (
                        <div key={item.id} className="bg-muted border border-border rounded-2xl p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{item.name || item.description || "Articolo"}</p>
                              {item.internal_code && (
                                <p className="text-xs text-muted-foreground">Cod. {item.internal_code}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className={cn("text-lg font-bold tabular-nums", scarso ? "text-destructive" : "text-foreground")}>
                                {disponibile}
                              </p>
                              <p className="text-[10px] text-muted-foreground">disponibili</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
