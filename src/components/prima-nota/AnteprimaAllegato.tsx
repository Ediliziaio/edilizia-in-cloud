import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { riconosciFile } from "@/lib/storage/fileRiservati";
import { AllegatoPrimaNota } from "./AllegatoPrimaNota";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function AnteprimaAllegato({ url, nome }: { url: string; nome: string | null }) {
  const t = useT();
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState(false);
  const file = riconosciFile(url);
  const percorso = file?.bucket === "prima-nota-attachments" ? file.path : "";
  const pdf = /\.pdf$/i.test(percorso);
  const immagine = /\.(png|jpe?g|gif|webp)$/i.test(percorso);

  async function mostra() {
    setBusy(true);
    setErrore(false);
    try {
      const { data, error } = await supabase.storage.from("prima-nota-attachments").createSignedUrl(percorso, 300);
      if (error || !data?.signedUrl) throw new Error();
      setSrc(data.signedUrl);
    } catch {
      setErrore(true);
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <div className="flex items-center justify-between gap-2">
      <AllegatoPrimaNota url={url} nome={nome} />
      {(pdf || immagine) && <Button size="sm" variant="outline" disabled={busy} aria-expanded={!!src}
        onClick={() => src ? setSrc("") : void mostra()}>
        {busy ? t("Caricamento…") : src ? t("Chiudi anteprima") : t("Anteprima")}
      </Button>}
    </div>
    {errore && <p role="alert" className="text-sm text-destructive">{t("Anteprima non disponibile. Riprova o apri il file.")}</p>}
    {src && (pdf
      ? <iframe title={nome || t("Anteprima PDF")} src={src} className="mt-2 h-[45dvh] w-full rounded-md border" />
      : <img alt={nome || t("Allegato del movimento")} src={src} onError={() => { setSrc(""); setErrore(true); }} className="mx-auto mt-2 max-h-[45dvh] max-w-full object-contain" />)}
  </div>;
}
