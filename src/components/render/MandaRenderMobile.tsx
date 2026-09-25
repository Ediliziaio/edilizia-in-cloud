import { useEffect, useRef, useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { condividiFile } from "@/lib/mobile/condividiFile";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";

interface MandaRenderMobileProps {
  /** L'immagine del render finito. */
  resultUrl: string;
  /** Nome del file mandato, senza estensione (es. «render-infissi»). */
  nomeFile: string;
  className?: string;
}

async function scaricaImmagine(url: string): Promise<Blob> {
  const risposta = await fetchWithTimeout(url, { timeoutMs: 30_000, context: "render.condividi" });
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
  return risposta.blob();
}

/**
 * Telefono: il render finito va al cliente dal foglio di condivisione
 * (WhatsApp, Mail…). Prima dal telefono non c'era modo di mandarlo: lo
 * «Scarica» è solo sul computer.
 *
 * L'immagine si prepara appena il render è pronto, così al tocco il foglio si
 * apre subito (il browser rifiuta la condivisione se passa troppo tempo dal
 * tocco); se non è ancora pronta e il tocco «scade», un avviso chiede un
 * secondo tocco.
 */
export function MandaRenderMobile({ resultUrl, nomeFile, className }: MandaRenderMobileProps) {
  const immagineRef = useRef<Promise<Blob> | null>(null);
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    const promessa = scaricaImmagine(resultUrl);
    // Se la preparazione fallisce si riprova al tocco.
    promessa.catch(() => {
      if (immagineRef.current === promessa) immagineRef.current = null;
    });
    immagineRef.current = promessa;
  }, [resultUrl]);

  const manda = async () => {
    if (inCorso) return;
    setInCorso(true);
    try {
      const immagine = await (immagineRef.current ?? scaricaImmagine(resultUrl));
      const estensione = immagine.type.includes("jpeg") ? "jpg" : immagine.type.includes("webp") ? "webp" : "png";
      const esito = await condividiFile(immagine, `${nomeFile}.${estensione}`, "Render");
      if (esito === "serve-un-tocco") {
        toast("Render pronto", { action: { label: "Manda", onClick: () => void manda() } });
      } else if (esito === "non-supportato") {
        // Nessun foglio di condivisione: si apre l'immagine, da lì si tiene premuto per salvarla.
        window.open(resultUrl, "_blank", "noopener");
      }
    } catch {
      toast.error("Non riesco a preparare l'immagine. Riprova tra poco.");
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Button type="button" onClick={() => void manda()} disabled={inCorso} className={cn("gap-2", className)}>
      {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
      Manda al cliente
    </Button>
  );
}
