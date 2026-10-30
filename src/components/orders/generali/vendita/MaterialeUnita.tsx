// src/components/orders/generali/vendita/MaterialeUnita.tsx
// Nel pannello dell'unità (tabellone): la planimetria e le foto caricate per quell'unità, in
// anteprima (immagini e PDF, prima pagina). Toccando un'anteprima si apre il file.
// «Carica planimetria» se manca, «Aggiungi foto»: il file va nell'archivio della commessa
// dell'unità, segnato sulla voce della checklist. Da telefono si guarda e si apre, non si carica.
import { useRef, useState } from "react";
import { FileText, ImagePlus, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { openAttachmentInTab } from "@/components/orders/filePreviewUtils";
import { messaggioDocumenti, useCaricaDocumentoVoce } from "@/hooks/useGeneraleDocumenti";
import { useAnteprimaAllegato, useFileVenditaUnita, type AllegatoVendita } from "@/hooks/useGeneraleVendita";
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { voceMateriale, type MaterialeVendita } from "@/lib/orders/generali/vendita";
import { cn } from "@/lib/utils";

interface Props {
  generaleId: string;
  modello: ModelloGenerale;
  orderId: string;
  sigla: string;
  /** Caricare: da tablet e computer, con il permesso di modificare. */
  puoCaricare: boolean;
}

const ACCETTA = "image/*,application/pdf,.pdf";

export function MaterialeUnita({ generaleId, modello, orderId, sigla, puoCaricare }: Props) {
  const { file, voci, isLoading, isError, refetch } = useFileVenditaUnita({ generaleId, modello, orderId });
  const carica = useCaricaDocumentoVoce(generaleId);
  const input = useRef<HTMLInputElement>(null);
  const [cosa, setCosa] = useState<MaterialeVendita>("planimetria");

  if (isLoading) return <Skeleton className="h-28 w-full rounded-md" />;
  if (isError || !file) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Non riesco a leggere planimetria e foto. <button type="button" className="underline" onClick={refetch}>Riprova</button>
      </p>
    );
  }

  const planimetria = file.planimetria[0] ?? null;
  const foto = file.foto;
  const scegli = (m: MaterialeVendita) => {
    setCosa(m);
    input.current?.click();
  };
  const caricaFile = (f: File) => {
    const voce = voceMateriale(voci, cosa);
    carica.mutate(
      { orderId, voce, file: f, scadenza: null },
      {
        onSuccess: () => toast.success(`${voce.nome} di ${sigla} caricata`),
        onError: (e) => toast.error(messaggioDocumenti(e, "Non sono riuscito a caricare il file.")),
      },
    );
  };

  const vuoto = !planimetria && foto.length === 0;
  return (
    <section aria-label="Planimetria e foto" className="space-y-2">
      {!vuoto && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {planimetria && (
            <li className="col-span-2 row-span-2">
              <Anteprima a={planimetria} etichetta="Planimetria" grande />
            </li>
          )}
          {foto.map((a) => (
            <li key={a.id}><Anteprima a={a} etichetta="Foto" /></li>
          ))}
        </ul>
      )}
      {vuoto && !puoCaricare && <p className="text-sm text-muted-foreground">Nessuna planimetria caricata per {sigla}.</p>}
      {puoCaricare && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCETTA}
            className="sr-only"
            aria-label="Scegli il file da caricare"
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              ev.target.value = "";
              if (f) caricaFile(f);
            }}
          />
          {!planimetria && (
            <Button type="button" size="sm" variant="outline" disabled={carica.isPending} onClick={() => scegli("planimetria")}>
              {carica.isPending && cosa === "planimetria" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              Carica planimetria
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" disabled={carica.isPending} onClick={() => scegli("foto")}>
            {carica.isPending && cosa === "foto" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1.5 h-3.5 w-3.5" />}
            Aggiungi foto o render
          </Button>
        </div>
      )}
    </section>
  );
}

function Anteprima({ a, etichetta, grande = false }: { a: AllegatoVendita; etichetta: string; grande?: boolean }) {
  const { data: src, isLoading } = useAnteprimaAllegato(a);
  const [rotta, setRotta] = useState(false);
  return (
    <button
      type="button"
      onClick={() => void openAttachmentInTab(a.file_url)}
      aria-label={`${etichetta}: apri ${a.file_name}`}
      title={a.file_name}
      className={cn(
        "group relative flex w-full items-center justify-center overflow-hidden rounded-md border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        grande ? "aspect-[4/3]" : "aspect-square",
      )}
    >
      {isLoading ? (
        <Skeleton className="h-full w-full" />
      ) : src && !rotta ? (
        <img src={src} alt="" className={cn("h-full w-full bg-white", grande ? "object-contain" : "object-cover")} onError={() => setRotta(true)} />
      ) : (
        <span className="flex flex-col items-center gap-1 px-2 text-center text-xs text-muted-foreground">
          <FileText className="h-5 w-5" />
          <span className="line-clamp-2 break-all">{a.file_name}</span>
        </span>
      )}
      {grande && (
        <span className="absolute left-1.5 top-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium">{etichetta}</span>
      )}
    </button>
  );
}
