/**
 * Commessa: chi lavora senza un costo orario (14/11/2026, piano rapportini/listini, Fase 3).
 * Prima un operaio o un mezzo senza costo valeva 0 € e la marginalità della commessa sembrava completa.
 * Ora la commessa dice chi manca, e che i costi di manodopera e mezzi sono parziali finché non si completa.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Mancanze {
  persone: { employee_id: string | null; nome: string; ore: number; rapportini: number; motivo: string }[];
  mezzi: { mezzo_id: string; nome: string; rapportini: number }[];
  completo: boolean;
}

export function CostiDaCompletareCommessa({ orderId }: { orderId: string }) {
  const { data } = useQuery({
    queryKey: ["commessa-costi-da-completare", orderId],
    enabled: !!orderId,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { rpc: (f: string, a: object) => Promise<{ data: unknown; error: Error | null }> })
        .rpc("commessa_costi_da_completare", { p_order_id: orderId });
      if (error) throw error;
      return data as Mancanze | null;
    },
  });
  if (!data || data.completo) return null;
  const voci = [
    ...data.persone.map((p) => `${p.nome} (${p.motivo}, ${p.ore.toLocaleString("it-IT", { maximumFractionDigits: 1 })} h)`),
    ...data.mezzi.map((m) => `${m.nome} (mezzo senza costo orario)`),
  ];
  return (
    <div role="status" aria-label="Costi da completare" className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        <strong>Costo da completare</strong> per {voci.length === 1 ? "una voce" : `${voci.length} voci`}: {voci.join(", ")}.
        {" "}Finché manca il costo orario, manodopera e mezzi della commessa sono parziali e la marginalità è incompleta.
        {data.persone.some((p) => p.employee_id) ? " Il costo si completa nella scheda del dipendente." : ""}
      </p>
    </div>
  );
}
