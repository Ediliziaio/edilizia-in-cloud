// src/components/orders/generali/unita/DividiUnitaDialog.tsx
// Dividere un'unità: A1 → A1a + A1b, con i m² ripartiti. I millesimi seguono i m²; l'unità
// di partenza resta nella storia con la sua commessa, e i suoi costi passano alle parti.
// Solo da tablet e computer.
import { useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { inCampo, leggiCampo } from "@/components/orders/generali/unita/aspetto";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { useDividiUnita } from "@/hooks/useGeneraleUnita";
import type { UnitaGenerale } from "@/lib/orders/generali/unita";
import { completaDivisione, formattaNumero, proponiDivisione } from "@/lib/orders/generali/unitaConti";

interface Props {
  generaleId: string;
  unita: UnitaGenerale | null;
  sigleEsistenti: string[];
  vedeImporti: boolean;
  onChiudi: () => void;
}

export function DividiUnitaDialog({ unita, onChiudi, ...resto }: Props) {
  return (
    <Dialog open={!!unita} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-w-2xl">
        {unita && <Modulo key={unita.orderId} u={unita} onChiudi={onChiudi} {...resto} />}
      </DialogContent>
    </Dialog>
  );
}

interface RigaParte { sigla: string; tipologia: string; mq: string; listino: string }

const inRighe = (u: UnitaGenerale, n: number): RigaParte[] =>
  proponiDivisione(u, n).map((p) => ({ sigla: p.sigla, tipologia: "", mq: inCampo(p.mq), listino: inCampo(p.listino) }));

function Modulo({ generaleId, u, sigleEsistenti, vedeImporti, onChiudi }: Omit<Props, "unita"> & { u: UnitaGenerale }) {
  const dividi = useDividiUnita(generaleId);
  const [righe, setRighe] = useState<RigaParte[]>(() => inRighe(u, 2));

  const numeri = righe.map((r) => ({ mq: leggiCampo(r.mq), listino: leggiCampo(r.listino) }));
  const scritteMale = numeri.some((n) => Number.isNaN(n.mq ?? 0) || Number.isNaN(n.listino ?? 0));
  const { parti, errori } = completaDivisione(
    u,
    righe.map((r, i) => ({
      sigla: r.sigla,
      tipologia: r.tipologia.trim() || null,
      mq: numeri[i].mq,
      listino: vedeImporti ? numeri[i].listino : null,
    })),
    sigleEsistenti,
  );
  const tuttiErrori = scritteMale ? ["Controlla i numeri: m² e prezzi.", ...errori] : errori;
  const sommaMq = numeri.reduce((t, n) => t + (Number.isNaN(n.mq ?? 0) ? 0 : n.mq ?? 0), 0);

  const scrivi = (i: number, campo: keyof RigaParte, valore: string) =>
    setRighe((rr) => rr.map((r, k) => (k === i ? { ...r, [campo]: valore } : r)));
  // Cambiando il numero di parti si riparte dalla proposta in parti uguali.
  const quante = (n: number) => setRighe(inRighe(u, n));

  const conferma = () => {
    if (tuttiErrori.length > 0 || dividi.isPending) return;
    dividi.mutate(
      { orderId: u.orderId, parti },
      {
        onSuccess: (n) => {
          toast.success(`${u.sigla} divisa in ${n} unità`, { description: parti.map((p) => p.sigla).join(", ") });
          onChiudi();
        },
        onError: (e) => toast.error(messaggioGenerale(e, "la divisione")),
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Dividi {u.sigla}</DialogTitle>
        <DialogDescription>
          Le parti diventano unità nuove, ognuna con la sua commessa. {u.sigla} resta nella storia con i suoi costi, che passano alle parti in proporzione ai m².
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-2 text-sm">
        <span>Parti</span>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Una parte in meno" disabled={righe.length <= 2} onClick={() => quante(righe.length - 1)}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="w-6 text-center font-medium tabular-nums">{righe.length}</span>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Una parte in più" disabled={righe.length >= 10} onClick={() => quante(righe.length + 1)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-1 pr-1 font-medium">Sigla</th>
            <th className="pb-1 pr-1 font-medium">Tipologia</th>
            <th className="pb-1 pr-1 text-right font-medium">m²</th>
            <th className="pb-1 pr-1 text-right font-medium">‰</th>
            {vedeImporti && <th className="pb-1 text-right font-medium">Listino €</th>}
          </tr>
        </thead>
        <tbody>
          {righe.map((r, i) => (
            <tr key={i}>
              <td className="py-0.5 pr-1"><Input aria-label={`Sigla della parte ${i + 1}`} className="h-8" value={r.sigla} onChange={(e) => scrivi(i, "sigla", e.target.value)} /></td>
              <td className="py-0.5 pr-1"><Input aria-label={`Tipologia della parte ${i + 1}`} className="h-8" value={r.tipologia} placeholder={u.tipologia ?? ""} onChange={(e) => scrivi(i, "tipologia", e.target.value)} /></td>
              <td className="py-0.5 pr-1"><Input aria-label={`m² della parte ${i + 1}`} className="h-8 text-right" inputMode="decimal" value={r.mq} onChange={(e) => scrivi(i, "mq", e.target.value)} /></td>
              <td className="py-0.5 pr-1 text-right tabular-nums text-muted-foreground">{parti[i]?.millesimi !== null && parti[i]?.millesimi !== undefined ? formattaNumero(parti[i].millesimi!) : "—"}</td>
              {vedeImporti && (
                <td className="py-0.5"><Input aria-label={`Listino della parte ${i + 1}`} className="h-8 text-right" inputMode="decimal" value={r.listino} onChange={(e) => scrivi(i, "listino", e.target.value)} /></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {u.mq !== null && (
        <p className="text-xs text-muted-foreground">m² delle parti: {formattaNumero(sommaMq)} su {formattaNumero(u.mq)}.</p>
      )}
      {tuttiErrori.length > 0 && <p role="alert" className="text-xs text-destructive">{tuttiErrori[0]}</p>}

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="ghost" onClick={onChiudi}>Annulla</Button>
        <Button type="button" onClick={conferma} disabled={tuttiErrori.length > 0 || dividi.isPending}>
          {dividi.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Dividi in {righe.length}
        </Button>
      </DialogFooter>
    </>
  );
}
