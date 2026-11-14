/**
 * I tre documenti economici di un rapportino, dal quadro dei costi (14/11/2026):
 * per il committente (prezzi di vendita, anteprima e invio), costi sostenuti, con margine.
 * L'operativo, senza soldi, resta il pulsante «Apri PDF» di sempre.
 */
import { useState } from "react";
import { FileDown, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DocumentoInvioDialog } from "@/components/documentiOperativi/DocumentoInvioDialog";
import { leggiDestinatarioRapporto } from "@/lib/documentiOperativi/destinatarioRapporto";
import type { DocumentoOperativo } from "@/lib/documentiOperativi/modello";
import {
  documentoPerCommittente, generaPdfInterno, type InfoRapportino, type QuadroDocumento, type VarianteInterna,
} from "@/lib/campo/rapportinoDocumenti";

async function leggiInfo(rapportinoId: string, companyId: string): Promise<InfoRapportino & { orderId: string }> {
  const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: r, error } = await db.from("campo_rapportini").select("order_id, data_lavoro, descrizione_lavori").eq("id", rapportinoId).maybeSingle();
  if (error || !r) throw new Error("Rapportino non disponibile.");
  const { data: o } = await db.from("orders").select("order_code, description, work_address, client_name, client_company")
    .eq("id", r.order_id).eq("company_id", companyId).maybeSingle();
  return {
    orderId: r.order_id, data: r.data_lavoro, descrizione: r.descrizione_lavori,
    commessa: o?.order_code ?? null, commessaDescrizione: o?.description ?? null, luogo: o?.work_address ?? null,
    cliente: o?.client_company || o?.client_name || null,
  };
}

export function DocumentiRapportino({ rapportinoId, quadro, vedeImporti, vedeMargini }: {
  rapportinoId: string; quadro: QuadroDocumento; vedeImporti: boolean; vedeMargini: boolean;
}) {
  const { effectiveCompany } = useAuth();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [doc, setDoc] = useState<{ documento: DocumentoOperativo; orderId: string } | null>(null);
  const companyId = effectiveCompany?.id;
  if (!companyId) return null;

  const interno = async (variante: VarianteInterna) => {
    setInCorso(variante);
    try {
      const info = await leggiInfo(rapportinoId, companyId);
      // Logo, colore e dati societari dell'azienda, come negli altri documenti.
      const blob = await generaPdfInterno(variante, quadro, info, effectiveCompany!);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Rapportino ${info.commessa ?? ""} ${info.data} - ${variante === "costi" ? "costi" : "costi e margine"}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF non creato");
    } finally { setInCorso(null); }
  };

  const committente = async () => {
    setInCorso("committente");
    try {
      const info = await leggiInfo(rapportinoId, companyId);
      const destinatario = await leggiDestinatarioRapporto(companyId, info.orderId);
      setDoc({ documento: documentoPerCommittente(quadro, info, destinatario), orderId: info.orderId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Documento non preparato");
    } finally { setInCorso(null); }
  };

  const icona = (k: string) => (inCorso === k ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileDown className="mr-1 h-3.5 w-3.5" />);
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-1.5">
      <span className="mr-1 text-[11px] text-muted-foreground">Documenti</span>
      {vedeImporti && (
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={!!inCorso} onClick={() => void committente()}>
          {inCorso === "committente" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}Per il committente
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={!!inCorso} onClick={() => void interno("costi")}>
        {icona("costi")}Costi sostenuti
      </Button>
      {vedeImporti && vedeMargini && (
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={!!inCorso} onClick={() => void interno("margine")}>
          {icona("margine")}Con margine
        </Button>
      )}
      {doc && (
        <DocumentoInvioDialog
          open
          onOpenChange={(v) => { if (!v) setDoc(null); }}
          documento={doc.documento}
          orderId={doc.orderId}
          modificaRighe
          initialMode="pdf"
          context={{ mode: "new", initialSubject: `Rapporto lavori in economia ${doc.documento.periodo ?? ""} · ${doc.documento.commessa ?? ""}` }}
        />
      )}
    </div>
  );
}
