/**
 * I numeri dei campi propri della commessa, sopra l'elenco dei rapportini: i totali e l'Excel.
 * Da telefono l'esportazione non c'è; i totali sì, perché si leggono soltanto.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { esportaRapportini, type RigaRapportino } from "@/lib/campo/esportaRapportini";
import { valoreInTesto } from "../../../supabase/functions/_shared/moduliCantiere";

interface Totale { chiave: string; etichetta: string; tipo: string; unita: string | null; phase_id: string | null; fase_nome: string | null; approvati: number; da_approvare: number }

const quanto = (t: Totale, n: number) => t.tipo === "boolean"
  ? `${n} sì`
  : valoreInTesto({ chiave: t.chiave, etichetta: t.etichetta, tipo: "number", valore: Number(n), stampa: "mai", ...(t.unita ? { unita: t.unita } : {}) });

export function TotaliCampiCommessa({ orderId, rapportini }: { orderId: string; rapportini: RigaRapportino[] }) {
  const mobile = useIsMobile();
  const [esporto, setEsporto] = useState(false);
  const { data: totali = [] } = useQuery<Totale[]>({
    queryKey: ["rapportini-campi-totali", orderId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (f: string, a: unknown) => Promise<{ data: Totale[] | null; error: { code?: string } | null }>)(
        "rapportini_campi_totali", { p_order_id: orderId });
      if (error?.code === "PGRST202" || error?.code === "42883") return [];
      if (error) throw error;
      return data ?? [];
    },
  });
  const esportabile = !mobile && rapportini.length > 0;
  if (totali.length === 0 && !esportabile) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-card px-3 py-2 text-sm">
      {totali.map((t) => (
        <div key={`${t.chiave}@${t.phase_id ?? ""}`} className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-muted-foreground">{t.etichetta}{t.fase_nome ? ` · ${t.fase_nome}` : ""}</span>
          <span className="font-semibold tabular-nums">{quanto(t, Number(t.approvati))}</span>
          {Number(t.da_approvare) > 0 && <span className="text-xs text-amber-700">{quanto(t, Number(t.da_approvare))} da approvare</span>}
        </div>
      ))}
      {esportabile && (
        <Button type="button" variant="ghost" size="sm" className="ml-auto h-8" disabled={esporto} onClick={() => {
          setEsporto(true);
          esportaRapportini(rapportini, `rapportini_${orderId.slice(0, 8)}.xlsx`)
            .catch(() => toast.error("Esportazione non riuscita. Riprova."))
            .finally(() => setEsporto(false));
        }}>
          {esporto ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}Esporta Excel
        </Button>
      )}
    </div>
  );
}
