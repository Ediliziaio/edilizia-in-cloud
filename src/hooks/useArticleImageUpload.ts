/**
 * useArticleImageUpload — upload + remove dell'immagine preview di un
 * articolo (article_families.immagine_url) sul bucket `article-images`.
 *
 * Layout path: `{company_id}/{family_id}.{ext}`
 *   - RLS scope per company (vedi migration 20260421000005)
 *   - family_id nel filename → riutilizzare upsert sovrascrive in-place
 *
 * Pattern mutuato da `LogoUploader`: elimina preview precedenti con altre
 * estensioni (se esistono) prima del nuovo upload, per evitare file orfani
 * nel bucket dopo un cambio formato (png → jpg).
 *
 * Il hook NON persiste `immagine_url` sulla famiglia — lo delega al chiamante
 * (FamilyEditor) che ha già la sua mutazione di save dedicata. Espone solo
 * l'URL pubblico aggiornato con cache-bust.
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { logger } from "@/utils/logger";

/** Estensioni accettate: allineate a LogoUploader (PNG/JPG/WEBP). */
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** Max 3 MB — più grande del logo (2 MB) perché le foto articolo sono
 *  tendenzialmente render/scatti più ricchi di dettaglio. */
const MAX_FILE_SIZE = 3 * 1024 * 1024;
const BUCKET = "article-images";

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export interface UseArticleImageUpload {
  /** true mentre upload in corso. */
  isUploading: boolean;
  /** true mentre rimozione in corso. */
  isRemoving: boolean;
  /** Upload: ritorna URL pubblico con cache-bust, o errore. */
  upload: (familyId: string, file: File) => Promise<UploadResult>;
  /** Rimuove tutti i file legati a quella famiglia dal bucket. */
  remove: (familyId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function useArticleImageUpload(): UseArticleImageUpload {
  const companyId = useEffectiveCompanyId();
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const upload = async (
    familyId: string,
    file: File,
  ): Promise<UploadResult> => {
    if (!companyId) return { ok: false, error: "Azienda non identificata" };
    if (!familyId) return { ok: false, error: "ID articolo mancante" };

    // Validazione client-side (il bucket RLS protegge comunque)
    if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
      return {
        ok: false,
        error: "Formato non supportato. Usa PNG, JPG o WEBP.",
      };
    }
    if (file.size > MAX_FILE_SIZE) {
      return {
        ok: false,
        error: `File troppo grande. Max ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
      };
    }

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const folder = companyId;
      const filePath = `${folder}/${familyId}.${ext}`;

      // Pulisci eventuali file precedenti con altre estensioni (es. png → jpg)
      const { data: existing } = await supabase.storage
        .from(BUCKET)
        .list(folder, { search: familyId });

      if (existing && existing.length > 0) {
        const stale = existing
          .filter((f) => f.name.startsWith(`${familyId}.`) && f.name !== `${familyId}.${ext}`)
          .map((f) => `${folder}/${f.name}`);
        if (stale.length > 0) {
          await supabase.storage.from(BUCKET).remove(stale);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { upsert: true, cacheControl: "3600" });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      // Cache-bust per forzare il refresh immediato nella UI
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      return { ok: true, url };
    } catch (err) {
      logger.error("useArticleImageUpload.upload failed", err);
      const msg = err instanceof Error ? err.message : "Errore upload";
      return { ok: false, error: msg };
    } finally {
      setIsUploading(false);
    }
  };

  const remove = async (familyId: string) => {
    if (!companyId) return { ok: false, error: "Azienda non identificata" };
    if (!familyId) return { ok: false, error: "ID articolo mancante" };

    setIsRemoving(true);
    try {
      const folder = companyId;
      const { data: existing } = await supabase.storage
        .from(BUCKET)
        .list(folder, { search: familyId });

      if (existing && existing.length > 0) {
        const toDelete = existing
          .filter((f) => f.name.startsWith(`${familyId}.`))
          .map((f) => `${folder}/${f.name}`);
        if (toDelete.length > 0) {
          const { error } = await supabase.storage
            .from(BUCKET)
            .remove(toDelete);
          if (error) throw error;
        }
      }

      return { ok: true };
    } catch (err) {
      logger.error("useArticleImageUpload.remove failed", err);
      const msg = err instanceof Error ? err.message : "Errore rimozione";
      return { ok: false, error: msg };
    } finally {
      setIsRemoving(false);
    }
  };

  return { isUploading, isRemoving, upload, remove };
}
