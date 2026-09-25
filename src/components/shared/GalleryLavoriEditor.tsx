import { useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, Upload, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { BUCKET_RISERVATI } from "@/lib/storage/fileRiservati";
import { riferimentoImmagine } from "@/lib/storage/immaginiModelloPdf";
import type { GalleryLavoroItem } from "@/types/gallery";
import { readLocalTemplateImage } from "@/lib/moduli-vendita/localTemplateImage";

interface Props {
  items: GalleryLavoroItem[];
  onChange: (items: GalleryLavoroItem[]) => void;
  /**
   * Bucket Supabase Storage in cui caricare. Deve esistere: fino al 17/09/2026
   * otto moduli passavano "companies", che non c'è, e nessuna foto arrivava.
   *
   * - Serramenti e Fotovoltaico: sr-progetti e fv-progetti, privati, perché
   *   accanto ai modelli ci sono i file dei progetti dei clienti. Nel modello va
   *   il percorso, firmato quando serve (supabase/functions/_shared/immaginiModelloPdf.ts).
   * - Gli altri otto: company-photo-library, pubblico, dove stanno già logo e
   *   copertina degli stessi modelli. Le foto dei lavori sono fatte per essere
   *   mostrate al cliente nel preventivo: un bucket privato obbligherebbe a
   *   firmarle in otto PDF e nelle anteprime senza nascondere niente che il
   *   cliente non veda già. Nel modello va l'indirizzo pubblico, che non scade.
   */
  bucket: string;
  /** Prefisso path upload (es. "abc123/tetti/gallery") — senza slash finale */
  uploadPath: string;
  maxItems?: number;
  localOnly?: boolean;
}

export function GalleryLavoriEditor({
  items,
  onChange,
  bucket,
  uploadPath,
  maxItems = 12,
  localOnly = false,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = maxItems - items.length;
    const toUpload = Array.from(files).slice(0, remaining);
    if (toUpload.length === 0) {
      toast.error(`Massimo ${maxItems} foto consentite`);
      return;
    }
    setUploading(true);
    const added: GalleryLavoroItem[] = [];
    for (const file of toUpload) {
      if (localOnly) {
        try { added.push({ id: crypto.randomUUID(), url: await readLocalTemplateImage(file) }); }
        catch (error) { toast.error(error instanceof Error ? error.message : "Immagine non leggibile"); }
        continue;
      }
      if (!file.type.startsWith("image/")) { toast.error(`${file.name}: solo immagini`); continue; }
      if (file.size > 8 * 1024 * 1024) { toast.error(`${file.name}: max 8 MB`); continue; }
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
      const path = `${uploadPath}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
      if (error) { toast.error(`Errore upload ${file.name}`); continue; }
      // Mai un link firmato nel modello: scade. Da un bucket riservato si salva il
      // percorso, firmato quando serve (supabase/functions/_shared/immaginiModelloPdf.ts);
      // da uno pubblico l'indirizzo pubblico, che non scade.
      const url = (BUCKET_RISERVATI as readonly string[]).includes(bucket)
        ? riferimentoImmagine(bucket, path)
        : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      added.push({ id: crypto.randomUUID(), url });
    }
    if (added.length > 0) {
      onChange([...items, ...added]);
      toast.success(`${added.length} foto aggiunt${added.length === 1 ? "a" : "e"}. Salva per applicare.`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const update = (idx: number, patch: Partial<GalleryLavoroItem>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };

  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      {/* Griglia foto */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item, idx) => (
            <div key={item.id} className="rounded-lg border bg-muted/20 overflow-hidden">
              <div className="relative aspect-video bg-muted">
                <ImgRiservata
                  src={item.url}
                  alt={item.didascalia || `Lavoro ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="absolute top-1.5 right-1.5 p-1 rounded bg-black/60 text-white hover:bg-red-600 transition-colors"
                  title="Rimuovi foto"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="p-2 space-y-1.5">
                <Input
                  value={item.didascalia ?? ""}
                  onChange={(e) => update(idx, { didascalia: e.target.value || null })}
                  placeholder="Didascalia (opzionale)"
                  className="h-7 text-[11px]"
                />
                <Input
                  value={item.luogo ?? ""}
                  onChange={(e) => update(idx, { luogo: e.target.value || null })}
                  placeholder="Luogo / Città (opzionale)"
                  className="h-7 text-[11px]"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pulsante aggiungi */}
      {items.length < maxItems && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-4 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <span className="animate-pulse">Caricamento in corso…</span>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Aggiungi foto lavori ({items.length}/{maxItems})
              </>
            )}
          </button>
        </>
      )}

      {items.length === 0 && (
        <div className="flex flex-col items-center gap-1 py-2 text-muted-foreground">
          <ImageIcon className="h-6 w-6 opacity-40" />
          <p className="text-[11px] text-center">
            Carica foto di lavori realizzati — appariranno nel PDF come pagina "I nostri lavori".
          </p>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Max {maxItems} foto · JPG/PNG/WebP · max 8 MB · aggiunta didascalia opzionale
      </p>
    </div>
  );
}
