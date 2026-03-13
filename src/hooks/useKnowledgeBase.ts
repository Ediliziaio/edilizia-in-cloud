import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { KBDocumento, CategoriaKB } from "@/modules/preventivo/types";

export function useKnowledgeBase(aziendaId?: string | null) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const { data: documenti, isLoading } = useQuery({
    queryKey: ["kb_documenti", aziendaId],
    enabled: !!aziendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("preventivo_kb_documenti" as any)
        .select("*")
        .eq("azienda_id", aziendaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as KBDocumento[];
    },
    refetchInterval: (query) => {
      const d = query.state.data as KBDocumento[] | undefined;
      const hasPending = d?.some(
        (doc) => doc.stato === "elaborazione" || doc.stato === "caricato"
      );
      return hasPending ? 3000 : false;
    },
  });

  const stats = {
    totale: documenti?.length || 0,
    indicizzati: documenti?.filter((d) => d.stato === "indicizzato").length || 0,
    in_elaborazione: documenti?.filter((d) => d.stato === "elaborazione").length || 0,
    errori: documenti?.filter((d) => d.stato === "errore").length || 0,
    chunks_totali: documenti?.reduce((sum, d) => sum + (d.chunks_count || 0), 0) || 0,
  };

  const uploadDocumento = useCallback(
    async (
      file: File,
      categoria: CategoriaKB,
      nome?: string,
      descrizione?: string,
      tags?: string[]
    ): Promise<KBDocumento | null> => {
      if (!aziendaId) return null;
      setUploading(true);
      const tempId = `upload-${Date.now()}`;
      setUploadProgress((prev) => ({ ...prev, [tempId]: 0 }));

      try {
        const fileType = file.name.split(".").pop()?.toLowerCase() as string;
        const fileSizeKb = Math.round(file.size / 1024);
        const storageKey = `${aziendaId}/${Date.now()}-${file.name}`;

        // 1. Upload to storage
        setUploadProgress((prev) => ({ ...prev, [tempId]: 20 }));
        const { error: uploadErr } = await supabase.storage
          .from("preventivo-kb")
          .upload(storageKey, file, { contentType: file.type });
        if (uploadErr) throw uploadErr;

        // 2. Create DB record
        setUploadProgress((prev) => ({ ...prev, [tempId]: 40 }));
        const { data: doc, error: dbErr } = await supabase
          .from("preventivo_kb_documenti" as any)
          .insert({
            azienda_id: aziendaId,
            nome: nome || file.name.replace(/\.[^/.]+$/, ""),
            descrizione,
            file_url: storageKey,
            file_type: fileType,
            file_size_kb: fileSizeKb,
            categoria,
            stato: "caricato",
            tags: tags || [],
          } as any)
          .select()
          .single();
        if (dbErr) throw dbErr;
        const docData = doc as unknown as KBDocumento;

        // 3. Extract text
        setUploadProgress((prev) => ({ ...prev, [tempId]: 55 }));
        const { data: extractData, error: extractErr } = await supabase.functions.invoke(
          "extract-document-text",
          { body: { documentoId: docData.id } }
        );
        if (extractErr) throw extractErr;

        // 4. Chunk + Embed
        setUploadProgress((prev) => ({ ...prev, [tempId]: 75 }));
        const { error: embedErr } = await supabase.functions.invoke("chunk-and-embed", {
          body: {
            documentoId: docData.id,
            aziendaId,
            categoria,
            pagineTesto: extractData.pagineTesto,
          },
        });
        if (embedErr) throw embedErr;

        setUploadProgress((prev) => ({ ...prev, [tempId]: 100 }));
        queryClient.invalidateQueries({ queryKey: ["kb_documenti", aziendaId] });
        toast.success(
          `"${docData.nome}" indicizzato — ${extractData.totalePagine} pagine`
        );
        return docData;
      } catch (err: any) {
        toast.error("Errore upload: " + err.message);
        return null;
      } finally {
        setUploading(false);
        setTimeout(() => {
          setUploadProgress((prev) => {
            const next = { ...prev };
            delete next[tempId];
            return next;
          });
        }, 2000);
      }
    },
    [aziendaId, queryClient]
  );

  const eliminaDocumento = useCallback(
    async (docId: string) => {
      const { error } = await supabase
        .from("preventivo_kb_documenti" as any)
        .delete()
        .eq("id", docId);
      if (!error) {
        queryClient.invalidateQueries({ queryKey: ["kb_documenti", aziendaId] });
        toast.success("Documento rimosso dalla knowledge base");
      }
    },
    [aziendaId, queryClient]
  );

  const reIndicizza = useCallback(
    async (doc: KBDocumento) => {
      await supabase
        .from("preventivo_kb_documenti" as any)
        .update({ stato: "caricato" } as any)
        .eq("id", doc.id);

      const { data: extractData, error: extractErr } = await supabase.functions.invoke(
        "extract-document-text",
        { body: { documentoId: doc.id } }
      );
      if (extractErr) {
        toast.error("Errore re-indicizzazione");
        return;
      }

      await supabase.functions.invoke("chunk-and-embed", {
        body: {
          documentoId: doc.id,
          aziendaId,
          categoria: doc.categoria,
          pagineTesto: extractData.pagineTesto,
        },
      });

      queryClient.invalidateQueries({ queryKey: ["kb_documenti", aziendaId] });
      toast.success("Re-indicizzazione completata");
    },
    [aziendaId, queryClient]
  );

  const testSearch = useCallback(
    async (query: string, categoria?: string): Promise<any[]> => {
      if (!aziendaId) return [];

      const { data: embData, error: embErr } = await supabase.functions.invoke(
        "embed-query",
        { body: { testo: query } }
      );
      if (embErr || !embData?.embedding) return [];

      const { data: chunks, error: searchErr } = await supabase.rpc(
        "search_kb_chunks" as any,
        {
          p_azienda_id: aziendaId,
          p_embedding: embData.embedding,
          p_categoria: categoria || null,
          p_top_k: 5,
          p_threshold: 0.65,
        }
      );

      if (searchErr) {
        console.error("Search error:", searchErr);
        return [];
      }
      return (chunks as any[]) || [];
    },
    [aziendaId]
  );

  return {
    documenti: documenti || [],
    isLoading,
    stats,
    uploading,
    uploadProgress,
    uploadDocumento,
    eliminaDocumento,
    reIndicizza,
    testSearch,
  };
}
