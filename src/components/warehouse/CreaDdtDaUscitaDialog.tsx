/**
 * Il DDT di un'uscita di magazzino, con i dati di trasporto scelti prima di
 * crearlo. Prima «Crea DDT» partiva senza chiedere niente: causale sempre
 * «Vendita» (anche per il materiale portato su un proprio cantiere), porto
 * franco, colli e aspetto vuoti da sistemare poi nell'editor.
 *
 * La causale proposta segue il destinatario (`causalePerDestinatario`), come
 * fa il database quando non gliene arriva una.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileText, Loader2, Truck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useShipmentDDTPDF } from "@/hooks/useShipmentDDTPDF";
import { useCreateDdtFromUscita } from "@/hooks/warehouse/useWarehouseUscita";
import { CAUSALI_TRASPORTO, causalePerDestinatario } from "@/lib/ddt/causaliTrasporto";
import { datiTrasportoDdt, type UscitaPerDdt } from "@/lib/magazzino/usciteDdt";

export function CreaDdtDaUscitaDialog({
  uscita,
  onOpenChange,
  onCreato,
  appenaRegistrata = false,
}: {
  uscita: UscitaPerDdt | null;
  onOpenChange: (open: boolean) => void;
  onCreato?: () => void;
  /** Aperta subito dopo aver registrato l'uscita: rinunciare vuol dire «più tardi». */
  appenaRegistrata?: boolean;
}) {
  return (
    <Dialog open={!!uscita} onOpenChange={onOpenChange}>
      {/* Il modulo si rimonta a ogni uscita: i campi ripartono dai suoi valori. */}
      {uscita && (
        <Modulo
          key={uscita.id}
          uscita={uscita}
          onOpenChange={onOpenChange}
          onCreato={onCreato}
          appenaRegistrata={appenaRegistrata}
        />
      )}
    </Dialog>
  );
}

function Modulo({
  uscita,
  onOpenChange,
  onCreato,
  appenaRegistrata,
}: {
  uscita: UscitaPerDdt;
  onOpenChange: (open: boolean) => void;
  onCreato?: () => void;
  appenaRegistrata: boolean;
}) {
  const navigate = useNavigate();
  const { isNative } = useBillingMode();
  const { generate: generaPdf } = useShipmentDDTPDF();
  const crea = useCreateDdtFromUscita();
  const [causale, setCausale] = useState<string>(causalePerDestinatario(uscita.destinatario_tipo));
  const [porto, setPorto] = useState("Franco");
  const [colli, setColli] = useState(uscita.righe > 0 ? String(uscita.righe) : "");
  const [aspetto, setAspetto] = useState("");
  const [peso, setPeso] = useState("");

  const conferma = async () => {
    try {
      const res = await crea.mutateAsync({
        uscitaId: uscita.id,
        ddtExtra: datiTrasportoDdt({ causale, porto, colli, aspetto, peso }),
      });
      toast.success(`DDT ${res.numero_ddt} creato dall'uscita ${uscita.numero}`);
      onCreato?.();
      onOpenChange(false);
      if (res.documento_id) {
        if (isNative) navigate(`/azienda/documenti/${res.documento_id}`);
        else void generaPdf(res.documento_id);
      }
    } catch (e) {
      toast.error("DDT non creato", { description: (e as Error).message });
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" /> DDT dell'uscita {uscita.numero}
        </DialogTitle>
        <DialogDescription>
          {appenaRegistrata && <>Uscita registrata, la giacenza è già scalata. </>}
          Per {uscita.destinatario}. Il DDT nasce in bozza: lo controlli nell'editor prima di emetterlo.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="ddt-causale" className="text-xs">Causale del trasporto</Label>
          <Select value={causale} onValueChange={setCausale}>
            <SelectTrigger id="ddt-causale" className="h-9" aria-label="Causale del trasporto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAUSALI_TRASPORTO.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ddt-porto" className="text-xs">Porto <span className="font-normal text-muted-foreground">· chi paga il trasporto</span></Label>
          <Select value={porto} onValueChange={setPorto}>
            <SelectTrigger id="ddt-porto" className="h-9" aria-label="Porto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Franco">Franco</SelectItem>
              <SelectItem value="Assegnato">Assegnato</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ddt-colli" className="text-xs">Colli</Label>
          <Input id="ddt-colli" type="number" min={0} inputMode="numeric" className="h-9" value={colli} onChange={(e) => setColli(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ddt-aspetto" className="text-xs">Aspetto dei beni</Label>
          <Input id="ddt-aspetto" className="h-9" placeholder="Bancale, cartoni…" value={aspetto} onChange={(e) => setAspetto(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ddt-peso" className="text-xs">Peso (kg)</Label>
          <Input id="ddt-peso" inputMode="decimal" className="h-9" placeholder="Facoltativo" value={peso} onChange={(e) => setPeso(e.target.value)} />
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={crea.isPending}>
          {appenaRegistrata ? "Più tardi" : "Annulla"}
        </Button>
        <Button onClick={conferma} disabled={crea.isPending}>
          {crea.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
          Crea il DDT
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
