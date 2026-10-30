/**
 * «Fai rientrare in magazzino» quello che il cantiere non ha posato. Propone
 * quanto avanza (comprati − posati − già rientrati) e il magazzino
 * predefinito; il database fa il resto (scheda di magazzino, movimento, costo).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useRientroMateriale } from "@/hooks/useConsumiMateriali";

export default function RientroMagazzinoDialog({ orderId, riga, onClose }: {
  orderId: string;
  riga: { id: string; nome: string; unita: string; avanzano: number; posati: number; quantita: number; rientrati: number; daGiacenza: boolean };
  onClose: () => void;
}) {
  const { warehouses } = useWarehouses();
  const magazzini = warehouses.filter((w) => !w.linked_order_id && w.type !== "site");
  const [quantita, setQuantita] = useState(String(Math.floor(riga.avanzano)));
  const [magazzino, setMagazzino] = useState<string | null>(null);
  const rientro = useRientroMateriale(orderId);
  const q = Number(quantita.replace(",", "."));
  // Non più di quanto avanza: rientrare merce già posata abbasserebbe il costo sotto il vero (il database lo rifiuta comunque).
  const valida = Number.isInteger(q) && q > 0 && q <= riga.avanzano;
  const scelto = magazzino ?? magazzini.find((w) => w.is_default)?.id ?? magazzini[0]?.id ?? null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rientro in magazzino: «{riga.nome}»</DialogTitle>
          <DialogDescription>
            Comprati {riga.quantita}, posati {riga.posati} (rapportini approvati): ne avanzano {riga.avanzano} {riga.unita}.
            Quelli che rientrano tornano disponibili in magazzino e la commessa paga solo i posati.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Quanti rientrano</span>
            <Input inputMode="numeric" value={quantita} onChange={(e) => setQuantita(e.target.value)} aria-label="Quanti rientrano" />
          </label>
          {riga.daGiacenza ? (
            <p className="self-end pb-2 text-sm text-muted-foreground">Torna nella sua scheda di magazzino, da dove è stata presa.</p>
          ) : (
          <label className="space-y-1 text-sm">
            <span className="font-medium">In quale magazzino</span>
            <Select value={scelto ?? undefined} onValueChange={setMagazzino}>
              <SelectTrigger aria-label="Magazzino"><SelectValue placeholder="Magazzino predefinito" /></SelectTrigger>
              <SelectContent>
                {magazzini.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          )}
        </div>
        {!valida && quantita.trim() !== "" && (
          <p className="text-xs text-red-700">
            {Number.isInteger(q) && q > riga.avanzano ? `Ne avanzano ${riga.avanzano}: il resto è già posato.` : "Il magazzino conta pezzi interi."}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button disabled={!valida || rientro.isPending}
            onClick={() => rientro.mutate({ riga: riga.id, quantita: q, magazzino: riga.daGiacenza ? null : scelto, giaRientrati: riga.rientrati }, { onSuccess: onClose })}>
            Fai rientrare {valida ? q : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
