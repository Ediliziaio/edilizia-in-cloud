/**
 * AdMediaUploader — drag&drop / picker per upload immagini in ad_media.
 *
 * Limiti:
 *   • PNG / JPG / WebP, max 10 MB
 *   • Validazione dimensioni minime (Meta richiede min 600px lato corto)
 */
import { useRef, useState } from "react";
import { Upload, Image as ImageIcon, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const STORAGE_BUCKET = "ad-media";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface Props {
  companyId: string | undefined;
  onUploaded?: (media: { id: string; public_url: string }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromTable = (n: string) => (supabase as any).from(n);

export function AdMediaUploader({ companyId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const qc = useQueryClient();

  const resetUploadState = () => {
    setPreview(null);
    setName("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    if (!companyId) {
      toast.error("Azienda non identificata");
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Formato non supportato", {
        description: "Solo PNG, JPG, WebP",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("File troppo grande", {
        description: `Max ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB`,
      });
      return;
    }

    // Preview locale
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setIsUploading(true);
    try {
      // 1. Upload su Storage
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const fileName = `${companyId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

      let uploadResult = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false,
        });

      // Se bucket non esiste prova a crearlo
      if (uploadResult.error && String(uploadResult.error.message).includes("not found")) {
        await supabase.storage.createBucket(STORAGE_BUCKET, {
          public: true,
          fileSizeLimit: MAX_BYTES,
        });
        uploadResult = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(fileName, file, { contentType: file.type });
      }

      if (uploadResult.error) {
        toast.error("Upload fallito", { description: uploadResult.error.message });
        return;
      }

      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
      const publicUrl = pub.publicUrl;
      const fallbackMediaId = `storage-${Date.now()}`;

      // 2. Leggi dimensioni immagine
      let widthPx = 0;
      let heightPx = 0;
      let aspectRatio = "";
      try {
        const dim = await getImageDimensions(file);
        widthPx = dim.width;
        heightPx = dim.height;
        if (widthPx > 0 && heightPx > 0) {
          const ratio = widthPx / heightPx;
          aspectRatio =
            Math.abs(ratio - 1) < 0.05
              ? "1:1"
              : Math.abs(ratio - 4 / 5) < 0.05
              ? "4:5"
              : Math.abs(ratio - 9 / 16) < 0.05
              ? "9:16"
              : Math.abs(ratio - 16 / 9) < 0.05
              ? "16:9"
              : `${widthPx}:${heightPx}`;
        }
      } catch {
        // dimensioni opzionali
      }

      // Warning se troppo piccola per Meta
      if (widthPx > 0 && (widthPx < 600 || heightPx < 600)) {
        toast.warning("Immagine piccola", {
          description: `${widthPx}×${heightPx}px — Meta consiglia almeno 600px lato corto`,
        });
      }

      // 3. Insert in ad_media
      try {
        const { data: media, error: insertErr } = await fromTable("ad_media")
          .insert({
            company_id: companyId,
            name: name.trim() || file.name,
            kind: "image",
            source: "upload",
            storage_bucket: STORAGE_BUCKET,
            storage_path: fileName,
            public_url: publicUrl,
            width_px: widthPx || null,
            height_px: heightPx || null,
            file_size_bytes: file.size,
            mime_type: file.type,
            aspect_ratio: aspectRatio || null,
            tags: ["upload"],
          })
          .select("id, public_url")
          .single();

        if (insertErr) {
          const msg = String(insertErr.message ?? "");
          if (msg.includes("does not exist") || msg.includes("schema cache")) {
            toast.warning("Migration ad_media non applicata", {
              description: "L'immagine è stata caricata in Storage ma non indicizzata nel DB.",
            });
            onUploaded?.({ id: fallbackMediaId, public_url: publicUrl });
            resetUploadState();
            return;
          }
          throw insertErr;
        }

        toast.success("Immagine caricata", {
          description: `${widthPx}×${heightPx}px · ${(file.size / 1024).toFixed(0)} KB`,
        });

        qc.invalidateQueries({ queryKey: ["ad-media-library"] });
        onUploaded?.(media as { id: string; public_url: string });
        resetUploadState();
      } catch (e) {
        toast.error("Errore inserimento DB", {
          description: String((e as Error).message ?? e),
        });
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <Label className="mb-1 block text-xs">Nome immagine (opzionale)</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es. Bagno via Roma — prima/dopo"
          />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${
            dragOver ? "border-orange-400 bg-orange-50" : "border-slate-300 bg-slate-50"
          }`}
        >
          {preview ? (
            <div className="relative">
              <img loading="lazy"
                src={preview}
                alt="Preview"
                className="max-h-48 rounded-lg object-contain"
              />
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow"
                aria-label="Rimuovi"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
                <ImageIcon className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                Trascina un'immagine qui o clicca per scegliere
              </p>
              <p className="mt-1 text-xs text-slate-500">
                PNG, JPG, WebP · max 10 MB · consigliato min 600px lato corto
              </p>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isUploading ? "Upload in corso..." : "Scegli file"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile leggere dimensioni"));
    };
    img.src = url;
  });
}
