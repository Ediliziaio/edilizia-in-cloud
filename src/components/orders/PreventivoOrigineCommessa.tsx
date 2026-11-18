import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Loader2, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { documentoFirmato, ETICHETTA_FIRMA, modoFirma } from "@/lib/preventivi/contrattoFirmato";
import { scaricaCopiaPdf } from "@/lib/preventivi/pdfFirmatoPreventivo";
import { documentoPreventivoOrigine } from "@/lib/orders/preventivoOrigineDocumento";

export function PreventivoOrigineCommessa({ quoteId, quoteNumber, companyId }: {
  quoteId?: string | null;
  quoteNumber?: string | null;
  companyId?: string | null;
}) {
  const [scaricando, setScaricando] = useState(false);
  const q = useQuery({
    queryKey: ["commessa-preventivo-origine", companyId, quoteId],
    enabled: !!quoteId && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes")
        .select("id, company_id, quote_number, pdf_storage_path, signed_at, firma_modo, contratto_firmato")
        .eq("company_id", companyId!).eq("id", quoteId!).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Preventivo non disponibile con i tuoi permessi.");
      return data;
    },
  });
  if (!quoteId || !companyId) return null;
  const firma = q.data ? modoFirma(q.data) : null;
  const scansione = q.data ? documentoFirmato(q.data.contratto_firmato) : null;
  const titoloDownload = scansione ? "Scarica documento firmato" : firma === "digitale" ? "Scarica PDF firmato" : "Scarica PDF";

  const scarica = async () => {
    if (!q.data || scaricando) return;
    setScaricando(true);
    try {
      const aggiornato = await q.refetch();
      if (aggiornato.error || !aggiornato.data) throw new Error("Non è stato possibile verificare il documento aggiornato. Riprova.");
      scaricaCopiaPdf(await documentoPreventivoOrigine(aggiornato.data));
    }
    catch (e) { toast.error("Documento non scaricato", { description: e instanceof Error ? e.message : "Riprova." }); }
    finally { setScaricando(false); }
  };

  return <section aria-label="Preventivo di origine" className="rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-center gap-3">
      <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold">Preventivo {q.data?.quote_number || quoteNumber || "di origine"}</h4>
        <p className="text-xs text-muted-foreground">Da questo preventivo è stata creata la commessa{firma ? ` · ${ETICHETTA_FIRMA[firma]}` : ""}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="ghost"><Link to={`/azienda/marketing/preventivi/${quoteId}`}>Apri preventivo<ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" /></Link></Button>
        <Button size="sm" variant="outline" disabled={!q.data || q.isError || scaricando} onClick={scarica}>
          {q.isLoading || scaricando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          {scaricando ? "Preparazione…" : titoloDownload}
        </Button>
      </div>
    </div>
    {q.isError && <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive">Documento non disponibile. Verifica l'accesso al preventivo o riprova.<Button size="sm" variant="ghost" onClick={() => void q.refetch()}>Riprova</Button></div>}
  </section>;
}
