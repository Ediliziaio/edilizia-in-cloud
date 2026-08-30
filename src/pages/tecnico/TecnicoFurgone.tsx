import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, Minus, Plus, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export default function TecnicoFurgone() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [segnalazioneId, setSegnalazioneId] = useState<string | null>(null);

  const { data: scorte = [], isLoading } = useQuery({
    queryKey: ["scorte-furgone", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("scorte_furgone")
        .select("*")
        .eq("tecnico_id", user!.id)
        // Schema reale di scorte_furgone: descrizione / quantita.
        // Il codice usava nome_materiale, quantita_attuale e un filtro
        // su "attivo": tre colonne inesistenti, quindi la query falliva
        // e (senza check sull'errore) la lista restava sempre vuota.
        .order("descrizione");
      return data ?? [];
    },
    enabled: !!user,
  });

  const updateQtaMutation = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: number }) => {
      const scorta = scorte.find((s: any) => s.id === id) as any;
      if (!scorta) throw new Error("Scorta non trovata");
      const newQta = Math.max(0, (scorta.quantita ?? 0) + delta);
      const { error } = await supabase
        .from("scorte_furgone")
        .update({ quantita: newQta })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scorte-furgone"] });
    },
    onError: () => toast.error("Errore nell'aggiornamento"),
  });

  const segnalaRiordineMutation = useMutation({
    mutationFn: async (scorta: any) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user!.id)
        .single();

      const { error } = await supabase.from("tasks").insert({
        company_id: profile?.company_id,
        title: `Riordino: ${scorta.descrizione}`,
        notes: `Scorta in esaurimento sul furgone del tecnico. Quantità attuale: ${scorta.quantita} ${scorta.unita_misura ?? "pz"}`,
        category: "riordino_materiali",
        assigned_to: user!.id,
        created_by: user!.id,
        status: "da_fare",
        priority: "alta",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Segnalazione inviata al responsabile");
      setSegnalazioneId(null);
    },
    onError: () => {
      toast.error("Errore nella segnalazione");
      setSegnalazioneId(null);
    },
  });

  const scarseCount = scorte.filter(
    (s: any) => s.quantita <= (s.quantita_minima ?? 1),
  ).length;

  return (
    <div className="p-4 space-y-4">
      <div className="pt-2">
        <h1 className="text-white text-xl font-bold">Scorte Furgone</h1>
        {scarseCount > 0 && (
          <div className="mt-2 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <p className="text-amber-300 text-sm font-medium">
              {scarseCount} materiale{scarseCount > 1 ? "i" : ""} in esaurimento
            </p>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : scorte.length === 0 ? (
        <div className="text-center py-16">
          <Package className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-lg font-medium">Nessuna scorta configurata</p>
          <p className="text-slate-500 text-sm mt-1">
            Chiedi al responsabile di aggiungere i materiali del tuo furgone
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {scorte.map((s: any) => {
            const scarso = s.quantita <= (s.quantita_minima ?? 1);
            return (
              <div
                key={s.id}
                className={`bg-slate-800 border rounded-xl p-4 ${
                  scarso ? "border-amber-500/40" : "border-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-semibold text-base">{s.descrizione}</p>
                      {scarso && (
                        <span className="bg-red-500/20 text-red-300 border border-red-500/30 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                          Scarso
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm mt-0.5">
                      Min: {s.quantita_minima ?? 0} {s.unita_misura ?? "pz"}
                    </p>
                  </div>

                  {/* Stepper */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQtaMutation.mutate({ id: s.id, delta: -1 })}
                      disabled={updateQtaMutation.isPending || s.quantita <= 0}
                      className="w-11 h-11 bg-slate-700 rounded-xl flex items-center justify-center text-white active:bg-slate-600 disabled:opacity-40"
                    >
                      <Minus className="h-5 w-5" />
                    </button>
                    <span className="text-white font-bold text-xl w-10 text-center">
                      {s.quantita ?? 0}
                    </span>
                    <button
                      onClick={() => updateQtaMutation.mutate({ id: s.id, delta: 1 })}
                      disabled={updateQtaMutation.isPending}
                      className="w-11 h-11 bg-slate-700 rounded-xl flex items-center justify-center text-white active:bg-slate-600 disabled:opacity-40"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {scarso && (
                  <button
                    onClick={() => { setSegnalazioneId(s.id); segnalaRiordineMutation.mutate(s); }}
                    disabled={segnalazioneId === s.id}
                    className="mt-3 w-full bg-amber-500/20 border border-amber-500/40 text-amber-300 py-2.5 rounded-xl text-sm font-medium active:bg-amber-500/30 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {segnalazioneId === s.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    Segnala riordino
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
