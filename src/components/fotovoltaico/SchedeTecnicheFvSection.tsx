/**
 * SchedeTecnicheFvSection — schede tecniche / documenti PDF di un articolo del
 * catalogo fotovoltaico (tabella articoli_native_documenti). Più PDF per
 * prodotto; ognuno con un toggle «Allega»: le schede autorizzate vengono
 * accodate come pagine intere nel PDF del preventivo, prima delle condizioni.
 *
 * Bucket pubblico article-pdfs (path {companyId}/fv/{articoloId}/{uuid}.pdf).
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface DocRow {
  id: string;
  nome: string;
  url: string;
  tipo: string;
  autorizzata: boolean;
  file_size: number | null;
  ordine: number;
}

// Tabella nuova: non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function SchedeTecnicheFvSection({ articoloId, puoModificare }: { articoloId: string; puoModificare: boolean }) {
  const qc = useQueryClient();
  const key = ["articoli-native-documenti", articoloId];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: docs = [], isLoading } = useQuery<DocRow[]>({
    queryKey: key,
    enabled: !!articoloId,
    queryFn: async () => {
      const { data, error } = await db
        .from("articoli_native_documenti")
        .select("id, nome, url, tipo, autorizzata, file_size, ordine")
        .eq("articolo_id", articoloId)
        .order("ordine", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocRow[];
    },
  });

  const carica = async (file: File) => {
    if (file.type !== "application/pdf") return toast.error("Carica un file PDF");
    if (file.size > 25 * 1024 * 1024) return toast.error("PDF troppo grande (max 25 MB)");
    setUploading(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Non autenticato");
      const { data: profile } = await db.from("profiles").select("company_id").eq("id", userId).maybeSingle();
      const companyId = (profile as { company_id?: string } | null)?.company_id;
      if (!companyId) throw new Error("Profilo senza azienda");
      const path = `${companyId}/fv/${articoloId}/${crypto.randomUUID()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("article-pdfs")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw new Error(`Upload fallito: ${upErr.message}`);
      const { data: pub } = supabase.storage.from("article-pdfs").getPublicUrl(path);
      const { error: insErr } = await db.from("articoli_native_documenti").insert({
        company_id: companyId,
        articolo_id: articoloId,
        nome: file.name.replace(/\.pdf$/i, ""),
        url: pub.publicUrl,
        tipo: "scheda_tecnica",
        autorizzata: true,
        ordine: docs.length,
        file_size: file.size,
        created_by: userId,
      });
      if (insErr) throw new Error(insErr.message);
      toast.success("Scheda tecnica caricata");
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const toggle = useMutation({
    mutationFn: async ({ id, autorizzata }: { id: string; autorizzata: boolean }) => {
      const { error } = await db.from("articoli_native_documenti").update({ autorizzata }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("articoli_native_documenti").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Scheda rimossa");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-medium">Schede tecniche (PDF)</label>
        {puoModificare && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void carica(f);
              }}
            />
            <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Carica PDF
            </Button>
          </>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Le schede <b>autorizzate</b> («Allega» attivo) vengono accodate come pagine intere nel PDF del preventivo, prima delle condizioni contrattuali.
      </p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Caricamento…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nessuna scheda tecnica caricata.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:underline" title={d.nome}>
                {d.nome}
              </a>
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" title="Apri la scheda">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" title="Allega questa scheda al PDF del preventivo">
                <Switch
                  checked={d.autorizzata}
                  disabled={!puoModificare || toggle.isPending}
                  onCheckedChange={(v) => toggle.mutate({ id: d.id, autorizzata: v })}
                />
                Allega
              </label>
              {puoModificare && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={elimina.isPending}
                  onClick={() => elimina.mutate(d.id)}
                  title="Rimuovi scheda"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
