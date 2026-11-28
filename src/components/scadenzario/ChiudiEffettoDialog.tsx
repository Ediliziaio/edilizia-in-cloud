import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { formatCurrency } from "@/lib/formatters";
import { usePermissions } from "@/hooks/usePermissions";
import { useChiudiEffetto, type Effetto, type EsitoEffetto } from "@/hooks/useEffetti";

const oggiIso = () => new Date().toLocaleDateString("en-CA");
const fmtData = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
// Il database risponde con FONTE_GIA_PAGATA quando la scadenza e' stata saldata nel frattempo
// (le funzioni di pagamento direbbero solo «Importo non valido. Residuo: 0»).
const giaPagata = (m: string) => /FONTE_GIA_PAGATA|gi[aà] pagat|importo non valido|already paid/i.test(m);

interface Props {
  effetto: Effetto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChiudiEffettoDialog({ effetto, open, onOpenChange }: Props) {
  const t = useT();
  const permissions = usePermissions();
  const chiudi = useChiudiEffetto();
  const oggi = oggiIso();
  // Il dialogo resta montato: cambiando effetto si riparte da zero. Lo stato porta con se'
  // l'effetto a cui appartiene (niente useEffect che azzera: la regola set-state-in-effect
  // lo vieta, ed e' anche un giro di disegno in piu').
  const effettoId = effetto?.id ?? "";
  const [scelte, setScelte] = useState<{ id: string; data: string | null; giaPagata: boolean }>({ id: effettoId, data: null, giaPagata: false });
  const mie = scelte.id === effettoId ? scelte : { id: effettoId, data: null, giaPagata: false };
  const dataScelta = mie.data;
  const fonteGiaPagata = mie.giaPagata;
  const setData = (v: string | null) => setScelte({ ...mie, id: effettoId, data: v });
  const setFonteGiaPagata = (v: boolean) => setScelte({ ...mie, id: effettoId, giaPagata: v });
  if (!effetto) return null;

  // Di default la data dell'assegno, ma mai nel futuro.
  const data = dataScelta ?? (effetto.data_scadenza > oggi ? oggi : effetto.data_scadenza);
  const ricevuto = effetto.direzione === "ricevuto";
  const puoAgire = !permissions.solaLettura && (permissions.canManagePayments || permissions.isAdmin);
  const etichetta = effetto.tipo === "assegno" ? t("Assegno") : effetto.tipo === "rid" ? "RID / SDD" : "Ri.Ba.";

  const soloDaFattura = !!effetto.rata_fornitore_id;

  const esegui = (esito: EsitoEffetto) => {
    chiudi.mutate({ effettoId: effetto.id, esito, data }, {
      onSuccess: (r) => {
        toast.success(r.gia_chiuso ? t("Già chiuso: nessuna modifica") : esito === "pagato" ? (ricevuto ? t("Incasso registrato") : t("Pagamento registrato")) : esito === "insoluto" ? t("Segnato come insoluto") : t("Annullato"));
        setFonteGiaPagata(false);
        onOpenChange(false);
      },
      onError: (e: Error) => {
        if (esito === "pagato" && giaPagata(e.message)) setFonteGiaPagata(true);
        else toast.error(e.message);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!chiudi.isPending) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("Chiudi {tipo}", { tipo: etichetta.toLowerCase() })}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium">{effetto.descrizione_fonte ?? effetto.controparte ?? etichetta}</p>
            <p className="text-muted-foreground">
              {formatCurrency(Number(effetto.importo))} · {t("scade il {data}", { data: fmtData(effetto.data_scadenza) })}
              {effetto.numero ? ` · n. ${effetto.numero}` : ""}{effetto.banca ? ` · ${effetto.banca}` : ""}
            </p>
          </div>
          {soloDaFattura && (
            <p role="note" className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
              {t("Questa rata si paga dalla fattura fornitore: qui puoi solo segnare l'assegno come insoluto o annullarlo.")}
            </p>
          )}
          {fonteGiaPagata && (
            <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              {t("La scadenza risulta già pagata: non si può registrare un secondo pagamento. Annulla l'assegno.")}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="effetto-data">{ricevuto ? t("Data effettiva dell'incasso") : t("Data effettiva del pagamento")}</Label>
            <Input id="effetto-data" type="date" max={oggi} value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" disabled={chiudi.isPending || !puoAgire} onClick={() => esegui("annullato")}>{t("Annulla assegno")}</Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={chiudi.isPending || !puoAgire} onClick={() => esegui("insoluto")}>{t("Insoluto")}</Button>
            {!fonteGiaPagata && !soloDaFattura && (
              <Button disabled={chiudi.isPending || !puoAgire || !data || data > oggi} onClick={() => esegui("pagato")}>
                {chiudi.isPending ? t("Salvataggio...") : ricevuto ? t("Incassato") : t("Pagato")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
