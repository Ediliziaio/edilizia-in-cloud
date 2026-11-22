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
import { PercorrenzeMezzi } from "./PercorrenzeMezzi";
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

  const e = economiaPianiMezzi(
    piani.data ?? [],
    prezzi.data ?? {},
    fonti.data ?? { fonti: [], legami: [] },
  );
  const righe = e.righe.filter(r => !r.piano.annullato || r.registrato || r.invalidi);
  return (
    <section
      className="mt-3 space-y-2.5 rounded-xl border bg-card p-2.5 sm:p-3"
      aria-label="Economia mezzi e noleggi"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Truck className="size-4 text-primary" />
          Mezzi e noleggi
        </h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Gestisci risorse e spese
        </Button>
      </div>
      <PercorrenzeMezzi ordine={orderId} costi />
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
      ) : righe.length ? (
        <>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
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
                className="rounded-md bg-muted/45 px-2.5 py-1.5"
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold tabular-nums">{value}</p>
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
                {righe.map((r) => (
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
            Importi netti IVA. I costi collegati sono già inclusi nel consuntivo e nel margine.
          </p>
        </>
      ) : <p className="px-0.5 text-xs text-muted-foreground">Nessun mezzo o noleggio pianificato.</p>}
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
