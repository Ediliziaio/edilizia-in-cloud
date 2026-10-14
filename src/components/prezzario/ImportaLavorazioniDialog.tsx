import { useState } from "react";
import { Library, Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  SelettorePrezzario,
  type SelezionePrezzario,
} from "./SelettorePrezzario";
import { usePrezzarioCapitoli } from "@/lib/prezzario/queries";
import { erroreVoce } from "@/lib/prezzario/catalogo";
import {
  ImportazioneParziale,
  useAdottaPrezzarioListino,
  type ListinoRegionale,
} from "@/lib/prezzario/adozioneLavorazioni";
import { testoErrore } from "@/lib/impostazioni/testoErrore";

export interface ImportaLavorazioniProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capitoloId?: string | null;
  readOnly?: boolean;
}
export function ImportaLavorazioniDialog({
  open,
  onOpenChange,
  capitoloId,
  readOnly = false,
  listino,
}: ImportaLavorazioniProps & { listino: ListinoRegionale }) {
  const [fonteId, setFonteId] = useState<string | null>(null);
  const [selezione, setSelezione] = useState<SelezionePrezzario>({});
  const [ricarico, setRicarico] = useState("15");
  const capitoli = usePrezzarioCapitoli(fonteId);
  const adotta = useAdottaPrezzarioListino(listino);
  const ricaricoNum = ricarico.trim()
    ? Number(ricarico.replace(",", "."))
    : Number.NaN;
  const ricaricoValido = Number.isFinite(ricaricoNum) && ricaricoNum >= 0;
  const selezionate = Object.values(selezione);
  const chiudi = (next: boolean) => {
    if (adotta.isPending) return;
    if (!next) {
      setFonteId(null);
      setSelezione({});
      setRicarico("15");
    }
    onOpenChange(next);
  };
  const importa = async () => {
    if (
      readOnly ||
      adotta.isPending ||
      !fonteId ||
      !ricaricoValido ||
      selezionate.length === 0 ||
      selezionate.some(erroreVoce)
    )
      return;
    try {
      const esito = await adotta.mutateAsync({
        fonteId,
        voci: selezionate,
        ricaricoPct: ricaricoNum,
        capitoloId: capitoloId ?? undefined,
        capitoli: capitoli.data ?? [],
      });
      toast.success("Importazione completata", {
        description: `${esito.inserite} voci aggiunte.${esito.giaPresenti ? ` ${esito.giaPresenti} già presenti, lasciate invariate.` : ""}`,
      });
      chiudi(false);
    } catch (e) {
      if (e instanceof ImportazioneParziale && e.completate.length)
        setSelezione((prima) =>
          Object.fromEntries(
            Object.entries(prima).filter(([id]) => !e.completate.includes(id)),
          ),
        );
      toast.error(
        e instanceof ImportazioneParziale && e.completate.length
          ? "Importazione parziale"
          : "Importazione non riuscita",
        {
          description: `${e instanceof ImportazioneParziale && e.completate.length ? `${e.inserite} voci salvate. Riprendi dalle voci rimaste nella selezione. ` : ""}${testoErrore(e)}`,
        },
      );
    }
  };
  return (
    <Dialog open={open} onOpenChange={chiudi}>
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            Prezziari regionali
          </DialogTitle>
          <DialogDescription>
            Scegli le lavorazioni da aggiungere al listino.{" "}
            {capitoloId
              ? "Saranno inserite nel capitolo aziendale scelto."
              : "Saranno organizzate secondo le categorie del prezziario."}{" "}
            Codice, unità e fonte vengono conservati.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <SelettorePrezzario
            key={fonteId ?? "nessuna"}
            fonteId={fonteId}
            onFonte={(id) => {
              setFonteId(id);
              setSelezione({});
            }}
            capitoli={capitoli.data ?? []}
            erroreCapitoli={capitoli.isError}
            caricamentoCapitoli={capitoli.isLoading}
            onRiprovaCapitoli={() => void capitoli.refetch()}
            selezione={selezione}
            onSelezione={setSelezione}
            disabled={adotta.isPending || readOnly}
          />
        </div>
        <DialogFooter className="border-t bg-muted/20 px-5 py-4 sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Label htmlFor="ricarico-lavorazioni">Ricarico %</Label>
            <Input
              id="ricarico-lavorazioni"
              inputMode="decimal"
              value={ricarico}
              disabled={readOnly || adotta.isPending}
              onChange={(e) => setRicarico(e.target.value)}
              className="h-9 w-28"
              aria-invalid={!ricaricoValido}
            />
            {!ricaricoValido && (
              <p role="alert" className="text-xs text-destructive">
                Indica un ricarico valido, da 0 in su.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {selezionate.length}{" "}
              {selezionate.length === 1 ? "selezionata" : "selezionate"}
            </span>
            <Button
              variant="outline"
              disabled={adotta.isPending}
              onClick={() => chiudi(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={() => void importa()}
              disabled={
                readOnly ||
                adotta.isPending ||
                !fonteId ||
                capitoli.isLoading ||
                capitoli.isError ||
                !ricaricoValido ||
                selezionate.length === 0 ||
                selezionate.some(erroreVoce)
              }
            >
              {adotta.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PackagePlus className="mr-2 h-4 w-4" />
              )}
              Importa {selezionate.length || ""}{" "}
              {selezionate.length === 1 ? "voce" : "voci"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
