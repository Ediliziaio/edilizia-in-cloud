import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { dayKey } from "@/lib/finance/forecastLedger";
import type { Movimento } from "@/lib/orders/generali/investitoriConti";
import { useConfermaMovimento, messaggioInvestitori } from "@/hooks/useGeneraleInvestitori";
export function ConfermaMovimentoDialog({
  generaleId,
  movimento,
  onClose,
}: {
  generaleId: string;
  movimento: Movimento;
  onClose: () => void;
}) {
  const oggi = dayKey(new Date());
  const [data, setData] = useState(oggi);
  const conferma = useConfermaMovimento(generaleId);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !conferma.isPending) onClose();
      }}
    >
      <DialogContent ampiezza="conferma" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Conferma movimento effettuato</DialogTitle>
          <DialogDescription>
            Registra la data in cui il versamento o il pagamento è realmente avvenuto. Questa azione aggiorna
            il rendiconto; non esegue un bonifico.
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-1 text-sm">
          Data effettiva
          <Input
            aria-label="Data effettiva del movimento"
            type="date"
            value={data}
            max={oggi}
            onChange={(e) => setData(e.target.value)}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" disabled={conferma.isPending} onClick={onClose}>
            Annulla
          </Button>
          <Button
            disabled={!data || data > oggi || conferma.isPending}
            onClick={() =>
              conferma.mutate(
                { movimento, data },
                { onSuccess: onClose, onError: (e) => toast.error(messaggioInvestitori(e, "il movimento")) },
              )
            }
          >
            Conferma effettuato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
