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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
  const riprogramma = azione === "riprogramma";
  const [data, setData] = useState(riprogramma && movimento.data > oggi ? movimento.data : oggi);
  const aggiorna = useAggiornaMovimentoPrevisto(generaleId);
  const descrizioneData = useId();
  const etichettaData = riprogramma ? t("Nuova data prevista") : t("Data effettiva del movimento");
  const puoSalvare = !!data && !aggiorna.isPending && (riprogramma ? data >= oggi && data !== movimento.data : data <= oggi);
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !aggiorna.isPending) onClose(); }}>
      <DialogContent ampiezza="conferma" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{riprogramma ? t("Riprogramma movimento") : t("Conferma movimento effettuato")}</DialogTitle>
          <DialogDescription>{t("{fonte} · {importo} · Previsto il {data}", { fonte, importo: euro(movimento.importo), data: formatDateIt(`${movimento.data}T12:00:00`, "long") })}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={e => {
          e.preventDefault();
          if (!puoSalvare) return;
          aggiorna.mutate({ movimento, data, azione }, {
            onSuccess: () => {
              toast.success(riprogramma ? t("Nuova data prevista salvata") : t("Movimento confermato"));
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
            ? t("Il movimento resta previsto fino alla conferma.")
            : t("Indica quando è avvenuto il versamento o il pagamento.")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={aggiorna.isPending} onClick={onClose}>{t("Annulla")}</Button>
            <Button type="submit" disabled={!puoSalvare}>
              {riprogramma ? t("Salva nuova data") : t("Conferma effettuato")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
