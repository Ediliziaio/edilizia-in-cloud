import { lazy, Suspense, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import {
  nomeFileDocumento,
  type DocumentoOperativo,
} from "@/lib/documentiOperativi/modello";
const PdfPanel = lazy(() =>
  import("@/components/shared/PdfBlobLivePreviewPanel").then((m) => ({
    default: m.PdfBlobLivePreviewPanel,
  })),
);
export function DocumentoAnteprimaDialog({
  documento,
  file,
  onClose,
}: {
  documento?: DocumentoOperativo;
  file?: { path: string; bucket: string; name: string };
  onClose: () => void;
}) {
  const { effectiveCompany } = useAuth();
  const [snapshot] = useState(documento);
  const [originalFile] = useState(file);
  if (!effectiveCompany) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[90dvh] max-w-5xl flex-col overflow-hidden rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>
            Anteprima PDF · {snapshot?.numero ?? originalFile?.name}
          </DialogTitle>
          <DialogDescription>
            {snapshot
              ? `${snapshot.destinatario.nome} · Dati salvati al momento dell’apertura.`
              : "Allegato originale conservato nell’email."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<p role="status">Caricamento anteprima…</p>}>
            <PdfPanel
              headerLabel="Documento pronto da controllare"
              depsKey={JSON.stringify(snapshot ?? originalFile)}
              debounceMs={0}
              showDownloadOnMobile
              downloadFileName={
                snapshot
                  ? nomeFileDocumento(snapshot)
                  : (originalFile?.name ?? "documento.pdf")
              }
              renderBlobUrl={async () => {
                if (originalFile) {
                  const { data, error } = await supabase.storage
                    .from(originalFile.bucket)
                    .download(originalFile.path);
                  if (error)
                    throw new Error(
                      "PDF non disponibile per questo utente. Aprilo dalla casella del mittente oppure riprova.",
                    );
                  return createPdfPreviewUrl(data);
                }
                if (!snapshot) throw new Error("Documento non disponibile");
                const { generaPdfOperativo } =
                  await import("@/lib/documentiOperativi/pdf");
                return createPdfPreviewUrl(
                  await generaPdfOperativo(snapshot, effectiveCompany),
                );
              }}
            />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
