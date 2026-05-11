/**
 * useListinoEntityImage — upload/remove immagine di una macrocategoria o
 * di una categoria, riusando il bucket `article-images` (stesso usato per
 * le immagini articolo) per non moltiplicare set di RLS policies.
 *
 * Path nel bucket:
 *   - macro:     `<company_id>/macros/<id>.<ext>`
 *   - categoria: `<company_id>/categories/<id>.<ext>`
 *
 * Il bucket è pubblico-read. Le policies di upload/delete sono per company
 * (folder = company_id come primo segmento del path).
 *
 * Pattern mutuato da `useArticleImageUpload`: pulisce file precedenti con
 * estensione diversa prima dell'upload, per evitare orfani.
 *
 * Il hook NON persiste `immagine_url` sull'entità — espone solo l'URL,
 * il chiamante salva via la sua mutation di update.
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { logger } from "@/utils/logger";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_FILE_SIZE = 3 * 1024 * 1024;
const BUCKET = "article-images";

export type ListinoEntityKind = "macro" | "categoria";

const SUBFOLDER: Record<ListinoEntityKind, string> = {
  macro: "macros",
  categoria: "categories",
};

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export interface UseListinoEntityImage {
  isUploading: boolean;
  isRemoving: boolean;
  upload: (entityId: string, file: File) => Promise<UploadResult>;
  remove: (entityId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function useListinoEntityImage(kind: ListinoEntityKind): UseListinoEntityImage {
  const companyId = useEffectiveCompanyId();
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const subfolder = SUBFOLDER[kind];

  const upload = async (entityId: string, file: File): Promise<UploadResult> => {
    if (!companyId) return { ok: false, error: "Azienda non identificata" };
    if (!entityId) return { ok: false, error: "ID mancante" };

    if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
      return { ok: false, error: "Formato non supportato. Usa PNG, JPG o WEBP." };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { ok: false, error: `File troppo grande. Max ${MAX_FILE_SIZE / 1024 / 1024} MB.` };
    }

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const folder = `${companyId}/${subfolder}`;
      const filePath = `${folder}/${entityId}.${ext}`;

      // Pulisci file precedenti con altre estensioni (es. png → jpg)
      const { data: existing } = await supabase.storage
        .from(BUCKET)
        .list(folder, { search: entityId });
      if (existing && existing.length > 0) {
        const stale = existing
          .filter((f) => f.name.startsWith(`${entityId}.`) && f.name !== `${entityId}.${ext}`)
          .map((f) => `${folder}/${f.name}`);
        if (stale.length > 0) {
          await supabase.storage.from(BUCKET).remove(stale);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      return { ok: true, url };
    } catch (err) {
      logger.error(`useListinoEntityImage[${kind}].upload failed`, err);
      const msg = err instanceof Error ? err.message : "Errore upload";
      return { ok: false, error: msg };
    } finally {
      setIsUploading(false);
    }
  };

  const remove = async (entityId: string) => {
    if (!companyId) return { ok: false, error: "Azienda non identificata" };
    if (!entityId) return { ok: false, error: "ID mancante" };

    setIsRemoving(true);
    try {
      const folder = `${companyId}/${subfolder}`;
      const { data: existing } = await supabase.storage
        .from(BUCKET)
        .list(folder, { search: entityId });
      if (existing && existing.length > 0) {
        const toDelete = existing
          .filter((f) => f.name.startsWith(`${entityId}.`))
          .map((f) => `${folder}/${f.name}`);
        if (toDelete.length > 0) {
          const { error } = await supabase.storage.from(BUCKET).remove(toDelete);
          if (error) throw error;
        }
      }
      return { ok: true };
    } catch (err) {
      logger.error(`useListinoEntityImage[${kind}].remove failed`, err);
      const msg = err instanceof Error ? err.message : "Errore rimozione";
      return { ok: false, error: msg };
    } finally {
      setIsRemoving(false);
    }
  };

  return { isUploading, isRemoving, upload, remove };
}
