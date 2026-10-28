import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Download, Eye, Loader2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { SurveyDetail } from "@/lib/api/surveys";
import { surveyPdfName, type SurveyReferences } from "@/lib/surveys/report";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { downloadQuotePdf } from "@/lib/preventivi/quotePdfDownload";
import { toast } from "sonner";
import type { SurveyPdfBrand } from "@/lib/surveys/pdfBrand";

const PdfPanel = lazy(() =>
  import("@/components/shared/PdfBlobLivePreviewPanel").then((m) => ({
    default: m.PdfBlobLivePreviewPanel,
  })),
);
export function SurveyPdfTools({
  detail,
  companyName,
  disabled = false,
  references,
  brand,
  compact = false,
}: {
  detail: SurveyDetail;
  companyName: string;
  disabled?: boolean;
  references?: SurveyReferences;
  brand?: SurveyPdfBrand;
  compact?: boolean;
}) {
  const [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  // Media and area edits do not necessarily update the survey header timestamp.
  const previewKey = useMemo(
    () => JSON.stringify([detail, companyName, references, brand]),
    [detail, companyName, references, brand],
  );
  const alive = useRef(true),
    inFlight = useRef(false);
  const cache = useRef<{
    detail: SurveyDetail;
    companyName: string;
    references?: SurveyReferences;
    brandKey?: string;
    promise: Promise<Blob>;
  } | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const getBlob = useCallback(() => {
    if (
      cache.current?.detail === detail &&
      cache.current.companyName === companyName &&
      cache.current.references === references &&
      cache.current.brandKey === JSON.stringify(brand)
    )
      return cache.current.promise;
    const promise = import("@/lib/surveys/reportPdf").then((m) =>
      m.renderSurveyPdf(detail, companyName, references, brand),
    );
    cache.current = {
      detail,
      companyName,
      references,
      brandKey: JSON.stringify(brand),
      promise,
    };
    void promise.catch(() => {
      if (cache.current?.promise === promise) cache.current = null;
    });
    return promise;
  }, [detail, companyName, references, brand]);
  const previewUrl = useCallback(
    async () => createPdfPreviewUrl(await getBlob()),
    [getBlob],
  );
  const download = async () => {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const blob = await getBlob();
      if (!alive.current) return;
      downloadQuotePdf(blob, surveyPdfName(detail.survey.code));
      toast.success("PDF scaricato", {
        description: "Report dei dati salvati; nessun invio al cliente.",
      });
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "PDF non disponibile. Riprova.",
        );
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const openSaved = async () => {
    const target = window.open("", "_blank");
    if (target) {
      target.opener = null;
      target.document.title = "Documento archiviato";
      target.document.body.textContent = "Apertura del documento originale…";
    }
    try {
      const { resolveSavedSurveyReport } =
        await import("@/lib/surveys/savedReport");
      const url = await resolveSavedSurveyReport(detail.survey);
      if (!alive.current) {
        target?.close();
        return;
      }
      if (target && !target.closed) target.location.replace(url);
      else
        throw new Error(
          "Il browser ha bloccato l’apertura. Consenti la nuova scheda e riprova.",
        );
    } catch (e) {
      target?.close();
      if (alive.current)
        setError(e instanceof Error ? e.message : "Documento non disponibile.");
    }
  };
  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="Documento del sopralluogo"
      >
        <Button
          type="button"
          variant="outline"
          className={`${compact ? "min-h-11" : "min-h-10"} rounded-xl gap-2`}
          disabled={disabled || busy}
          onClick={() => setPreview(true)}
        >
          <Eye className="h-4 w-4" />
          {compact ? "PDF" : "Anteprima PDF"}
        </Button>
        {!compact && (
          <Button
            type="button"
            className="min-h-10 rounded-xl gap-2 bg-blue-700 text-white hover:bg-blue-800"
            disabled={disabled || busy}
            onClick={() => void download()}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {busy ? "Preparo PDF…" : "Scarica PDF"}
          </Button>
        )}
        {detail.survey.pdf_report_url && (
          <Button
            variant="ghost"
            className="min-h-10 gap-2 rounded-xl"
            onClick={() => void openSaved()}
            disabled={disabled || busy}
          >
            <Archive className="h-4 w-4" />
            Documento archiviato
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="basis-full text-sm text-red-700">
          {error}
        </p>
      )}
      {preview && (
        <Dialog open onOpenChange={setPreview}>
          <DialogContent className="flex h-[92dvh] max-w-5xl flex-col overflow-hidden rounded-2xl p-4">
            <DialogHeader className="shrink-0 pr-9">
              <DialogTitle>PDF · {detail.survey.code}</DialogTitle>
              <DialogDescription>
                Report dei dati salvati. Nessun documento viene inviato o
                archiviato automaticamente.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1">
              <Suspense fallback={<p role="status">Preparo l’anteprima…</p>}>
                <PdfPanel
                  renderBlobUrl={previewUrl}
                  depsKey={previewKey}
                  debounceMs={0}
                  downloadFileName={surveyPdfName(detail.survey.code)}
                  showDownloadOnMobile
                />
              </Suspense>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
