/**
 * Avviso nella pagina del preventivo: il computo (o la pianta da cui prende le misure) è
 * cambiato dopo che il preventivo è stato fatto. In bozza si aggiornano le quantità; se è già
 * stato mandato o firmato si fa una revisione aggiornata, e il documento del cliente resta com'era.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { duplicaPreventivo } from "@/lib/quotes/duplicaPreventivo";
import { aggiornaQuantita, usePreventivoEComputo } from "@/lib/quotes/preventivoEComputo";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", signDisplay: "exceptZero" }).format(n);

export function PreventivoDaAggiornare({ quoteId, companyId, bozza }: { quoteId: string; companyId: string; bozza: boolean }) {
  const { data } = usePreventivoEComputo(quoteId, companyId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [lavoro, setLavoro] = useState(false);
  const vecchie = data?.vecchie ?? [];
  if (!vecchie.length) return null;
  const totale = vecchie.reduce((t, r) => t + r.differenzaImporto, 0);

  const aggiorna = async () => {
    setLavoro(true);
    try {
      if (bozza) {
        await aggiornaQuantita(quoteId, companyId, new Map(vecchie.map((r) => [r.riga.id, r.nuova])));
        toast.success("Quantità aggiornate dal computo");
      } else {
        // la revisione copia le righe con la loro voce del computo: si aggiornano quelle
        const { id: nuovo } = await duplicaPreventivo(quoteId, companyId, { comeRevisione: true });
        const perVoce = new Map(vecchie.map((r) => [r.riga.computo_voce_id!, r.nuova]));
        const { data: copie } = await supabase.from("quote_items").select("id, computo_voce_id").eq("quote_id", nuovo).eq("company_id", companyId);
        const nuove = new Map<string, number>();
        for (const c of copie ?? []) if (c.computo_voce_id && perVoce.has(c.computo_voce_id)) nuove.set(c.id, perVoce.get(c.computo_voce_id)!);
        await aggiornaQuantita(nuovo, companyId, nuove);
        toast.success("Revisione aggiornata creata", { description: "Il preventivo già mandato resta com'era; la revisione parte in bozza." });
        navigate(`/azienda/marketing/preventivi/${nuovo}`);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["preventivo-e-computo"] }),
        qc.invalidateQueries({ queryKey: queryKeys.quotes.detail(quoteId) }),
        qc.invalidateQueries({ queryKey: queryKeys.quotes.items(quoteId) }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aggiornamento non riuscito.");
    } finally {
      setLavoro(false);
    }
  };

  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p>
          <strong>Il computo è cambiato dopo questo preventivo</strong>: {vecchie.length === 1 ? "una riga ha" : `${vecchie.length} righe hanno`} una quantità diversa
          {totale !== 0 && <> ({euro(totale)} sul totale)</>}.
        </p>
        <ul className="text-xs text-amber-900">
          {vecchie.slice(0, 4).map((r) => (
            <li key={r.riga.id}>{r.riga.name || "Voce"}: {Number(r.riga.quantity).toLocaleString("it-IT")} → {r.nuova.toLocaleString("it-IT")}</li>
          ))}
          {vecchie.length > 4 && <li>…e altre {vecchie.length - 4}</li>}
        </ul>
      </div>
      <Button variant="outline" className="shrink-0 bg-white" disabled={lavoro} onClick={() => void aggiorna()}>
        <RefreshCw className="mr-1.5 h-4 w-4" />
        {bozza ? "Aggiorna le quantità" : "Crea una revisione aggiornata"}
      </Button>
    </div>
  );
}
