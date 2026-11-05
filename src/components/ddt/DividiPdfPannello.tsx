/**
 * Dove tagliare un PDF con più bolle: le miniature con il taglio proposto, che si toglie o si aggiunge
 * con un clic fra due pagine. Prima di leggere qualcosa la persona vede cosa diventerà ogni bolla.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dividiFile, gruppiDaTagli, tagliProposti, type PdfDaDividere } from "@/lib/ddt/dividiPdf";

export function DividiPdfPannello({ pdf, onDiviso, onTogli }: {
  pdf: PdfDaDividere;
  onDiviso: (pezzi: File[]) => void;
  onTogli: () => void;
}) {
  const proposta = useMemo(() => tagliProposti(pdf.testi), [pdf.testi]);
  const [tagli, setTagli] = useState<number[]>(proposta.tagli);
  const [lavoro, setLavoro] = useState(false);
  const gruppi = gruppiDaTagli(pdf.miniature.length, tagli);

  const cambia = (pagina: number) =>
    setTagli((p) => (p.includes(pagina) ? p.filter((t) => t !== pagina) : [...p, pagina]));

  const dividi = async () => {
    setLavoro(true);
    try {
      onDiviso(gruppi.length === 1 ? [pdf.file] : await dividiFile(pdf.file, gruppi));
    } catch (e) {
      toast.error("Non sono riuscito a dividere il PDF", { description: e instanceof Error ? e.message : String(e) });
      setLavoro(false);
    }
  };

  return (
    <section aria-label={`Dividi ${pdf.file.name}`} className="space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 truncate font-medium" title={pdf.file.name}>{pdf.file.name}</p>
        <span className="text-xs text-muted-foreground">{pdf.miniature.length} pagine · {gruppi.length} {gruppi.length === 1 ? "bolla" : "bolle"}</span>
      </div>
      {proposta.senzaTesto > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
          {proposta.senzaTesto === pdf.miniature.length ? "È una scansione senza testo" : "Alcune pagine sono scansioni senza testo"}: ho tagliato a ogni pagina. Togli i tagli fra le pagine della stessa bolla.
        </p>
      )}
      <ol className="flex flex-wrap items-center gap-y-3">
        {pdf.miniature.map((src, i) => {
          const taglio = tagli.includes(i);
          return (
            <li key={i} className="flex items-center">
              {i > 0 && (
                <button
                  type="button"
                  aria-pressed={taglio}
                  aria-label={taglio ? `Togli il taglio prima di pagina ${i + 1}` : `Taglia prima di pagina ${i + 1}`}
                  title={taglio ? "Togli il taglio" : "Taglia qui"}
                  className={`mx-1 flex h-10 w-7 items-center justify-center rounded border ${taglio ? "border-primary bg-primary text-primary-foreground" : "border-dashed text-muted-foreground hover:bg-muted"}`}
                  onClick={() => cambia(i)}
                >
                  <Scissors aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              )}
              <figure className="w-[92px]">
                <img src={src} alt={`Pagina ${i + 1}`} className="w-full rounded border bg-white" />
                <figcaption className="mt-0.5 text-center text-[10px] text-muted-foreground">Pag. {i + 1}</figcaption>
              </figure>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={lavoro} onClick={onTogli}>Togli questo PDF</Button>
        <Button type="button" size="sm" disabled={lavoro} onClick={() => void dividi()}>
          {lavoro && <Loader2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {gruppi.length === 1 ? "È una bolla sola: leggila" : `Dividi e leggi ${gruppi.length} bolle`}
        </Button>
      </div>
    </section>
  );
}
