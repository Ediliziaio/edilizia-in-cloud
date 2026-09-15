/**
 * AccessoriSection — i complementi senza finestra.
 *
 * Tapparelle, zanzariere, cassonetti e persiane stanno nel box della loro
 * finestra (ComplementiFinestra), dove prendono le misure. Qui restano quelli
 * che una finestra non ce l'hanno: aggiunti prima che si potessero legare,
 * importati dal sopralluogo, o rimasti dopo aver tolto la loro finestra. Si
 * agganciano a una finestra, e da lì ne seguono misure e posa. Senza, la
 * sezione non c'è.
 */
import { useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSupplierProductLines } from "@/features/serramenti-listini/hooks/useSupplierProductLines";
import type { SupplierProductLine } from "@/features/serramenti-listini/types";
import { conTotale, nomeBreve } from "@/lib/serramenti/complementiFinestra";
import { useDeleteAccessorio, useTariffeManodopera, useUpdateAccessorio } from "@/lib/serramenti/queries";
import { SrCard } from "@/lib/serramenti/wizardUI";
import type { SrAccessorioRow, SrProgettoDetail } from "@/types/serramenti";
import { ComplementoRiga } from "./ComplementiFinestra";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
  /** Le finestre a cui agganciare un complemento, numerate come nella composizione. */
  finestre: ReadonlyArray<{ id: string; etichetta: string }>;
}

export function AccessoriSection({ progettoId, detail, finestre }: Props) {
  const updateMut = useUpdateAccessorio(progettoId);
  const deleteMut = useDeleteAccessorio(progettoId);
  const [toDelete, setToDelete] = useState<SrAccessorioRow | null>(null);

  const senzaFinestra = useMemo(() => {
    const finestreDelPreventivo = new Set(detail.serramenti.map((s) => s.id));
    return detail.accessori.filter((a) => !a.serramento_id || !finestreDelPreventivo.has(a.serramento_id));
  }, [detail.accessori, detail.serramenti]);

  // Tariffe e linee fornitore: servono a ricalcolare il prezzo quando cambiano
  // misure, pezzi o varianti.
  const { data: tariffe = [] } = useTariffeManodopera();
  const tariffePrezzi = useMemo(() => {
    const m = new Map<string, number>();
    tariffe.forEach((t) => { if (t.prezzo_vendita != null) m.set(t.id, Number(t.prezzo_vendita)); });
    return m;
  }, [tariffe]);
  const { lines: supplierLines = [] } = useSupplierProductLines({
    enabled: senzaFinestra.some((a) => !!a.family_id),
  });
  const supplierLineMap = useMemo(() => {
    const m = new Map<string, SupplierProductLine>();
    supplierLines.forEach((line) => m.set(line.id, line));
    return m;
  }, [supplierLines]);

  if (senzaFinestra.length === 0) return null;

  return (
    <>
      <SrCard
        title="Complementi senza finestra"
        description="Aggiunti prima che i complementi stessero nel box della finestra, o importati dal sopralluogo. Agganciali alla loro finestra: ne seguiranno misure e posa."
        icon={<Link2 className="h-4 w-4" />}
      >
        <div className="space-y-1.5">
          {senzaFinestra.map((a) => (
            <ComplementoRiga
              key={a.id}
              a={a}
              tariffePrezzi={tariffePrezzi}
              supplierLineMap={supplierLineMap}
              onPatch={(patch) => updateMut.mutate({ id: a.id, patch: conTotale(a, patch) })}
              onElimina={() => setToDelete(a)}
              finestre={finestre}
            />
          ))}
        </div>
      </SrCard>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il complemento?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? toDelete.descrizione || nomeBreve(toDelete.tipo) : ""} verrà rimosso dal preventivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) deleteMut.mutate(toDelete.id);
                setToDelete(null);
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
