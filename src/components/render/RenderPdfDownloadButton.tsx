import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  downloadRenderBeforeAfterPdf,
  type RenderPdfMetadataItem,
} from "@/lib/render/renderPdf";

interface RenderPdfDownloadButtonProps {
  beforeUrl?: string | null;
  afterUrl?: string | null;
  title: string;
  subtitle?: string;
  filename: string;
  metadata?: RenderPdfMetadataItem[];
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
  className?: string;
}

export function RenderPdfDownloadButton({
  beforeUrl,
  afterUrl,
  title,
  subtitle,
  filename,
  metadata,
  size = "sm",
  variant = "outline",
  className,
}: RenderPdfDownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!afterUrl) return;
    setLoading(true);
    try {
      await downloadRenderBeforeAfterPdf({
        beforeUrl,
        afterUrl,
        title,
        subtitle,
        filename,
        metadata,
      });
      toast.success("PDF render creato");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF non generato");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={!afterUrl || loading}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <FileDown className="h-4 w-4 mr-2" />
      )}
      Scarica PDF
    </Button>
  );
}
