import { useState } from "react";
import { Truck } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { usePianoMezziCantiere } from "@/hooks/usePianoMezziCantiere";
import { useMezziPianoEconomia } from "@/hooks/useMezziPianoEconomia";
import { useMezzi } from "@/hooks/useMezzi";
import { economiaPianiMezzi } from "@/lib/mezzi/economiaPiani";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PianoMezziCantiere } from "./PianoMezziCantiere";
export function CostiMezziRiepilogo({ orderId }: { orderId: string }) {
  const p = usePermissions();
  const enabled = p.canViewCosts && (p.canViewMezzi || p.isAdmin);
  const { piani, prezzi } = usePianoMezziCantiere(orderId, enabled, true);
  const { fonti } = useMezziPianoEconomia(orderId, enabled);
  const { data: mezzi = [] } = useMezzi();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  const loading =
    piani.isLoading ||
    (piani.data?.length && (prezzi.isPending || fonti.isPending));
  const error = piani.isError || prezzi.isError || fonti.isError;
  if (!loading && !error && !piani.data?.length) return null;
  const e = economiaPianiMezzi(
    piani.data ?? [],
    prezzi.data ?? {},
    fonti.data ?? { fonti: [], legami: [] },
  );
  return (
    <section
      className="mt-3 space-y-3 rounded-xl border border-blue-100 bg-blue-50/30 p-3"
      aria-label="Economia mezzi e noleggi"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Truck className="h-4 w-4" />
          Mezzi e noleggi della commessa
        </h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Gestisci risorse e spese
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          Dati mezzi non disponibili.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void piani.refetch();
              void prezzi.refetch();
              void fonti.refetch();
            }}
          >
            Riprova
          </button>
        </p>
      ) : loading ? (
        <p className="text-xs">Caricamento costi mezzi…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              ["Previsto per le assegnazioni", formatCurrency(e.previsto)],
              [
                "Già incluso nei costi commessa",
                e.invalidi ? "Da riconciliare" : formatCurrency(e.registrato),
              ],
              [
                "Copertura del preventivo",
                e.senzaPreventivo
                  ? `${e.senzaPreventivo} da valorizzare`
                  : "Completa",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border bg-white/80 p-3 dark:bg-background"
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-base font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b">
                  <th className="p-2">Risorsa</th>
                  <th className="p-2 text-right">Previsto</th>
                  <th className="p-2 text-right">Registrato e collegato</th>
                  <th className="p-2">Verifica</th>
                </tr>
              </thead>
              <tbody>
                {e.righe
                  .filter(
                    (r) => !r.piano.annullato || r.registrato || r.invalidi,
                  )
                  .map((r) => (
                    <tr key={r.piano.id} className="border-b last:border-0">
                      <td className="p-2">
                        {mezzi.find((m) => m.id === r.piano.mezzo_id)?.nome ??
                          "Risorsa"}
                        {r.piano.annullato ? " · Annullata" : ""}
                      </td>
                      <td className="p-2 text-right">
                        {r.previsto === null
                          ? "Da definire"
                          : formatCurrency(r.previsto)}
                      </td>
                      <td className="p-2 text-right">
                        {r.invalidi
                          ? "Da riconciliare"
                          : formatCurrency(r.registrato)}
                      </td>
                      <td className="p-2">
                        {r.invalidi
                          ? "Fonte aggiornata: ricontrolla"
                          : r.scostamento !== null && r.scostamento > 0
                            ? `Oltre preventivo: ${formatCurrency(r.scostamento)}`
                            : r.registrato
                              ? "Collegamento presente"
                              : "Collega le spese registrate"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {e.invalidi > 0 && (
            <p role="alert" className="text-xs text-amber-800">
              Un costo è stato modificato, spostato o annullato: ricontrolla le
              quote collegate prima di confrontare il consuntivo.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Importi netti IVA. Il previsto serve al confronto; i costi
            registrati sono già nel consuntivo e nel margine diretto. Non
            vengono sommati nuovamente, neppure quando arriva la fattura di un
            OdA. Le stime annue del parco restano separate.
          </p>
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Mezzi, noleggi e spese</DialogTitle>
            <DialogDescription>
              Gestisci assegnazioni e documenti senza uscire dalla commessa.
            </DialogDescription>
          </DialogHeader>
          {open && <PianoMezziCantiere orderId={orderId} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
