/**
 * La foto di cantiere con un tocco (02/11/2026): si apre la fotocamera e, confermato lo scatto,
 * la foto parte da sola con data, ora e posizione. Senza campo resta in coda sul telefono.
 */
import type { ReactNode } from "react";
import { Camera, Loader2 } from "lucide-react";
import { useFotoCantiere } from "@/hooks/useFotoCantiere";
import { cn } from "@/lib/utils";

export function ScattaFoto({ orderId, nomeCantiere, galleria = false, className, children }: {
  orderId: string;
  nomeCantiere?: string;
  /** Galleria: più foto insieme, già scattate. Altrimenti apre direttamente la fotocamera. */
  galleria?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { upload, isUploading } = useFotoCantiere(orderId, { soloInvio: true });
  return (
    <label className={cn("flex cursor-pointer items-center justify-center gap-2 font-semibold", isUploading && "opacity-60", className)}>
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={isUploading}
        aria-label={galleria ? "Scegli foto dalla galleria" : "Scatta una foto del cantiere"}
        {...(galleria ? { multiple: true } : { capture: "environment" as const })}
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) void upload({ files, nomeCantiere }).finally(() => { e.target.value = ""; });
        }}
      />
      {isUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : !children && <Camera className="h-4 w-4" aria-hidden="true" />}
      {children ?? "Foto"}
    </label>
  );
}
