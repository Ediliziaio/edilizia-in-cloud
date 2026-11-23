/**
 * Dove tagliare un PDF con più bolle: le miniature con il taglio proposto, che si toglie o si aggiunge
 * con un clic fra due pagine. Prima di leggere qualcosa la persona vede cosa diventerà ogni bolla.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dividiFile, gruppiDaTagli, tagliProposti, type PdfDaDividere } from "@/lib/ddt/dividiPdf";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function DividiPdfPannello({ pdf, onDiviso, onTogli }: {
  pdf: PdfDaDividere;
  onDiviso: (pezzi: File[], leggi?: boolean) => void;
  onTogli: () => void;
}) {
  const tr = useT();
  const proposta = useMemo(() => tagliProposti(pdf.testi), [pdf.testi]);
  const [tagli, setTagli] = useState<number[]>(proposta.tagli);
  const [lavoro, setLavoro] = useState(false);
  const gruppi = gruppiDaTagli(pdf.miniature.length, tagli);

  const cambia = (pagina: number) =>
    setTagli((p) => (p.includes(pagina) ? p.filter((t) => t !== pagina) : [...p, pagina]));

  const dividi = async (leggi = true) => {
    setLavoro(true);
    try {
      const pezzi = gruppi.length === 1 ? [pdf.file] : await dividiFile(pdf.file, gruppi);
      if (!leggi) {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (const file of pezzi) zip.file(file.name, await file.arrayBuffer());
        const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${pdf.file.name.replace(/\.pdf$/i, "")}-bolle-divise.zip`; a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      onDiviso(pezzi, leggi);
    } catch (e) {
      toast.error(tr("Non sono riuscito a dividere il PDF"), { description: e instanceof Error ? e.message : String(e) });
      setLavoro(false);
    }
  };

  return (
    <section aria-label={tr("Dividi {nome}", { nome: pdf.file.name })} className="space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 truncate font-medium" title={pdf.file.name}>{pdf.file.name}</p>
        <span className="text-xs text-muted-foreground">{tr(gruppi.length === 1 ? "{pagine} pagine · {n} bolla" : "{pagine} pagine · {n} bolle", { pagine: pdf.miniature.length, n: gruppi.length })}</span>
      </div>
      {proposta.senzaTesto > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
          {proposta.senzaTesto === pdf.miniature.length ? tr("È una scansione senza testo: ho tagliato a ogni pagina. Togli i tagli fra le pagine della stessa bolla.") : tr("Alcune pagine sono scansioni senza testo: ho tagliato a ogni pagina. Togli i tagli fra le pagine della stessa bolla.")}
        </p>
      )}
      <ol className="flex max-h-80 flex-wrap items-center gap-y-3 overflow-y-auto rounded-lg bg-muted/20 p-2">
        {pdf.miniature.map((src, i) => {
          const taglio = tagli.includes(i);
          return (
            <li key={i} className="flex items-center">
              {i > 0 && (
                <button
                  type="button"
                  aria-pressed={taglio}
                  aria-label={taglio ? tr("Togli il taglio prima di pagina {n}", { n: i + 1 }) : tr("Taglia prima di pagina {n}", { n: i + 1 })}
                  title={taglio ? tr("Togli il taglio") : tr("Taglia qui")}
                  className={`mx-1 flex h-10 w-7 items-center justify-center rounded border ${taglio ? "border-primary bg-primary text-primary-foreground" : "border-dashed text-muted-foreground hover:bg-muted"}`}
                  onClick={() => cambia(i)}
                >
                  <Scissors aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              )}
              <figure className="w-[92px]">
                <img src={src} alt={tr("Pagina {n}", { n: i + 1 })} className="w-full rounded border bg-white" />
                <figcaption className="mt-0.5 text-center text-[10px] text-muted-foreground">{tr("Pag. {n}", { n: i + 1 })}</figcaption>
              </figure>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={lavoro} onClick={onTogli}>{tr("Togli questo PDF")}</Button>
        <Button type="button" variant="outline" size="sm" disabled={lavoro} onClick={() => void dividi(false)}>{tr("Dividi e scarica senza lettura AI")}</Button>
        <Button type="button" size="sm" disabled={lavoro} onClick={() => void dividi()}>
          {lavoro && <Loader2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {gruppi.length === 1 ? tr("È una bolla sola: leggila") : tr("Dividi e leggi {n} bolle", { n: gruppi.length })}
        </Button>
      </div>
    </section>
  );
}
