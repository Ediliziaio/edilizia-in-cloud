import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DocumentoInvioDialog } from "@/components/documentiOperativi/DocumentoInvioDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";
import { preparaRendicontoGiornaliero } from "@/lib/documentiOperativi/preparaRendicontoGiornaliero";
import type { DocumentoOperativo } from "@/lib/documentiOperativi/modello";

/** «PDF» del rendiconto giornaliero: prepara il documento dal DB e apre l'anteprima/invio. */
export function PulsantePdfRendiconto({ rendicontoId, className }: { rendicontoId: string; className?: string }) {
  const tr = useT();
  const { effectiveCompany } = useAuth();
  const [doc, setDoc] = useState<DocumentoOperativo | null>(null);
  const [busy, setBusy] = useState(false);
  const apri = async () => {
    if (!effectiveCompany?.id || busy) return;
    setBusy(true);
    try { setDoc(await preparaRendicontoGiornaliero(effectiveCompany.id, rendicontoId)); }
    catch (e) { toast.error(messaggioErrore(e, tr("Non riesco a preparare il PDF. Riprova."))); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Button type="button" variant="outline" size="sm" className={className ?? "h-8 gap-1.5 px-2.5 text-xs"} disabled={busy} onClick={() => void apri()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}{tr("PDF")}
      </Button>
      {doc && (
        <DocumentoInvioDialog open onOpenChange={(v) => { if (!v) setDoc(null); }} documento={doc} modificaRighe initialMode="pdf"
          context={{ mode: "new", initialSubject: `${tr("Rendiconto del")} ${doc.data?.split("-").reverse().join("/") ?? ""} n. ${doc.numero}` }} />
      )}
    </>
  );
}
