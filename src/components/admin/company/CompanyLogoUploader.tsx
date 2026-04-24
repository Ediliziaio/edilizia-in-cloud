/**
 * CompanyLogoUploader — Feature 10
 * Drag & drop logo upload per SuperAdmin con canvas resize 400×400 WebP.
 * Path storage: logos/{companyId}/{timestamp}.webp
 * URL: signed URL 1 anno di scadenza.
 */
import { useState, useRef, useCallback } from "react";
import { Upload, Trash2, ImageIcon, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import type { Company } from "@/types/auth";

interface CompanyLogoUploaderProps {
  company: Company;
  onLogoUpdated: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const OUTPUT_SIZE = 400; // px
const SIGNED_URL_EXPIRES = 365 * 24 * 60 * 60; // 1 year in seconds

/**
 * Ridimensiona e converte in WebP 400×400 via Canvas.
 * FIX: aggiunto timeout 15s — prima se l'immagine era corrotta o il browser
 * faceva hang silenzioso (caso raro ma possibile con GIF animate enormi),
 * la Promise non si risolveva mai e il pulsante "Carica" restava disabled.
 */
async function resizeToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    const timeoutId = setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Timeout caricamento immagine (>15s)"));
    }, 15_000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
    };

    img.onload = () => {
      cleanup();

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas context non disponibile"));

      // Centra mantenendo proporzioni (letterbox su sfondo bianco)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const scale = Math.min(OUTPUT_SIZE / img.width, OUTPUT_SIZE / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const offsetX = (OUTPUT_SIZE - drawW) / 2;
      const offsetY = (OUTPUT_SIZE - drawH) / 2;
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Conversione WebP fallita"));
          resolve(blob);
        },
        "image/webp",
        0.92,
      );
    };

    img.onerror = () => {
      cleanup();
      reject(new Error("Impossibile leggere l'immagine"));
    };

    img.src = objectUrl;
  });
}

export function CompanyLogoUploader({ company, onLogoUpdated }: CompanyLogoUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processAndUpload = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error("Formato non supportato", {
          description: "Usa PNG, JPG, WEBP o GIF",
        });
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error("File troppo grande", { description: "Dimensione massima: 10 MB" });
        return;
      }

      setIsUploading(true);
      try {
        // Resize → WebP
        const webpBlob = await resizeToWebP(file);

        const timestamp = Date.now();
        const storagePath = `logos/${company.id}/${timestamp}.webp`;

        // FIX ordine operazioni: PRIMA upload nuovo logo, POI aggiorna companies,
        // SOLO DOPO tutto success elimina i vecchi. Prima si eliminava per primo:
        // se upload falliva, il logo precedente era già stato cancellato → azienda
        // con `logo_url` valorizzato ma storage vuoto = logo rotto.
        const { error: uploadError } = await supabase.storage
          .from("company-logos")
          .upload(storagePath, webpBlob, {
            contentType: "image/webp",
            upsert: true,
          });
        if (uploadError) throw uploadError;

        // Signed URL (1 anno)
        // NB: architectural note — dopo 1 anno il signed URL scade. Mitigazione
        // applicativa: ogni ri-upload rigenera il link. Per una soluzione robusta
        // servirebbe un proxy server-side che rigenera on-demand.
        const { data: signedData, error: signedError } = await supabase.storage
          .from("company-logos")
          .createSignedUrl(storagePath, SIGNED_URL_EXPIRES);
        if (signedError) {
          // Cleanup: il blob appena caricato è orfano se non riusciamo a ottenere
          // il signed URL, rimuoviamolo per evitare accumulo storage
          await supabase.storage.from("company-logos").remove([storagePath]);
          throw signedError;
        }

        const logoUrl = signedData.signedUrl;

        // Aggiorna companies
        const { error: updateError } = await supabase
          .from("companies")
          .update({ logo_url: logoUrl })
          .eq("id", company.id);
        if (updateError) {
          // Cleanup: il blob è orfano anche qui
          await supabase.storage.from("company-logos").remove([storagePath]);
          throw updateError;
        }

        // Success path: ORA è sicuro eliminare i vecchi loghi (escludendo quello
        // appena caricato, che matchia il timestamp corrente).
        try {
          const { data: existingFiles } = await supabase.storage
            .from("company-logos")
            .list(`logos/${company.id}`);

          if (existingFiles && existingFiles.length > 0) {
            const toDelete = existingFiles
              .map((f) => `logos/${company.id}/${f.name}`)
              .filter((p) => p !== storagePath);
            if (toDelete.length > 0) {
              await supabase.storage.from("company-logos").remove(toDelete);
            }
          }
        } catch (cleanupErr) {
          // Cleanup non-critico: log ma non fallire l'upload
          logger.warn("CompanyLogoUploader old logo cleanup failed:", cleanupErr);
        }

        toast.success("Logo caricato", {
          description: "Ridimensionato a 400×400 WebP e salvato",
        });
        onLogoUpdated();
      } catch (err) {
        logger.error("CompanyLogoUploader upload error:", err);
        toast.error("Errore caricamento logo", {
          description: err instanceof Error ? err.message : "Riprova",
        });
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [company, onLogoUpdated],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processAndUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processAndUpload(file);
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const { data: existingFiles } = await supabase.storage
        .from("company-logos")
        .list(`logos/${company.id}`);

      if (existingFiles && existingFiles.length > 0) {
        const toDelete = existingFiles.map((f) => `logos/${company.id}/${f.name}`);
        await supabase.storage.from("company-logos").remove(toDelete);
      }

      const { error } = await supabase
        .from("companies")
        .update({ logo_url: null })
        .eq("id", company.id);
      if (error) throw error;

      toast.success("Logo rimosso");
      onLogoUpdated();
    } catch (err) {
      logger.error("CompanyLogoUploader remove error:", err);
      toast.error("Errore rimozione logo");
    } finally {
      setIsRemoving(false);
    }
  };

  const currentLogo = company.logo_url;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          Logo Aziendale
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Anteprima */}
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 flex-shrink-0 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden">
            {currentLogo ? (
              <img
                src={currentLogo}
                alt={company.name}
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {currentLogo ? (
              <p className="text-xs text-green-600 flex items-center gap-1 mb-2">
                <CheckCircle2 className="h-3 w-3" /> Logo presente
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mb-2">Nessun logo caricato</p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading || isRemoving}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {isUploading ? "Caricamento..." : currentLogo ? "Cambia" : "Carica"}
              </Button>
              {currentLogo && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading || isRemoving}
                  onClick={handleRemove}
                  className="text-destructive hover:text-destructive"
                >
                  {isRemoving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Rimuovi
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={[
            "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
            isDragOver
              ? "border-primary bg-primary/5 text-primary"
              : "border-muted-foreground/25 hover:border-primary/50 text-muted-foreground",
          ].join(" ")}
        >
          <Upload className="h-5 w-5 mx-auto mb-1" />
          <p className="text-xs font-medium">Trascina qui o clicca per selezionare</p>
          <p className="text-xs mt-0.5">PNG · JPG · WEBP · GIF — max 10 MB</p>
          <p className="text-xs text-primary/70 mt-0.5">Ridimensionato automaticamente a 400×400 WebP</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleFileChange}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
}
