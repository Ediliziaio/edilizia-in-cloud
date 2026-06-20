/**
 * GlobalPhotoLibraryPicker — libreria foto prodotti GLOBALE (super_admin).
 *
 * Le foto sono "standard": salvate nel sistema (tabella article_photo_templates
 * + bucket article-photo-templates) con un NOME, e RIUTILIZZABILI su qualsiasi
 * template/articolo. Da qui il super_admin può cercare e scegliere una foto
 * esistente, oppure caricarne una nuova (con nome) che entra in libreria.
 *
 * RLS: select per authenticated (is_active), insert/update/delete per super_admin.
 */
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Search, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface PhotoLibPick { url: string; nome: string }

interface PhotoRow {
  id: string; nome: string; image_url: string; thumbnail_url: string | null;
  vertical_slug: string; tags: string[] | null;
}

/** Upload nel bucket pubblico article-photo-templates → URL pubblico. */
async function uploadToBucket(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `templates/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("article-photo-templates")
    .upload(path, file, { contentType: file.type || "image/png", upsert: false });
  if (error) throw error;
  return supabase.storage.from("article-photo-templates").getPublicUrl(path).data.publicUrl;
}

export function GlobalPhotoLibraryPicker({
  open, onOpenChange, onSelect, defaultVertical = "serramenti",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect: (p: PhotoLibPick) => void;
  defaultVertical?: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [nome, setNome] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ["admin-photo-library"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_photo_templates")
        .select("id,nome,image_url,thumbnail_url,vertical_slug,tags")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PhotoRow[];
    },
  });

  const filtered = photos.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${p.nome} ${(p.tags ?? []).join(" ")}`.toLowerCase().includes(q);
  });

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!nome.trim()) {
      toast.error("Dai un nome alla foto prima di caricarla");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const url = await uploadToBucket(file);
      const { error } = await supabase.from("article_photo_templates").insert({
        nome: nome.trim(), image_url: url, vertical_slug: defaultVertical,
        tags: ["standard"], is_active: true,
      } as never);
      if (error) throw error;
      toast.success(`Foto "${nome.trim()}" salvata in libreria`);
      qc.invalidateQueries({ queryKey: ["admin-photo-library"] });
      onSelect({ url, nome: nome.trim() });
      setNome("");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Upload fallito: ${(err as Error).message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("article_photo_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Foto eliminata dalla libreria"); qc.invalidateQueries({ queryKey: ["admin-photo-library"] }); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Libreria foto prodotti</DialogTitle>
          <DialogDescription>Foto standard salvate nel sistema con un nome e riutilizzabili su più articoli.</DialogDescription>
        </DialogHeader>

        {/* Carica nuova foto in libreria */}
        <div className="flex items-end gap-2 rounded-md border p-3 bg-muted/30">
          <div className="flex-1">
            <Label>Nome nuova foto</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Finestra 2 ante bianca" />
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />} Carica e salva
          </Button>
        </div>

        {/* Ricerca */}
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Cerca foto per nome o tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* Griglia foto */}
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Caricamento libreria…</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {filtered.map((p) => (
              <div key={p.id} className="group relative border rounded-md overflow-hidden hover:border-primary/60 transition-colors">
                <button type="button" className="block w-full" onClick={() => { onSelect({ url: p.image_url, nome: p.nome }); onOpenChange(false); }}>
                  <div className="aspect-square bg-muted/40 flex items-center justify-center">
                    <img src={p.thumbnail_url ?? p.image_url} alt={p.nome} className="w-full h-full object-contain" loading="lazy" />
                  </div>
                  <div className="px-1.5 py-1 text-[11px] truncate text-left">{p.nome}</div>
                </button>
                <button
                  type="button"
                  onClick={() => { if (confirm(`Eliminare "${p.nome}" dalla libreria?`)) del.mutate(p.id); }}
                  className="absolute top-1 right-1 h-6 w-6 rounded bg-background/80 text-destructive opacity-0 group-hover:opacity-100 flex items-center justify-center"
                  title="Elimina dalla libreria"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
                Nessuna foto in libreria. Caricane una qui sopra (con nome) per riutilizzarla ovunque.
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
