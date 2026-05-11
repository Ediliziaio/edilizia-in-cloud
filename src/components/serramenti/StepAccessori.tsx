/**
 * StepAccessori — Step 5 wizard: accessori e complementi.
 *
 * Tabella semplificata: tipo, descrizione, quantità, prezzo.
 * Foto cantiere/render gestite in Wave 4.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Image as ImageIcon, Plus, Trash2, Loader2 } from "lucide-react";
import {
  useAddAccessorio, useUpdateAccessorio, useDeleteAccessorio,
} from "@/lib/serramenti/queries";
import { SR_ACCESSORI_TIPI } from "@/types/serramenti";
import type { SrProgettoDetail, SrAccessorioRow } from "@/types/serramenti";
import { SrCard, SrCallout, formatEuro } from "@/lib/serramenti/wizardUI";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
}

export function StepAccessori({ progettoId, detail }: Props) {
  const addMut = useAddAccessorio(progettoId);
  const updateMut = useUpdateAccessorio(progettoId);
  const deleteMut = useDeleteAccessorio(progettoId);
  const [toDelete, setToDelete] = useState<SrAccessorioRow | null>(null);

  const accessori = detail.accessori;

  const handleAdd = () => {
    addMut.mutate({
      tipo: "avvolgibile",
      quantita: detail.serramenti.length || 1,
      position: accessori.length,
    });
  };

  const onPatch = (id: string, patch: Partial<SrAccessorioRow>) => {
    if (patch.prezzo_unitario !== undefined || patch.quantita !== undefined) {
      const orig = accessori.find((a) => a.id === id);
      if (orig) {
        const pu = patch.prezzo_unitario ?? orig.prezzo_unitario ?? 0;
        const q = patch.quantita ?? orig.quantita ?? 1;
        patch.prezzo_totale = pu * q;
      }
    }
    updateMut.mutate({ id, patch });
  };

  return (
    <div className="space-y-3">
      <SrCard
        title="Accessori e complementi"
        description="Avvolgibili, cassonetti, zanzariere, persiane e altri elementi che completano la fornitura."
        icon={<ImageIcon className="h-4 w-4" />}
      >
        {accessori.length === 0 ? (
          <div className="border-2 border-dashed border-emerald-200 rounded-md p-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">Nessun accessorio aggiunto</p>
            <Button onClick={handleAdd} className="bg-emerald-700 hover:bg-emerald-800" disabled={addMut.isPending}>
              {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Aggiungi accessorio
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Descrizione</TableHead>
                  <TableHead className="text-xs w-20">Q.tà</TableHead>
                  <TableHead className="text-xs w-32">Prezzo unit.</TableHead>
                  <TableHead className="text-xs w-28">Totale</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessori.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Select
                        value={a.tipo}
                        onValueChange={(v) => onPatch(a.id, { tipo: v })}
                      >
                        <SelectTrigger className="h-8 text-xs w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SR_ACCESSORI_TIPI.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        defaultValue={a.descrizione ?? ""}
                        onBlur={(e) => onPatch(a.id, { descrizione: e.target.value || null })}
                        placeholder="es. Alluminio coibentato"
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        defaultValue={a.quantita}
                        onBlur={(e) => onPatch(a.id, { quantita: Math.max(1, Number(e.target.value) || 1) })}
                        className="h-8 text-xs w-16"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        defaultValue={a.prezzo_unitario ?? ""}
                        onBlur={(e) => onPatch(a.id, { prezzo_unitario: e.target.value ? Number(e.target.value) : null })}
                        className="h-8 text-xs w-28"
                      />
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-emerald-700">
                      {formatEuro(a.prezzo_totale)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setToDelete(a)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button
              onClick={handleAdd}
              variant="outline"
              className="w-full gap-1 mt-3 border-dashed border-2 border-emerald-300 hover:bg-emerald-50"
              disabled={addMut.isPending}
            >
              {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Aggiungi accessorio
            </Button>
          </div>
        )}

        <SrCallout variant="info" className="mt-3">
          📷 La gestione foto cantiere/render verrà aggiunta in Wave 4 insieme alla generazione PDF.
        </SrCallout>
      </SrCard>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare l'accessorio?</AlertDialogTitle>
            <AlertDialogDescription>
              L'operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                if (toDelete) deleteMut.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
