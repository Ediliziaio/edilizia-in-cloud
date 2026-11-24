import { useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { riconosciFile } from "@/lib/storage/fileRiservati";
import { apriFileRiservato } from "@/lib/storagePrivato";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function AllegatoPrimaNota({ url, nome }: { url: string | null; nome: string | null }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  if (!url) return null;
  const apri = async () => {
    setBusy(true);
    try {
      const file = riconosciFile(url);
      if (!file || file.bucket !== "prima-nota-attachments") throw new Error(t("Riferimento dell’allegato non riconosciuto."));
      await apriFileRiservato(file.bucket, file.path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Impossibile aprire l’allegato."));
    } finally { setBusy(false); }
  };
  return <Button type="button" variant="link" size="sm" className="h-auto max-w-full px-0 text-xs" disabled={busy} onClick={() => void apri()} aria-label={nome ? t("Apri allegato {nome}", { nome }) : t("Apri allegato della registrazione")}>
    <Paperclip className="mr-1 h-3 w-3 shrink-0" /><span className="truncate">{busy ? t("Apertura…") : nome || t("Apri allegato")}</span>
  </Button>;
}
