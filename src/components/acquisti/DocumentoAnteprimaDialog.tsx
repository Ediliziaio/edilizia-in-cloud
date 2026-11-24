import { lazy, Suspense, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { supabase } from "@/integrations/supabase/client";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import {
  nomeFileDocumento,
  type DocumentoOperativo,
} from "@/lib/documentiOperativi/modello";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
const PdfPanel = lazy(() =>
  import("@/components/shared/PdfBlobLivePreviewPanel").then((m) => ({
    default: m.PdfBlobLivePreviewPanel,
  })),
);
export function DocumentoAnteprimaDialog({
  documento,
  descrizione,
  file,
  onClose,
}: {
  documento?: DocumentoOperativo;
  descrizione?: string;
  file?: { path: string; bucket: string; name: string };
  onClose: () => void;
}) {
  const t = useT();
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
      <DialogContent struttura="contenuta" className="flex h-[90dvh] max-w-5xl flex-col overflow-hidden rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {t("Anteprima PDF · {nome}", { nome: snapshot?.numero ?? originalFile?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>
            {snapshot
              ? `${snapshot.destinatario.nome} · ${descrizione ?? t("Dati salvati al momento dell’apertura.")}`
              : t("Allegato originale conservato nell’email.")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<p role="status">{t("Caricamento anteprima…")}</p>}>
            <PdfPanel
              headerLabel={t("Documento pronto da controllare")}
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
                      t("PDF non disponibile per questo utente. Aprilo dalla casella del mittente oppure riprova."),
                    );
                  return createPdfPreviewUrl(data);
                }
                if (!snapshot) throw new Error(t("Documento non disponibile"));
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
