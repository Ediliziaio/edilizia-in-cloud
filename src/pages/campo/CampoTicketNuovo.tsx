/**
 * Apertura rapida ticket dal campo.
 * fonte='campo', pre-seleziona ordine se arrivato da /campo/ticket/nuovo/:orderId
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, AlertCircle, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PRIORITA = [
  { value: "bassa", label: "Bassa", color: "bg-slate-700 text-slate-300" },
  { value: "media", label: "Media", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { value: "alta", label: "Alta", color: "bg-red-500/20 text-red-400 border-red-500/30" },
];

export default function CampoTicketNuovo() {
  const { orderId } = useParams<{ orderId?: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const companyId = (profile as any)?.company_id ?? null;

  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [priorita, setPriorita] = useState("media");
  const [selectedOrderId, setSelectedOrderId] = useState(orderId ?? "");
  const [done, setDone] = useState(false);

  // Cantieri assegnati
  const { data: cantieri = [] } = useQuery({
    queryKey: ["campo-cantieri-ticket", user?.id],
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
      if (!titolo.trim()) throw new Error("Inserisci un titolo");
      const { error } = await supabase.from("tickets").insert({
        company_id: companyId,
        order_id: selectedOrderId || null,
        created_by: user!.id,
        titolo: titolo.trim(),
        descrizione: descrizione.trim() || null,
        priorita,
        status: "aperto",
        fonte: "campo",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDone(true);
      setTimeout(() => navigate(-1), 2000);
    },
    onError: (err: any) => toast.error(err.message ?? "Errore nell'invio del ticket"),
  });

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <CheckCircle className="w-16 h-16 text-green-400" />
        <p className="text-white font-bold text-xl">Ticket inviato!</p>
        <p className="text-slate-400 text-sm">L'ufficio è stato notificato</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700 shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <p className="font-bold text-white">Nuovo ticket</p>
          <p className="text-xs text-slate-400">Segnala un problema al cantiere</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Cantiere (opzionale) */}
        {cantieri.length > 0 && (
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Cantiere (opzionale)</label>
            <select
              value={selectedOrderId}
              onChange={e => setSelectedOrderId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
            >
              <option value="">— Nessun cantiere specifico —</option>
              {cantieri.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.order_code} — {c.description?.slice(0, 40)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Titolo */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Titolo *</label>
          <input
            value={titolo}
            onChange={e => setTitolo(e.target.value)}
            placeholder="Es: Mancano i tasselli Fischer"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Priorità */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Priorità</label>
          <div className="flex gap-2">
            {PRIORITA.map(p => (
              <button
                key={p.value}
                onClick={() => setPriorita(p.value)}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                  priorita === p.value
                    ? p.color + " border-current"
                    : "bg-slate-900 border-slate-700 text-slate-500"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Descrizione */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Descrizione (opzionale)</label>
          <textarea
            value={descrizione}
            onChange={e => setDescrizione(e.target.value)}
            placeholder="Descrivi il problema in dettaglio..."
            rows={4}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-amber-500 resize-none"
          />
        </div>

        {/* Info */}
        <div className="flex items-start gap-2 p-3 bg-slate-900 border border-slate-800 rounded-xl">
          <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-400">
            Il ticket verrà inviato all'ufficio con priorità selezionata. Riceverai una notifica quando viene gestito.
          </p>
        </div>
      </div>

      {/* Submit */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-slate-950 border-t border-slate-800 px-4 pt-3"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={() => submitMutation.mutate()}
          disabled={!titolo.trim() || submitMutation.isPending}
          className="w-full bg-amber-500 text-black font-bold py-4 rounded-xl text-base disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {submitMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          INVIA TICKET
        </button>
      </div>
    </div>
  );
}
