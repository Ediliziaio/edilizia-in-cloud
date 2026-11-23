import { useId, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDateIt } from "@/lib/formatters";
import type { Movimento } from "@/lib/orders/generali/investitoriConti";
import { messaggioInvestitori, useAggiornaMovimentoPrevisto, type AzioneMovimentoPrevisto } from "@/hooks/useGeneraleInvestitori";
import { euro } from "../piano/formato";

export function MovimentoPrevistoDialog({
  generaleId,
  movimento,
  fonte,
  oggi,
  azione,
  onClose,
}: {
  generaleId: string;
  movimento: Movimento;
  fonte: string;
  oggi: string;
  azione: AzioneMovimentoPrevisto;
  onClose: () => void;
}) {
  const riprogramma = azione === "riprogramma";
  const [data, setData] = useState(riprogramma && movimento.data > oggi ? movimento.data : oggi);
  const aggiorna = useAggiornaMovimentoPrevisto(generaleId);
  const descrizioneData = useId();
  const etichettaData = riprogramma ? "Nuova data prevista" : "Data effettiva del movimento";
  const puoSalvare = !!data && !aggiorna.isPending && (riprogramma ? data >= oggi && data !== movimento.data : data <= oggi);
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !aggiorna.isPending) onClose(); }}>
      <DialogContent ampiezza="conferma" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{riprogramma ? "Riprogramma movimento" : "Conferma movimento effettuato"}</DialogTitle>
          <DialogDescription>
            {fonte} · {euro(movimento.importo)} · Previsto il {formatDateIt(`${movimento.data}T12:00:00`, "long")}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={e => {
          e.preventDefault();
          if (!puoSalvare) return;
          aggiorna.mutate({ movimento, data, azione }, {
            onSuccess: () => {
              toast.success(riprogramma ? "Nuova data prevista salvata" : "Movimento confermato");
              onClose();
            },
            onError: e => toast.error(messaggioInvestitori(e, "il movimento")),
          });
        }}>
          <label className="block space-y-1 text-sm">
            <span>{etichettaData}</span>
            <Input type="date" lang="it" value={data} min={riprogramma ? oggi : undefined} max={riprogramma ? undefined : oggi}
              aria-describedby={data ? descrizioneData : undefined}
              required onChange={(e) => setData(e.target.value)} />
          </label>
          {data && <p id={descrizioneData} className="text-xs font-medium">{formatDateIt(`${data}T12:00:00`, "long")}</p>}
          <p className="text-xs text-muted-foreground">{riprogramma
            ? "Il movimento resta previsto fino alla conferma."
            : "Indica quando è avvenuto il versamento o il pagamento."}</p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={aggiorna.isPending} onClick={onClose}>Annulla</Button>
            <Button type="submit" disabled={!puoSalvare}>
              {riprogramma ? "Salva nuova data" : "Conferma effettuato"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
