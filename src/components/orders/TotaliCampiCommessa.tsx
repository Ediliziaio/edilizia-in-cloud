/**
 * I numeri dei campi propri della commessa, sopra l'elenco dei rapportini.
 * Da telefono i totali si vedono, perché si leggono soltanto.
 *
 * 28/11/2026 — «Esporta Excel» è uscito da questa riga: su una commessa senza campi propri la
 * riga esisteva solo per quel pulsante, e una barra intera per un pulsante non si vedeva. Adesso
 * è `EsportaRapportiniExcel`, in testa all'elenco accanto agli altri pulsanti.
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Totale { chiave: string; etichetta: string; tipo: string; unita: string | null; phase_id: string | null; fase_nome: string | null; approvati: number; da_approvare: number }

const quanto = (t: Totale, n: number, tr: ReturnType<typeof useT>) => t.tipo === "boolean"
  ? tr("{n} sì", { n })
  : valoreInTesto({ chiave: t.chiave, etichetta: t.etichetta, tipo: "number", valore: Number(n), stampa: "mai", ...(t.unita ? { unita: t.unita } : {}) });

/** «Esporta Excel» dei rapportini, da mettere fra i pulsanti in testa all'elenco. Da telefono non c'è. */
export function EsportaRapportiniExcel({ orderId, rapportini }: { orderId: string; rapportini: RigaRapportino[] }) {
  const tr = useT();
  const mobile = useIsMobile();
  const [esporto, setEsporto] = useState(false);
  if (mobile || rapportini.length === 0) return null;
  return (
    <Button type="button" variant="outline" size="sm" disabled={esporto} onClick={() => {
      setEsporto(true);
      esportaRapportini(rapportini, `rapportini_${orderId.slice(0, 8)}.xlsx`)
        .catch(() => toast.error(tr("Esportazione non riuscita. Riprova.")))
        .finally(() => setEsporto(false));
    }}>
      {esporto ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}{tr("Esporta Excel")}
    </Button>
  );
}

export function TotaliCampiCommessa({ orderId }: { orderId: string }) {
  const tr = useT();
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
  if (totali.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-card px-3 py-2 text-sm">
      {totali.map((t) => (
        <div key={`${t.chiave}@${t.phase_id ?? ""}`} className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-muted-foreground">{t.etichetta}{t.fase_nome ? ` · ${t.fase_nome}` : ""}</span>
          <span className="font-semibold tabular-nums">{quanto(t, Number(t.approvati), tr)}</span>
          {Number(t.da_approvare) > 0 && <span className="text-xs text-amber-700">{tr("{quanti} da approvare", { quanti: quanto(t, Number(t.da_approvare), tr) })}</span>}
        </div>
      ))}
    </div>
  );
}
