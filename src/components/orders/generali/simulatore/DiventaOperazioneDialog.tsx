// src/components/orders/generali/simulatore/DiventaOperazioneDialog.tsx
// «Diventa operazione»: dall'ipotesi salvata nasce la commessa generale, con il piano
// economico già compilato (voci e mesi), le fonti e, se vuoi, le unità in serie.
// Se l'azienda non ha acceso il modello, la finestra lo dice e porta alle Impostazioni.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { euro } from "@/components/orders/generali/piano/formato";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { useDiventaOperazione, type IpotesiSalvata } from "@/hooks/useGeneraleSimulatore";
import { DEFINIZIONI_MODELLI, type ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { motivoSenzaUnita, operazioneDaIpotesi } from "@/lib/orders/generali/simulatoreOperazione";
import { unitaTotali } from "@/lib/orders/generali/simulatore";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salvata: IpotesiSalvata;
  modelliAttivi: ModelloGenerale[];
}

export function DiventaOperazioneDialog({ open, onOpenChange, salvata, modelliAttivi }: Props) {
  const t = useT();
  const [nome, setNome] = useState(salvata.nome);
  const [conUnita, setConUnita] = useState(true);
  const crea = useDiventaOperazione();
  const navigate = useNavigate();
  const ip = salvata.ipotesi;
  const def = DEFINIZIONI_MODELLI[ip.modello];
  const acceso = modelliAttivi.includes(ip.modello);
  const motivo = motivoSenzaUnita(ip);
  const op = operazioneDaIpotesi(ip, { nome, conUnita });
  const verificaAperta = (ip.importazione && !ip.importazione.confermata) || (ip.planimetria && !ip.planimetria.confermata);

  const conferma = () => {
    if (!nome.trim() || verificaAperta) return;
    crea.mutate({ ipotesiId: salvata.id, operazione: op, origine: ip.importazione?.originale, planimetria:ip.planimetria }, {
      onSuccess: ({id,avviso}) => {
        toast.success(t("Operazione creata"), { description: t("Il piano economico è in bozza.") });
        if (avviso) toast.warning(avviso);
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
          <DialogTitle>{t("Diventa operazione")}</DialogTitle>
          <DialogDescription>{t("Nasce una commessa generale «{modello}» con i numeri di questa ipotesi.", { modello: t(def.nome) })}</DialogDescription>
        </DialogHeader>

        {!acceso ? (
          <div className="space-y-3 text-sm">
            <p>{t("Le commesse generali «{modello}» non sono accese per la tua azienda. Accendile e torna qui: l'ipotesi resta salvata.", { modello: t(def.nome) })}</p>
            <Button asChild><Link to="/azienda/impostazioni/commesse-generali">{t("Vai a Impostazioni → Commesse generali")}</Link></Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="op-nome">{t("Nome dell'operazione")}</Label>
              <Input id="op-nome" value={nome} maxLength={200} className="text-sm" placeholder={t(def.esempio)} onChange={(e) => setNome(e.target.value)} />
            </div>
            <ul className="space-y-1 text-sm">
              <li>{t("Ricavi previsti:")} <span className="font-medium">{euro(op.valore)}</span></li>
              <li>{t("Piano economico in bozza con {n} voci, coi loro mesi.", { n: op.voci.length })}</li>
              {ip.planimetria && <li>{t("Planimetria e fascicolo alla versione {versione}.", { versione: ip.planimetria.versione })}</li>}
              <li>{op.fonti.length ? t("Fonti: {elenco}.", { elenco: op.fonti.map((f) => `${f.nome} ${euro(f.impegno)}`).join(", ") }) : t("Nessuna fonte: le aggiungi dopo.")}</li>
            </ul>
            <div className="flex items-start gap-2">
              <Checkbox id="op-unita" checked={conUnita && !motivo} disabled={!!motivo} onCheckedChange={(v) => setConUnita(v === true)} />
              <div className="text-sm">
                <Label htmlFor="op-unita">{t("Crea anche le {n} unità in serie", { n: unitaTotali(ip) })}</Label>
                <p className="text-xs text-muted-foreground">
                  {motivo ?? t("Una per unità ({esempi}), con m² e listino.", { esempi: `${op.unita.slice(0, 3).map((u) => u.sigla).join(", ")}${op.unita.length > 3 ? "…" : ""}` })}
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Annulla")}</Button>
          {acceso && <Button onClick={conferma} disabled={!nome.trim() || crea.isPending || verificaAperta}>{crea.isPending ? t("Creazione…") : t("Crea l'operazione")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
