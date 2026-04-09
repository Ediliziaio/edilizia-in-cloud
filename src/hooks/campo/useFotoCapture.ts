import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { compressImage } from "@/lib/campo/foto-compressor";
import { applyWatermark } from "@/lib/campo/foto-watermark";
import {
  requireGeotag,
  type GeoTag,
} from "@/lib/campo/foto-geotag-validator";
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
import { isOnline } from "@/lib/campo/network-status";

const BUCKET = "campo-foto";
const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15MB pre-compressione

export interface CapturedPhoto {
  blob: Blob;
  url: string; // object URL per preview
  path: string; // path remoto su storage
  geo: GeoTag;
  sizeBytes: number;
  uploaded: boolean;
  queued: boolean;
}

export interface UseFotoCaptureResult {
  uploading: boolean;
  error: string | null;
  capture: (
    file: File | Blob,
    context: { nomeCantiere?: string; operaio?: string; orderId?: string },
  ) => Promise<CapturedPhoto | null>;
  clearError: () => void;
}

export function useFotoCapture(): UseFotoCaptureResult {
  const { user, profile } = useAuth();
  const { enqueue } = useOfflineSync();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(
    async (
      file: File | Blob,
      context: { nomeCantiere?: string; operaio?: string; orderId?: string },
    ): Promise<CapturedPhoto | null> => {
      setError(null);

      // Validazione MIME
      const mime = file.type.toLowerCase();
      if (!/^image\/(jpeg|png|webp)$/.test(mime)) {
        setError("Formato non supportato. Usa JPEG, PNG o WebP.");
        return null;
      }
      if (file.size > MAX_INPUT_BYTES) {
        setError("Foto troppo grande (max 15MB). Riprova con qualità minore.");
        return null;
      }

      if (!user?.id) {
        setError("Sessione scaduta. Accedi di nuovo.");
        return null;
      }

      setUploading(true);

      try {
        // 1. Richiedi geotag obbligatorio
        const geoResult = await requireGeotag();
        if (!geoResult.ok || !geoResult.geo) {
          setError(geoResult.message ?? "GPS non disponibile");
          return null;
        }

        // 2. Comprimi foto
        const compressed = await compressImage(file);

        // 3. Applica watermark
        const watermarked = await applyWatermark(compressed.blob, {
          dataOra: new Date(),
          nomeCantiere: context.nomeCantiere,
          operaio: context.operaio,
          geo: geoResult.geo,
        });

        // 4. Costruisci path storage: {user_id}/{yyyyMMdd}/{timestamp}-{random}.jpg
        const now = new Date();
        const y = now.getFullYear();
        const m = (now.getMonth() + 1).toString().padStart(2, "0");
        const d = now.getDate().toString().padStart(2, "0");
        const rand = Math.random().toString(36).slice(2, 8);
        const filename = `${now.getTime()}-${rand}.jpg`;
        const path = `${user.id}/${y}${m}${d}/${filename}`;

        let uploaded = false;
        let queued = false;

        if (isOnline()) {
          const { error: upError } = await supabase.storage
            .from(BUCKET)
            .upload(path, watermarked, {
              contentType: "image/jpeg",
              upsert: false,
            });
          if (upError) {
            // Fallback: coda offline
            await enqueue("foto", {
              bucket: BUCKET,
              path,
              blob: watermarked,
              contentType: "image/jpeg",
            });
            queued = true;
          } else {
            uploaded = true;
          }
        } else {
          await enqueue("foto", {
            bucket: BUCKET,
            path,
            blob: watermarked,
            contentType: "image/jpeg",
          });
          queued = true;
        }

        const objectUrl = URL.createObjectURL(watermarked);

        return {
          blob: watermarked,
          url: objectUrl,
          path,
          geo: geoResult.geo,
          sizeBytes: watermarked.size,
          uploaded,
          queued,
        };
      } catch (err) {
        console.error("[useFotoCapture] errore", err);
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [user?.id, enqueue, profile],
  );

  const clearError = useCallback(() => setError(null), []);

  return { uploading, error, capture, clearError };
}
