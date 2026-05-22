/**
 * AdVideoUploader — upload video drag&drop nella libreria ad_media.
 *
 * Equivalente di AdMediaUploader ma per kind='video'.
 *
 * Limiti Meta video ads:
 *   • Formato: MP4, MOV (preferito), AVI
 *   • Risoluzione: min 600x600, ideali 1080x1080 (1:1) o 1080x1350 (4:5)
 *   • Durata: 1s-241min (sweet spot 5-15s per feed/story/reels)
 *   • Peso: max 250MB upload diretto, 4GB via resumable
 *   • Bitrate consigliato: 30Mbps max
 *   • Audio: AAC, 128kbps+
 *
 * Per V1 usiamo Supabase Storage diretto (no resumable upload). Per file
 * grandi >50MB consigliamo a future iteration la modalità chunked.
 */

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Video, X, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const STORAGE_BUCKET = "ad-media";
const MAX_BYTES = 200 * 1024 * 1024; // 200 MB
const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
const ACCEPTED_EXTENSIONS = [".mp4", ".mov", ".avi", ".webm"];

interface Props {
  companyId: string | undefined;
  onUploaded?: (media: { id: string; public_url: string }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromTable = (n: string) => (supabase as any).from(n);

export function AdVideoUploader({ companyId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const qc = useQueryClient();

  const reset = () => {
    setPreview(null);
    setPreviewFile(null);
    setName("");
    setDuration(null);
    setDimensions(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    if (!companyId) {
      toast.error("Azienda non identificata");
      return;
    }

    // Validate type
    const fileName = file.name.toLowerCase();
    const typeOk = ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
    if (!typeOk) {
      toast.error("Formato non supportato", {
        description: "Usa MP4, MOV, AVI o WebM.",
      });
      return;
    }

    if (file.size > MAX_BYTES) {
      toast.error("File troppo grande", {
        description: `Max ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB. Comprimi il video o riducine la durata.`,
      });
      return;
    }

    // Genera preview locale + leggi metadata
    const blobUrl = URL.createObjectURL(file);
    setPreview(blobUrl);
    setPreviewFile(file);
    setName(file.name.replace(/\.[^/.]+$/, "").slice(0, 60));

    // Estrai durata + dimensioni
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = blobUrl;
    video.onloadedmetadata = () => {
      setDuration(Math.round(video.duration));
      setDimensions({ w: video.videoWidth, h: video.videoHeight });
      // Warning se troppo piccolo
      if (video.videoWidth < 600 || video.videoHeight < 600) {
        toast.warning("Risoluzione bassa", {
          description: "Meta consiglia minimo 600x600. Per qualità migliore usa 1080x1080.",
        });
      }
    };
  };

  const upload = async () => {
    if (!previewFile || !companyId) return;
    setIsUploading(true);
    setProgress(10);

    try {
      const ext = previewFile.name.split(".").pop()?.toLowerCase() ?? "mp4";
      const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

      // Upload to Storage
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, previewFile, {
          contentType: previewFile.type || "video/mp4",
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadErr) {
        if (uploadErr.message.includes("Bucket not found")) {
          toast.error("Storage non configurato", {
            description: `Crea il bucket '${STORAGE_BUCKET}' in Supabase Storage.`,
          });
          return;
        }
        throw uploadErr;
      }

      setProgress(70);

      // Get public URL
      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(uploadData.path);
      const publicUrl = urlData.publicUrl;

      // Aspect ratio approx
      let aspectRatio: string | null = null;
      if (dimensions) {
        const ratio = dimensions.w / dimensions.h;
        if (Math.abs(ratio - 1) < 0.1) aspectRatio = "1:1";
        else if (Math.abs(ratio - 16 / 9) < 0.1) aspectRatio = "16:9";
        else if (Math.abs(ratio - 9 / 16) < 0.1) aspectRatio = "9:16";
        else if (Math.abs(ratio - 4 / 5) < 0.1) aspectRatio = "4:5";
        else aspectRatio = `${dimensions.w}:${dimensions.h}`;
      }

      // Insert row in ad_media
      const { data: row, error: insertErr } = await fromTable("ad_media")
        .insert({
          company_id: companyId,
          name: name || previewFile.name,
          kind: "video",
          source: "upload",
          storage_bucket: STORAGE_BUCKET,
          storage_path: uploadData.path,
          public_url: publicUrl,
          width_px: dimensions?.w ?? null,
          height_px: dimensions?.h ?? null,
          duration_seconds: duration,
          file_size_bytes: previewFile.size,
          mime_type: previewFile.type || "video/mp4",
          aspect_ratio: aspectRatio,
        })
        .select("id, public_url")
        .single();

      if (insertErr) throw insertErr;

      setProgress(100);
      toast.success("Video caricato!", {
        description: `${name || previewFile.name}${duration ? ` · ${duration}s` : ""}${aspectRatio ? ` · ${aspectRatio}` : ""}`,
      });

      // Invalida libreria asset
      qc.invalidateQueries({ queryKey: ["ad-media-library", companyId] });

      onUploaded?.({ id: row.id, public_url: row.public_url });
      URL.revokeObjectURL(preview!);
      reset();
    } catch (e) {
      console.error("[AdVideoUploader] upload failed", e);
      toast.error("Errore upload", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIsUploading(false);
      setTimeout(() => setProgress(0), 1200);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-rose-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-950">Carica video</p>
            <p className="text-[11px] text-slate-500">
              MP4/MOV · max 200 MB · ideali 1080x1080 (1:1) o 1080x1350 (4:5) · 5-30 secondi
            </p>
          </div>
        </div>

        {!preview ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className={cn(
              "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition",
              dragOver
                ? "border-rose-400 bg-rose-50"
                : "border-slate-300 bg-slate-50 hover:border-slate-400",
            )}
          >
            <Upload className={cn("h-6 w-6", dragOver ? "text-rose-600" : "text-slate-400")} />
            <p className="text-sm font-medium text-slate-700">
              Trascina qui un video o <span className="text-rose-600 underline">scegli file</span>
            </p>
            <p className="text-[10px] text-slate-500">.mp4 · .mov · .webm · .avi</p>
          </button>
        ) : (
          <div className="space-y-2">
            <div className="relative overflow-hidden rounded-xl border bg-black">
              <video
                src={preview}
                controls
                className="aspect-video w-full"
                preload="metadata"
              />
              <button
                type="button"
                onClick={reset}
                disabled={isUploading}
                className="absolute right-2 top-2 rounded-full bg-white/90 p-1 shadow"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
              {duration !== null && (
                <div className="rounded-md border bg-slate-50 px-2 py-1 text-center">
                  ⏱️ {duration}s
                </div>
              )}
              {dimensions && (
                <div className="rounded-md border bg-slate-50 px-2 py-1 text-center">
                  📐 {dimensions.w}×{dimensions.h}
                </div>
              )}
              <div className="rounded-md border bg-slate-50 px-2 py-1 text-center">
                💾 {(previewFile!.size / 1024 / 1024).toFixed(1)} MB
              </div>
            </div>

            {duration !== null && (duration < 1 || duration > 240) && (
              <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {duration < 1 ? "Video troppo corto (min 1s)" : "Sopra 4 minuti — Meta non consiglia per feed"}
              </div>
            )}

            <div>
              <Label className="mb-1 block text-[11px]">Nome asset</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                placeholder="Es. Demo posa serramenti Milano"
                maxLength={60}
              />
            </div>

            {isUploading && (
              <div>
                <Progress value={progress} className="h-2" />
                <p className="mt-1 text-center text-[10px] text-slate-500">
                  {progress < 70 ? "Upload in corso..." : "Salvataggio metadata..."}
                </p>
              </div>
            )}

            <Button
              onClick={upload}
              disabled={isUploading || !name.trim()}
              className="w-full bg-rose-600 hover:bg-rose-700"
            >
              {isUploading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Caricamento...</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" /> Salva in libreria</>
              )}
            </Button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </CardContent>
    </Card>
  );
}

export default AdVideoUploader;
