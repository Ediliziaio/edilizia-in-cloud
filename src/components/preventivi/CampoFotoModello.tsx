/**
 * Una foto dei blocchi del preventivo nei modelli di Serramenti e Fotovoltaico.
 *
 * Carica nel bucket privato del modulo (sr-progetti, fv-progetti) e nel modello
 * salva il percorso del file, che si firma quando serve: un link firmato scade
 * (vedi supabase/functions/_shared/immaginiModelloPdf.ts).
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { riferimentoImmagine } from "@/lib/storage/immaginiModelloPdf";

interface Props {
  valore: string | null;
  onChange: (valore: string | null) => void;
  bucket: "sr-progetti" | "fv-progetti";
  /** La cartella dell'azienda, es. «<azienda>/template-blocchi». */
  cartella: string | null;
}

export function CampoFotoModello({ valore, onChange, bucket, cartella }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [carica, setCarica] = useState(false);

  const scegli = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Carica un file immagine (PNG, JPG, WebP)"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("File troppo grande (max 8 MB)"); return; }
    if (!cartella) { toast.error("Profilo senza azienda"); return; }
    setCarica(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
      const percorso = `${cartella}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(percorso, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      onChange(riferimentoImmagine(bucket, percorso));
      toast.success("Foto caricata. Salva per applicare.");
    } catch (e) {
      toast.error("Foto non caricata", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setCarica(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => scegli(e.target.files?.[0])} />
      {valore ? (
        <div className="relative overflow-hidden rounded-md border">
          <ImgRiservata src={valore} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
          <Button size="icon" variant="secondary" className="absolute right-1.5 top-1.5 h-7 w-7" onClick={() => onChange(null)} aria-label="Togli la foto">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={carica}
          onClick={() => input.current?.click()}
          className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {carica ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
          {carica ? "Caricamento…" : "Carica una vostra foto"}
        </button>
      )}
    </div>
  );
}

export default CampoFotoModello;
