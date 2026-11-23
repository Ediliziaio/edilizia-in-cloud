import { useEffect, useState } from "react";
import { ImageIcon, ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useFileRiservato } from "@/hooks/useFileRiservati";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function AnteprimaFotoCampo({ foto, etichetta, className }: {
  foto: Blob | string;
  etichetta: string;
  className?: string;
}) {
  const t = useT();
  const firmata = useFileRiservato(typeof foto === "string" ? foto : null);
  const [locale, setLocale] = useState<{ foto: Blob; url: string } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    if (typeof foto === "string" || typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(foto);
    let presente = true;
    queueMicrotask(() => {
      if (presente) setLocale({ foto, url });
    });
    return () => {
      presente = false;
      URL.revokeObjectURL?.(url);
    };
  }, [foto]);

  const url = typeof foto === "string" ? firmata : locale?.foto === foto ? locale.url : null;
  const disponibile = !!url && errore !== url;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" disabled={!disponibile}
          aria-label={disponibile ? t("Ingrandisci {etichetta}", { etichetta }) : t("{etichetta}, anteprima non disponibile", { etichetta })}
          className={cn("relative grid size-full min-h-12 place-items-center overflow-hidden rounded-xl border bg-muted text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", className)}>
          <ImageIcon className="size-5" aria-hidden="true" />
          {disponibile && <>
            <img src={url} alt="" loading="lazy" decoding="async" onError={() => setErrore(url)}
              className="absolute inset-0 size-full bg-muted object-cover" />
            <span className="absolute bottom-1 right-1 grid size-6 place-items-center rounded-md bg-black/70 text-white">
              <ZoomIn className="size-3.5" aria-hidden="true" />
            </span>
          </>}
        </button>
      </DialogTrigger>
      {disponibile && (
        <DialogContent aria-describedby={undefined} overlayClassName="z-[70] bg-black/60 motion-reduce:animate-none"
          className="top-1/2 z-[71] max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl gap-3 overflow-y-auto rounded-2xl p-3 motion-reduce:animate-none sm:p-5">
          <DialogTitle className="break-words pr-9 text-base">{etichetta}</DialogTitle>
          <img src={url} alt={etichetta} className="max-h-[calc(100dvh-6rem)] w-full rounded-xl bg-muted object-contain" />
        </DialogContent>
      )}
    </Dialog>
  );
}
