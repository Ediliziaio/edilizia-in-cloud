// src/components/orders/generali/piano/DettaglioRighe.tsx
// «Ogni numero dice da dove viene» (piano §3.1 punto 2): le righe che compongono un numero
// del reale — spese, ordini d'acquisto, ore, squadre, fatture — con la commessa di ognuna.
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dataBreve, euro } from "@/components/orders/generali/piano/formato";
import { FONTI_REALI } from "@/lib/orders/generali/pianoCategorie";
import type { RigaReale } from "@/lib/orders/generali/pianoConti";

export interface DettaglioAperto { titolo: string; righe: RigaReale[] }

export function DettaglioRighe({ dettaglio, onClose, commesse, generaleId }: {
  dettaglio: DettaglioAperto | null;
  onClose: () => void;
  /** id → «C-101 · Appartamento A1». */
  commesse: Map<string, string>;
  generaleId: string;
}) {
  const righe = [...(dettaglio?.righe ?? [])].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  const totale = righe.reduce((t, r) => t + r.importo, 0);
  return (
    <Dialog open={!!dettaglio} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{dettaglio?.titolo}</DialogTitle>
          <DialogDescription>
            {righe.length === 1 ? "1 riga" : `${righe.length} righe`} · {euro(totale)} al netto dell'IVA
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-2 py-2 font-medium">Descrizione</th>
                <th className="px-2 py-2 font-medium">Commessa</th>
                <th className="px-2 py-2 font-medium">Da dove</th>
                <th className="px-3 py-2 text-right font-medium">Importo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {righe.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground">{dataBreve(r.data)}</td>
                  <td className="px-2 py-1.5">{r.descrizione || "—"}</td>
                  <td className="max-w-[14rem] truncate px-2 py-1.5">
                    {r.orderId === generaleId ? (
                      <span className="text-muted-foreground">Generale (costo comune)</span>
                    ) : (
                      <Link to={`/azienda/ordini/${r.orderId}`} className="hover:underline">{commesse.get(r.orderId) ?? "Commessa"}</Link>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs text-muted-foreground">{FONTI_REALI[r.fonte] ?? r.fonte}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{euro(r.importo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
