/**
 * useCompanyPhotoLibrary — galleria foto PRIVATA per azienda.
 *
 * Differenza chiave da useArticlePhotoTemplates:
 *  - article_photo_templates → GLOBALE (super_admin gestisce, read-only per
 *    le aziende)
 *  - company_photo_library   → PRIVATA per company (RLS company-scoped):
 *    ogni azienda vede e gestisce SOLO le sue foto, mai quelle altrui.
 *
 * Workflow upload:
 *  1. POST file in bucket `company-photo-library` path `{company_id}/{uuid}.{ext}`
 *  2. INSERT riga in `company_photo_library` con image_url pubblica + storage_path
 *  3. Invalidate cache → riappare nel picker tab "Le mie foto"
 *
 * Workflow delete:
 *  1. DELETE storage object (bucket)
 *  2. DELETE row in tabella
 *  3. Invalidate cache
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSelector } from "@/contexts/AuthContext";

const BUCKET = "company-photo-library";
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface CompanyPhoto {
  id: string;
  company_id: string;
  nome: string;
  descrizione: string | null;
  vertical_slug: string | null;
  categoria_slug: string | null;
  tipologia: string | null;
  image_url: string;
  thumbnail_url: string | null;
  storage_path: string | null;
  tags: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CompanyPhotoFilters {
  vertical?: string | null;
  categoria?: string | null;
  search?: string | null;
}

export function useCompanyPhotoLibrary(filters: CompanyPhotoFilters = {}) {
  const companyId = useAuthSelector((c) => c.effectiveCompany?.id ?? null);
  const { vertical, categoria, search } = filters;

  return useQuery({
    queryKey: ["company-photo-library", companyId, vertical ?? "*", categoria ?? "*", search ?? ""],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("company_photo_library")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("nome", { ascending: true });
      if (vertical) q = q.eq("vertical_slug", vertical);
      if (categoria) q = q.eq("categoria_slug", categoria);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as CompanyPhoto[];
      if (!search?.trim()) return rows;
      const s = search.trim().toLowerCase();
      return rows.filter((r) => {
        const blob = `${r.nome} ${r.descrizione ?? ""} ${r.tags.join(" ")}`.toLowerCase();
        return blob.includes(s);
      });
    },
  });
}

export interface UploadCompanyPhotoInput {
  file: File;
  nome: string;
  descrizione?: string | null;
  vertical_slug?: string | null;
  categoria_slug?: string | null;
  tags?: string[];
}

export function useUploadCompanyPhoto() {
  const qc = useQueryClient();
  const companyId = useAuthSelector((c) => c.effectiveCompany?.id ?? null);

  return useMutation({
    mutationFn: async (input: UploadCompanyPhotoInput) => {
      if (!companyId) throw new Error("Azienda non disponibile");

      // Pre-validation client-side: feedback immediato senza chiamare DB.
      if (!ALLOWED_MIMES.has(input.file.type)) {
        throw new Error("Formato non supportato. Usa PNG, JPG o WEBP.");
      }
      if (input.file.size > MAX_FILE_BYTES) {
        throw new Error("File troppo grande (max 3 MB).");
      }
      const nome = input.nome.trim();
      if (!nome) throw new Error("Nome foto obbligatorio.");

      // Genera path univoco {company_id}/{uuid}.{ext}
      const ext = input.file.name.split(".").pop()?.toLowerCase() || "png";
      const storagePath = `${companyId}/${crypto.randomUUID()}.${ext}`;

      // Upload nel bucket
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, input.file, {
          cacheControl: "31536000",
          upsert: false,
        });
      if (upErr) throw new Error(`Upload fallito: ${upErr.message}`);

      // URL pubblico (il bucket è public read)
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      const imageUrl = pub.publicUrl;

      // Insert row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row, error: insErr } = await (supabase as any)
        .from("company_photo_library")
        .insert({
          company_id: companyId,
          nome,
          descrizione: input.descrizione?.trim() || null,
          vertical_slug: input.vertical_slug ?? null,
          categoria_slug: input.categoria_slug ?? null,
          image_url: imageUrl,
          storage_path: storagePath,
          tags: input.tags ?? [],
        })
        .select()
        .single();
      if (insErr) {
        // Best-effort: rimuovi il file orfano dal bucket per non lasciare junk.
        void supabase.storage.from(BUCKET).remove([storagePath]);
        // Errore tipico: UNIQUE violation su (company_id, nome).
        if (insErr.code === "23505") {
          throw new Error("Esiste già una foto con questo nome. Usa un nome diverso.");
        }
        throw new Error(`Salvataggio fallito: ${insErr.message}`);
      }
      return row as CompanyPhoto;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["company-photo-library"] });
    },
  });
}

export function useDeleteCompanyPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photo: Pick<CompanyPhoto, "id" | "storage_path">) => {
      // 1. Delete storage object (se path valorizzato)
      if (photo.storage_path) {
        const { error: stErr } = await supabase.storage.from(BUCKET).remove([photo.storage_path]);
        // Non-fatal: continuiamo a cancellare la row anche se lo storage
        // ha già perso l'oggetto (consistency eventual).
        if (stErr) console.warn("Storage delete fallita (continua):", stErr.message);
      }
      // 2. Delete row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("company_photo_library")
        .delete()
        .eq("id", photo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["company-photo-library"] });
    },
  });
}
