// src/components/orders/SalvaFasiComeModello.tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { chiaveModelliFasi, messaggioModello } from "@/hooks/useModelliFasi";

// La RPC non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Le fasi (e sottofasi) di questa commessa diventano un modello dell'azienda. */
export function SalvaFasiComeModello({ orderId, numeroFasi, className }: { orderId: string; numeroFasi: number; className?: string }) {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const [nome, setNome] = useState("");

  const salva = useMutation({
    mutationFn: async (nomeModello: string) => {
      const { error } = await db.rpc("salva_commessa_come_modello", { p_order_id: orderId, p_nome: nomeModello });
      if (error) throw error;
    },
    onSuccess: (_dati, nomeModello) => {
      toast.success(`Modello «${nomeModello}» salvato`, { description: "Lo trovi in Impostazioni → Modelli di fasi." });
      setNome("");
      void qc.invalidateQueries({ queryKey: chiaveModelliFasi(effectiveCompany?.id) });
    },
    onError: (e) => toast.error(messaggioModello(e)),
  });

  if (numeroFasi === 0) return null;
  const nomePulito = nome.trim();

  return (
    <div className={className}>
      <Label htmlFor="nome-nuovo-modello" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Usa queste {numeroFasi} fasi anche in altre commesse
      </Label>
      <div className="mt-1.5 flex items-center gap-2">
        <Input id="nome-nuovo-modello" aria-label="Nome del nuovo modello" value={nome} maxLength={80} placeholder="Nome del modello" onChange={(e) => setNome(e.target.value)} className="h-9 min-w-0 flex-1" />
        <Button size="sm" variant="outline" disabled={!nomePulito || salva.isPending} onClick={() => salva.mutate(nomePulito)}>
          {salva.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <BookmarkPlus className="mr-1 h-4 w-4" />}
          Salva come modello
        </Button>
      </div>
    </div>
  );
}
