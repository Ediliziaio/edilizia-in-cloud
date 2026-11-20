import { useState } from "react";
import { ArrowUpRight, FileText, Layers3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { quantitaContratto, totaleElencoLavori, type RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import { MacrofasiSubappalto } from "./MacrofasiSubappalto";

export function LavorazioniAffidateDialog({
  titolo, righe, oneri = 0, importoPattuito, onApriContratto, onPdf, etichettaPdf = "PDF contratto", pdfInCorso, onClose,
}: {
  titolo: string;
  righe: readonly RigaElencoLavori[];
  oneri?: number;
  importoPattuito?: number;
  onApriContratto?: () => void;
  onPdf?: () => void;
  etichettaPdf?: string;
  pdfInCorso?: boolean;
  onClose: () => void;
}) {
  const [attiva, setAttiva] = useState("");
  const fasi = new Map<string, { id: string; nome: string; righe: RigaElencoLavori[] }>();
  for (const riga of righe) {
    const nome = riga.fase || "Altri lavori";
    const id = riga.fase_id || nome;
    const gruppo = fasi.get(id) ?? { id, nome, righe: [] };
    gruppo.righe.push(riga);
    fasi.set(id, gruppo);
  }
  const elenco = [...fasi.values()];
  const visibili = attiva ? elenco.filter(fase => fase.id === attiva) : elenco;
  const totaleLavori = totaleElencoLavori([...righe]);
  const pattuito = importoPattuito != null && Number.isFinite(importoPattuito) ? importoPattuito : null;
  const totale = (pattuito ?? totaleLavori) + oneri;
  const mostraDifferenza = righe.length > 0 && pattuito != null && Math.abs(pattuito - totaleLavori) > 0.005;

  const dettaglio = <div className="min-w-0 space-y-3">
    {visibili.map(fase => (
      <section key={fase.id} aria-label={fase.nome} className="overflow-hidden rounded-lg border bg-background">
        <div className="flex items-baseline justify-between gap-4 border-b bg-muted/40 px-3 py-2.5 sm:px-4">
          <h3 className="text-sm font-semibold">{fase.nome}</h3>
          {elenco.length > 1 && (
            <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(totaleElencoLavori(fase.righe))}</span>
          )}
        </div>
        <table className="w-full table-fixed text-sm">
          <thead className="hidden bg-muted/20 text-xs text-muted-foreground sm:table-header-group">
            <tr className="border-b">
              <th scope="col" className="px-4 py-2 text-left font-medium">Lavorazione</th>
              <th scope="col" className="w-28 px-3 py-2 text-right font-medium">Quantità</th>
              <th scope="col" className="w-28 px-3 py-2 text-right font-medium">Prezzo unitario</th>
              <th scope="col" className="w-32 px-4 py-2 text-right font-medium">Importo</th>
            </tr>
          </thead>
          <tbody className="block divide-y sm:table-row-group">
            {fase.righe.map((riga, indice) => {
              const aCorpo = riga.unita?.trim().toLowerCase() === "a corpo";
              const misura = aCorpo ? "A corpo" : `${quantitaContratto(riga.quantita)} ${riga.unita ?? ""}`.trim();
              const prezzo = riga.prezzo > 0 ? formatCurrency(riga.prezzo) : "Da definire";
              return (
                <tr key={riga.affidamento_id ?? indice} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-3 py-2.5 sm:table-row sm:px-0 sm:py-0">
                  <th scope="row" className="min-w-0 break-words text-left font-medium sm:px-4 sm:py-3">
                    {riga.sottofase && <span className="block text-xs font-normal text-muted-foreground">{riga.sottofase}</span>}
                    {riga.descrizione}
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:hidden">{misura}{!aCorpo && ` · ${prezzo}`}</span>
                  </th>
                  <td className="hidden px-3 text-right tabular-nums text-muted-foreground sm:table-cell">{misura}</td>
                  <td className="hidden px-3 text-right tabular-nums text-muted-foreground sm:table-cell">{aCorpo ? "—" : prezzo}</td>
                  <td className="whitespace-nowrap text-right font-semibold tabular-nums sm:px-4">{formatCurrency(totaleElencoLavori([riga]))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    ))}
  </div>;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[54rem]">
        <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12 text-left sm:px-6 sm:pr-14">
          <DialogTitle className="flex items-center gap-2">
            <Layers3 className="size-[18px] shrink-0 text-primary" aria-hidden="true" />
            Lavorazioni affidate
          </DialogTitle>
          <DialogDescription className="break-words">{titolo}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto bg-muted/25 p-4 sm:px-6">
          {elenco.length > 1 ? (
            <MacrofasiSubappalto fasi={elenco.map(fase => ({
              id: fase.id, nome: fase.nome, voci: fase.righe.length, dettaglio: formatCurrency(totaleElencoLavori(fase.righe)),
            }))} attiva={attiva} onSeleziona={setAttiva}>{dettaglio}</MacrofasiSubappalto>
          ) : elenco.length === 1 ? dettaglio : (
            <p className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">Nessuna lavorazione registrata.</p>
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 sm:px-6">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs font-medium text-muted-foreground">{pattuito == null ? "Totale lavorazioni" : "Totale contratto"}</span>
              <strong className="text-lg font-semibold tabular-nums text-primary">{formatCurrency(totale)}</strong>
              <span className="text-xs text-muted-foreground">IVA esclusa</span>
            </div>
            {(oneri > 0 || mostraDifferenza) && (
              <p className="text-xs text-muted-foreground">
                {mostraDifferenza && `Voci elencate ${formatCurrency(totaleLavori)}`}
                {oneri > 0 && `${mostraDifferenza ? " · " : ""}Oneri di sicurezza ${formatCurrency(oneri)}`}
              </p>
            )}
          </div>
          {onPdf ? (
            <Button size="sm" variant="outline" onClick={onPdf} disabled={pdfInCorso}>
              {pdfInCorso ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FileText className="mr-1.5 size-4" />}{etichettaPdf}
            </Button>
          ) : onApriContratto && (
            <Button size="sm" variant="outline" onClick={onApriContratto}>
              Apri contratto <ArrowUpRight className="ml-1.5 size-4" />
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
