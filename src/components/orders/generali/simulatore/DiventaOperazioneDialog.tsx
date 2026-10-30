// src/components/orders/generali/simulatore/DiventaOperazioneDialog.tsx
// «Diventa operazione»: dall'ipotesi salvata nasce la commessa generale, con il piano
// economico già compilato (voci e mesi), le fonti e, se vuoi, le unità in serie.
// Se l'azienda non ha acceso il modello, la finestra lo dice e porta alle Impostazioni.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { euro } from "@/components/orders/generali/piano/formato";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { useDiventaOperazione, type IpotesiSalvata } from "@/hooks/useGeneraleSimulatore";
import { DEFINIZIONI_MODELLI, type ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { motivoSenzaUnita, operazioneDaIpotesi } from "@/lib/orders/generali/simulatoreOperazione";
import { unitaTotali } from "@/lib/orders/generali/simulatore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salvata: IpotesiSalvata;
  modelliAttivi: ModelloGenerale[];
}

export function DiventaOperazioneDialog({ open, onOpenChange, salvata, modelliAttivi }: Props) {
  const [nome, setNome] = useState(salvata.nome);
  const [conUnita, setConUnita] = useState(true);
  const crea = useDiventaOperazione();
  const navigate = useNavigate();
  const ip = salvata.ipotesi;
  const def = DEFINIZIONI_MODELLI[ip.modello];
  const acceso = modelliAttivi.includes(ip.modello);
  const motivo = motivoSenzaUnita(ip);
  const op = operazioneDaIpotesi(ip, { nome, conUnita });

  const conferma = () => {
    if (!nome.trim()) return;
    crea.mutate({ ipotesiId: salvata.id, operazione: op }, {
      onSuccess: (id) => {
        toast.success("Operazione creata", { description: "Il piano economico è in bozza: controllalo e approvalo." });
        onOpenChange(false);
        navigate(`/azienda/ordini/${id}`);
      },
      onError: (e) => toast.error(messaggioGenerale(e, "l'operazione")),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Diventa operazione</DialogTitle>
          <DialogDescription>Nasce una commessa generale «{def.nome}» con i numeri di questa ipotesi.</DialogDescription>
        </DialogHeader>

        {!acceso ? (
          <div className="space-y-3 text-sm">
            <p>Le commesse generali «{def.nome}» non sono accese per la tua azienda. Accendile e torna qui: l'ipotesi resta salvata.</p>
            <Button asChild><Link to="/azienda/impostazioni/commesse-generali">Vai a Impostazioni → Commesse generali</Link></Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="op-nome">Nome dell'operazione</Label>
              <Input id="op-nome" value={nome} maxLength={200} className="text-sm" placeholder={def.esempio} onChange={(e) => setNome(e.target.value)} />
            </div>
            <ul className="space-y-1 text-sm">
              <li>Ricavi previsti: <span className="font-medium">{euro(op.valore)}</span></li>
              <li>Piano economico in bozza con {op.voci.length} voci, coi loro mesi.</li>
              <li>{op.fonti.length ? `Fonti: ${op.fonti.map((f) => `${f.nome} ${euro(f.impegno)}`).join(", ")}.` : "Nessuna fonte: le aggiungi dopo."}</li>
            </ul>
            <div className="flex items-start gap-2">
              <Checkbox id="op-unita" checked={conUnita && !motivo} disabled={!!motivo} onCheckedChange={(v) => setConUnita(v === true)} />
              <div className="text-sm">
                <Label htmlFor="op-unita">Crea anche le {unitaTotali(ip)} unità in serie</Label>
                <p className="text-xs text-muted-foreground">
                  {motivo ?? `Una per unità (${op.unita.slice(0, 3).map((u) => u.sigla).join(", ")}${op.unita.length > 3 ? "…" : ""}), con m² e listino.`}
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          {acceso && <Button onClick={conferma} disabled={!nome.trim() || crea.isPending}>{crea.isPending ? "Creazione…" : "Crea l'operazione"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
