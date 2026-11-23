// src/components/orders/generali/investitori/MovimentoDialog.tsx
// Un versamento, un rimborso, un utile distribuito o degli interessi pagati, con la data.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { messaggioInvestitori, useAggiungiMovimento } from "@/hooks/useGeneraleInvestitori";
import { leggiImporto } from "@/lib/controlloGestione/formatCG";
import { NOMI_MOVIMENTO, aDebito, movimentiAmmessi, nomeVersamento, type Fonte, type TipoMovimento } from "@/lib/orders/generali/investitoriConti";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  generaleId: string;
  fonte: Fonte;
  oggi: string;
  /** Le unità della generale, per legare un accollo o un frazionamento a quella venduta. */
  unita?: { id: string; nome: string }[];
}

const NESSUNA = "nessuna";

export function MovimentoDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-sm">{props.open && <Modulo {...props} />}</DialogContent>
    </Dialog>
  );
}

function Modulo({ onOpenChange, generaleId, fonte, oggi, unita = [] }: Props) {
  const tr = useT();
  const aggiungi = useAggiungiMovimento(generaleId);
  const ammessi = movimentiAmmessi(fonte.tipo);
  const [tipo, setTipo] = useState<TipoMovimento>("versamento");
  const [data, setData] = useState(oggi);
  const [importo, setImporto] = useState("");
  const [nota, setNota] = useState("");
  const [unitaId, setUnitaId] = useState<string>(NESSUNA);
  const conUnita = aDebito(fonte.tipo) && (tipo === "accollo" || tipo === "rimborso") && unita.length > 0;
  const [tentato, setTentato] = useState(false);
  const valore = leggiImporto(importo);
  const errImporto = valore === null || valore <= 0 ? tr("Scrivi un importo maggiore di zero.") : null;
  const errData = !/^\d{4}-\d{2}-\d{2}$/.test(data) ? tr("Scegli la data.") : null;
  const nome = (t: TipoMovimento) => tr(t === "versamento" ? nomeVersamento(fonte.tipo) : NOMI_MOVIMENTO[t]);

  const salva = () => {
    setTentato(true);
    if (errImporto || errData || aggiungi.isPending) return;
    aggiungi.mutate(
      { fonteId: fonte.id, tipo, data, importo: valore!, nota: nota.trim() || null, unitaId: conUnita && unitaId !== NESSUNA ? unitaId : null },
      {
        onSuccess: () => { toast.success(tr("{cosa} registrato", { cosa: nome(tipo) })); onOpenChange(false); },
        onError: (e) => toast.error(messaggioInvestitori(e, "il movimento")),
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{tr("Nuovo movimento")}</DialogTitle>
        <DialogDescription>{fonte.nome}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); salva(); }}>
        <div className="space-y-1.5">
          <Label htmlFor="mov-tipo">{tr("Cosa")}</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMovimento)}>
            <SelectTrigger id="mov-tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ammessi.map((t) => <SelectItem key={t} value={t}>{nome(t)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="mov-data">{tr("Data")}</Label>
            <Input id="mov-data" type="date" value={data} onChange={(e) => setData(e.target.value)} aria-invalid={(tentato && !!errData) || undefined} />
            {data > oggi && <p className="text-xs text-amber-700">{tr("Data futura: resta previsto fino alla conferma del movimento effettivo.")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mov-importo">{tr("Importo (€)")}</Label>
            <Input id="mov-importo" inputMode="decimal" autoFocus value={importo} onChange={(e) => setImporto(e.target.value)} aria-invalid={(tentato && !!errImporto) || undefined} />
          </div>
        </div>
        {tentato && (errData || errImporto) && <p className="text-xs text-destructive">{errData ?? errImporto}</p>}
        {tipo === "accollo" && (
          <p className="text-xs text-muted-foreground">{tr("La quota di mutuo passa all'acquirente: il debito scende senza che esca cassa.")}</p>
        )}
        {conUnita && (
          <div className="space-y-1.5">
            <Label htmlFor="mov-unita">{tr("Unità venduta")} <span className="font-normal text-muted-foreground">{tr("(facoltativa)")}</span></Label>
            <Select value={unitaId} onValueChange={setUnitaId}>
              <SelectTrigger id="mov-unita"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUNA}>{tr("Nessuna")}</SelectItem>
                {unita.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="mov-nota">{tr("Nota")} <span className="font-normal text-muted-foreground">{tr("(facoltativa)")}</span></Label>
          <Input id="mov-nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder={tr("Es. bonifico del 12/03")} />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tr("Annulla")}</Button>
          <Button type="submit" disabled={aggiungi.isPending}>
            {aggiungi.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tr("Registra")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
