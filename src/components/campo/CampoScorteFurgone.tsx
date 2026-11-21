import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Minus, Package, Plus, RefreshCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ScortaFurgone {
  id: string;
  descrizione: string;
  quantita: number | null;
  quantita_minima: number | null;
  unita_misura: string | null;
}

export function CampoScorteFurgone({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [segnalazioneId, setSegnalazioneId] = useState<string | null>(null);

  // Scorte furgone personali
  const scorteQuery = useQuery({
    queryKey: ["scorte-furgone-campo", companyId, user?.id],
    queryFn: async (): Promise<ScortaFurgone[]> => {
      const { data, error } = await supabase
        .from("scorte_furgone")
        .select("id, descrizione, quantita, quantita_minima, unita_misura")
        .eq("company_id", companyId)
        .eq("tecnico_id", user!.id)
        .order("descrizione");
      if (error) throw error;
      return (data ?? []) as ScortaFurgone[];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
  const scorte = scorteQuery.data ?? [];

  const updateQtaMutation = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: number }) => {
      const scorta = scorte.find((s) => s.id === id);
      if (!scorta) throw new Error("Scorta non trovata");
      const newQta = Math.max(0, (scorta.quantita ?? 0) + delta);
      const { error } = await supabase
        .from("scorte_furgone")
        .update({ quantita: newQta })
        .eq("company_id", companyId)
        .eq("tecnico_id", user!.id)
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
  );
}
