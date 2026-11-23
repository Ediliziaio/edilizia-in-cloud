import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function AnteprimaPdfModelloMobile({ renderBlobUrl, depsKey, downloadFileName }: {
  renderBlobUrl: () => Promise<string>;
  depsKey: string;
  downloadFileName: string;
}) {
  const t = useT();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-11 gap-1.5 md:hidden">
          <Eye className="h-4 w-4" />{t("Anteprima PDF")}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[88dvh] flex-col gap-2 overflow-hidden p-3" aria-describedby={undefined}>
        <DialogHeader className="shrink-0 pr-10 text-left"><DialogTitle>{t("Anteprima modello PDF")}</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1">
          <PdfBlobLivePreviewPanel renderBlobUrl={renderBlobUrl} depsKey={depsKey} downloadFileName={downloadFileName} showDownloadOnMobile />
        </div>
      </DialogContent>
    </Dialog>
  );
}
