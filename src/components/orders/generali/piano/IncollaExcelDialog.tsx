// src/components/orders/generali/piano/IncollaExcelDialog.tsx
// «Incolla da Excel»: si copiano le righe del foglio, si incollano qui, si controlla
// l'anteprima (tipo, categoria, importo, mese) e solo allora si aggiungono al piano.
// Le righe con un problema restano fuori finché non si correggono nel foglio.
import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardPaste, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CellaScelta } from "@/components/orders/generali/piano/Celle";
import { euro, nomeMese } from "@/components/orders/generali/piano/formato";
import { messaggioPiano, useAggiungiVoci } from "@/hooks/useGeneralePiano";
import type { FigliaGenerale } from "@/lib/orders/commesseGenerali";
import { CATEGORIE_PIANO, categorieDelTipo, type CategoriaPiano } from "@/lib/orders/generali/pianoCategorie";
import { leggiIncolla, type RigaIncollata } from "@/lib/orders/generali/pianoExcel";
import { cn } from "@/lib/utils";

const ESEMPIO = "Voce\tCategoria\tImporto\tMese\tDurata\nAcquisto terreno\tTerreno\t350.000\t11/2026\t1\nCostruzione\tCostruzione\t1.200.000\t03/2027\t16\nVendita appartamenti\tVendite\t2.400.000\t06/2028\t8";

export function IncollaExcelDialog({ open, onOpenChange, generaleId, versioneId, figlie, partenza }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  generaleId: string;
  versioneId: string;
  figlie: FigliaGenerale[];
  /** Il mese da cui contare «Mese 1, Mese 2…». */
  partenza: string;
}) {
  const [testo, setTesto] = useState("");
  // Le categorie cambiate a mano nell'anteprima, per numero di riga.
  const [scelte, setScelte] = useState<Record<number, CategoriaPiano>>({});
  const aggiungi = useAggiungiVoci(generaleId, versioneId);

  const esito = useMemo(
    () => leggiIncolla(testo, { partenza, figlie: figlie.map((f) => ({ id: f.id, codice: f.codice, nome: f.nome })) }),
    [testo, partenza, figlie],
  );
  const righe: RigaIncollata[] = esito.righe.map((r) => (scelte[r.riga] ? { ...r, categoria: scelte[r.riga], categoriaSicura: true } : r));
  const buone = righe.filter((r) => r.problemi.length === 0 && r.importo !== null);
  const conProblemi = righe.length - buone.length;
  const totale = (tipo: "ricavo" | "costo") => buone.filter((r) => r.tipo === tipo).reduce((t, r) => t + (r.importo ?? 0), 0);

  const chiudi = (o: boolean) => {
    if (!o) {
      setTesto("");
      setScelte({});
    }
    onOpenChange(o);
  };

  const importa = () => {
    aggiungi.mutate(
      buone.map((r) => ({
        tipo: r.tipo, categoria: r.categoria, descrizione: r.descrizione, importo: r.importo ?? 0,
        mese: r.mese, durataMesi: r.durataMesi, figliaId: r.figliaId,
      })),
      {
        onSuccess: (ids) => {
          toast.success(ids.length === 1 ? "1 voce aggiunta al piano" : `${ids.length} voci aggiunte al piano`);
          chiudi(false);
        },
        onError: (e) => toast.error(messaggioPiano(e, "le voci")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={chiudi}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Incolla da Excel</DialogTitle>
          <DialogDescription>
            Copia le righe dal tuo foglio (con o senza la riga dei titoli) e incollale qui. Servono almeno descrizione e
            importo; mese, durata in mesi, categoria e commessa se ci sono. Importi al netto dell'IVA.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={testo}
          onChange={(e) => {
            setTesto(e.target.value);
            setScelte({});
          }}
          placeholder={ESEMPIO}
          aria-label="Righe incollate da Excel"
          className="min-h-[7rem] font-mono text-sm"
        />

        {righe.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm">
              <strong>{buone.length}</strong> {buone.length === 1 ? "riga pronta" : "righe pronte"}
              {totale("ricavo") > 0 && <> · ricavi {euro(totale("ricavo"))}</>}
              {totale("costo") > 0 && <> · costi {euro(totale("costo"))}</>}
              {conProblemi > 0 && <span className="text-destructive"> · {conProblemi} da correggere nel foglio</span>}
              {esito.saltate > 0 && <span className="text-muted-foreground"> · {esito.saltate} vuote o di totale saltate</span>}
            </p>
            <div className="max-h-[45vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Riga</th>
                    <th className="px-2 py-2 font-medium">Voce</th>
                    <th className="px-2 py-2 font-medium">Tipo</th>
                    <th className="px-2 py-2 font-medium">Categoria</th>
                    <th className="px-2 py-2 text-right font-medium">Importo</th>
                    <th className="px-2 py-2 font-medium">Mese</th>
                    <th className="px-2 py-2 text-right font-medium">Mesi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {righe.map((r) => (
                    <tr key={r.riga} className={cn(r.problemi.length > 0 && "bg-destructive/5")}>
                      <td className="px-2 py-1 tabular-nums text-muted-foreground">{r.riga}</td>
                      <td className="px-2 py-1">
                        {r.descrizione || <span className="text-muted-foreground">senza descrizione</span>}
                        {r.problemi.map((x) => (
                          <p key={x} className="flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3 shrink-0" /> {x}
                          </p>
                        ))}
                      </td>
                      <td className="px-2 py-1">{r.tipo === "ricavo" ? "Ricavo" : "Costo"}</td>
                      <td className="px-1 py-1">
                        <CellaScelta
                          valore={r.categoria}
                          scelte={categorieDelTipo(r.tipo).map((c) => ({ valore: c.id, nome: c.nome }))}
                          etichetta={`Categoria della riga ${r.riga}`}
                          className={cn(!r.categoriaSicura && "text-amber-700 dark:text-amber-400")}
                          onSalva={(c) => setScelte((s) => ({ ...s, [r.riga]: c }))}
                        />
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.importo === null ? "—" : euro(r.importo)}</td>
                      <td className={cn("px-2 py-1", !r.mese && "text-amber-700 dark:text-amber-400")}>{r.mese ? nomeMese(r.mese) : "manca"}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.durataMesi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {righe.some((r) => !r.categoriaSicura) && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Le categorie in arancione sono state scelte senza indizi ({CATEGORIE_PIANO.altri_costi.nome} / {CATEGORIE_PIANO.altri_ricavi.nome}): controllale.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => chiudi(false)}>Annulla</Button>
          <Button onClick={importa} disabled={buone.length === 0 || aggiungi.isPending}>
            {aggiungi.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ClipboardPaste className="mr-1.5 h-4 w-4" />}
            {buone.length === 1 ? "Aggiungi 1 voce" : `Aggiungi ${buone.length} voci`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
