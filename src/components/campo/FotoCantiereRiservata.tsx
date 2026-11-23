import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function FotoCantiereRiservata({ bucket, percorso, titolo, chiudi }: { bucket: string; percorso: string; titolo: string; chiudi: () => void }) {
  const t = useT();
  const [esito, setEsito] = useState<{ url: string | null }>();
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    async function carica() {
      try {
        const { data, error } = await supabase.storage.from(bucket)
          .download(percorso, {}, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (error || !data) {
          setEsito({ url: null });
          return;
        }
        const type = percorso.endsWith(".png") ? "image/png" : percorso.endsWith(".webp") ? "image/webp" : "image/jpeg";
        url = URL.createObjectURL(new Blob([data], { type }));
        setEsito({ url });
      } catch {
        if (!controller.signal.aborted) setEsito({ url: null });
      }
    }
    void carica();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [bucket, percorso]);
  return <Dialog open onOpenChange={open => { if (!open) chiudi(); }}>
    <DialogContent aria-describedby={undefined} className="max-w-2xl gap-3">
      <DialogTitle className="pr-8" dir="auto">{titolo}</DialogTitle>
      {!esito ? <p role="status" className="text-sm text-muted-foreground">{t("Carico la foto…")}</p>
        : esito.url ? <img src={esito.url} alt={titolo} onError={() => setEsito({ url: null })}
          className="max-h-[70dvh] w-full rounded-lg bg-muted object-contain" />
        : <p role="alert" className="text-sm">{t("Foto non disponibile.")}</p>}
    </DialogContent>
  </Dialog>;
}
