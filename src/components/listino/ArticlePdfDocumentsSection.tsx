/**
 * ArticlePdfDocumentsSection — schede tecniche / documenti PDF per un articolo
 * di listino (tabella `article_family_documents`, bucket `article-pdfs`).
 *
 * Autonomo: gestisce query + upload (multiplo) + rimozione, così FamilyEditor
 * lo innesta con una riga sola. Path storage: {company_id}/{family_id}/{uuid}.pdf
 * (stesso scope-per-company del bucket article-images).
 *
 * Se l'articolo non è ancora salvato (nessun family_id), `ensureFamilyId` salva
 * la base e restituisce l'id — stesso pattern dell'upload immagine.
 */
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileText, Upload, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { logger } from "@/utils/logger";

const BUCKET = "article-pdfs";
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB — le schede tecniche possono essere ricche

interface ArticlePdfDocument {
  id: string;
  nome: string;
  url: string;
  tipo: string | null;
  file_size: number | null;
}

interface Props {
  companyId: string | null | undefined;
  familyId: string | null | undefined;
  /** Salva la base e restituisce l'id (per articoli non ancora persistiti). */
  ensureFamilyId: () => Promise<string | null>;
  /** Se valorizzato, i documenti sono legati a questa VARIANTE (axis_value_id),
   *  non alla famiglia. La lista famiglia esclude i documenti di variante e viceversa. */
  axisValueId?: string | null;
  /** Override del titolo/hint per il contesto variante. */
  title?: string;
  hint?: string;
}

export function ArticlePdfDocumentsSection({ companyId, familyId, ensureFamilyId, axisValueId, title, hint }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const { data: docs = [], isLoading } = useQuery<ArticlePdfDocument[]>({
    queryKey: ["article-family-documents", familyId, axisValueId ?? null],
    enabled: !!familyId,
    queryFn: async () => {
      // (supabase as any): tabella non ancora nei types generati
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("article_family_documents")
        .select("id, nome, url, tipo, file_size")
        .eq("family_id", familyId);
      // Scope: variante → solo i suoi doc; famiglia → solo doc senza variante.
      q = axisValueId ? q.eq("axis_value_id", axisValueId) : q.is("axis_value_id", null);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ArticlePdfDocument[];
    },
  });

  const refresh = (fid: string) =>
    queryClient.invalidateQueries({ queryKey: ["article-family-documents", fid, axisValueId ?? null] });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (files.length === 0) return;
    if (!companyId) {
      toast.error("Azienda non identificata");
      return;
    }

    let fid = familyId ?? null;
    if (!fid) {
      fid = await ensureFamilyId();
      if (!fid) return; // ensureFamilyId ha già mostrato l'errore
    }

    setBusy(true);
    let okCount = 0;
    try {
      for (const file of files) {
        if (file.type !== "application/pdf") {
          toast.error(`"${file.name}" ignorato`, { description: "Solo file PDF." });
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`"${file.name}" troppo grande`, { description: "Max 15 MB." });
          continue;
        }
        const safeId =
          (typeof crypto !== "undefined" && "randomUUID" in crypto)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const path = `${companyId}/${fid}/${safeId}.pdf`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false, contentType: "application/pdf", cacheControl: "3600" });
        if (upErr) {
          logger.error("article pdf upload failed", upErr);
          toast.error(`Errore caricando "${file.name}"`, { description: upErr.message });
          continue;
        }
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const { data: auth } = await supabase.auth.getUser();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insErr } = await (supabase as any).from("article_family_documents").insert({
          company_id: companyId,
          family_id: fid,
          axis_value_id: axisValueId ?? null,
          nome: file.name.replace(/\.pdf$/i, ""),
          url: urlData.publicUrl,
          tipo: "scheda_tecnica",
          file_size: file.size,
          created_by: auth?.user?.id ?? null,
        });
        if (insErr) {
          await supabase.storage.from(BUCKET).remove([path]); // rollback file orfano
          toast.error(`Errore salvando "${file.name}"`, { description: insErr.message });
          continue;
        }
        okCount++;
      }
      if (okCount > 0) {
        toast.success(okCount === 1 ? "Documento caricato" : `${okCount} documenti caricati`);
        refresh(fid);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (doc: ArticlePdfDocument) => {
    if (!familyId) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("article_family_documents").delete().eq("id", doc.id);
      if (error) throw error;
      // Best-effort: rimuovi anche il file (il path è dopo il bucket nell'URL pubblico)
      const marker = `/${BUCKET}/`;
      const idx = doc.url.indexOf(marker);
      if (idx >= 0) {
        const path = decodeURIComponent(doc.url.slice(idx + marker.length).split("?")[0]);
        await supabase.storage.from(BUCKET).remove([path]);
      }
      toast.success("Documento rimosso");
      refresh(familyId);
    } catch (err) {
      toast.error("Errore rimozione", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  return (
    <div>
      <Label>{title ?? "Schede tecniche / Documenti (PDF)"}</Label>
      <p className="text-xs text-muted-foreground mt-1 mb-2">
        {hint ?? "Carica scheda tecnica, certificazioni, garanzia. Appaiono nella scheda articolo e nel preventivo. Più file, max 15 MB ciascuno."}
      </p>

      {familyId && docs.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-red-500" />
              <span className="flex-1 min-w-0 truncate">{doc.nome}</span>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-compact p-1.5 text-muted-foreground hover:text-primary"
                title="Apri PDF"
                aria-label={`Apri ${doc.nome}`}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => void handleRemove(doc)}
                className="tap-compact p-1.5 text-muted-foreground hover:text-rose-500"
                title="Rimuovi"
                aria-label={`Rimuovi ${doc.nome}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {familyId && docs.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground mb-2">Nessun documento ancora.</p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="gap-2"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Carica PDF
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        multiple
        onChange={(e) => void handleUpload(e)}
        className="hidden"
      />
    </div>
  );
}
