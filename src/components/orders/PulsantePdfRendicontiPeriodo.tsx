/**
 * «Crea documento PDF» dell'elenco dei rendiconti (28/11/2026): un documento solo con tutti i
 * rendiconti che si stanno guardando — un blocco per giorno — come il rapporto del periodo dei
 * rapportini. Quello che è filtrato nell'elenco è quello che finisce nel documento: così si stampa
 * un mese, o i soli trasporti, senza altre scelte da fare.
 */
import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DocumentoInvioDialog } from "@/components/documentiOperativi/DocumentoInvioDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";
import { preparaRendicontoPeriodo } from "@/lib/documentiOperativi/preparaRendicontoPeriodo";
import type { DocumentoOperativo } from "@/lib/documentiOperativi/modello";
import type { RendicontoGiornaliero } from "@/lib/rendiconti/rendicontiGiornalieri";

export function PulsantePdfRendicontiPeriodo({ orderId, rendiconti }: {
  orderId: string;
  /** I rendiconti come si vedono adesso nell'elenco (già filtrati). */
  rendiconti: RendicontoGiornaliero[];
}) {
  const tr = useT();
  const { effectiveCompany } = useAuth();
  const [doc, setDoc] = useState<DocumentoOperativo | null>(null);
  const [busy, setBusy] = useState(false);
  const utili = rendiconti.filter((r) => r.stato !== "annullato" && r.righe > 0);
  const apri = async () => {
    if (!effectiveCompany?.id || busy) return;
    setBusy(true);
    try { setDoc(await preparaRendicontoPeriodo(effectiveCompany.id, orderId, rendiconti)); }
    catch (e) { toast.error(messaggioErrore(e, tr("Non riesco a preparare il PDF. Riprova."))); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" disabled={busy || utili.length === 0}
        title={utili.length === 0 ? tr("Nessun rendiconto con righe da stampare") : undefined} onClick={() => void apri()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        {tr("Crea documento PDF")}
        {utili.length > 0 && <span className="tabular-nums opacity-70">{utili.length}</span>}
      </Button>
      {doc && (
        <DocumentoInvioDialog open onOpenChange={(v) => { if (!v) setDoc(null); }} documento={doc} modificaRighe initialMode="pdf"
          context={{ mode: "new", initialSubject: `${tr("Rendiconto")} ${doc.periodo ?? ""}` }} />
      )}
    </>
  );
}
