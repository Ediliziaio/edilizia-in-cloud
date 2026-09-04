import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/hooks/useBranding";
import {
  downloadRenderBeforeAfterPdf,
  type RenderPdfMetadataItem,
} from "@/lib/render/renderPdf";

import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const { effectiveCompany } = useAuth();
  const { branding } = useBranding();
  const companyLogoUrl =
    branding?.logo_url ||
    branding?.email_header_logo_url ||
    (effectiveCompany as { logo_url?: string | null } | null)?.logo_url ||
    null;

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
        companyLogoUrl,
      });
      toast.success("PDF render creato");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF non generato");
    } finally {
      setLoading(false);
    }
  };

  // Niente scarico su telefono: il render resta visibile, non scaricabile.
  if (isMobile) return null;

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
      <span className="hidden sm:inline">Scarica PDF</span>
      <span className="sm:hidden">PDF</span>
    </Button>
  );
}
