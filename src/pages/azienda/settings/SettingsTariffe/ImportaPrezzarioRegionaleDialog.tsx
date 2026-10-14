import { useMemo, useState } from "react";
import { Library, Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SelettorePrezzario,
  type SelezionePrezzario,
} from "@/components/prezzario/SelettorePrezzario";
import {
  usePrezzarioCapitoli,
  usePrezzarioFonti,
} from "@/lib/prezzario/queries";
import {
  conversioneUnitaTariffa,
  erroreVoceTariffa,
  prezziTariffaRegionale,
} from "@/lib/prezzario/catalogo";
import { payloadTariffaRegionale } from "@/lib/prezzario/adozioneTariffe";
import { oggettoCampi } from "@/lib/tariffe/costoLavorazione";
import { supabase } from "@/integrations/supabase/client";
import { testoErrore } from "@/lib/impostazioni/testoErrore";
import type { Tariffa } from "./types";

export interface ImportaPrezzarioRegionaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | undefined;
  isAdmin: boolean;
  onImported: () => void;
  existing?: Tariffa[];
}

export function ImportaPrezzarioRegionaleDialog({
  open,
  onOpenChange,
  companyId,
  isAdmin,
  onImported,
  existing = [],
}: ImportaPrezzarioRegionaleDialogProps) {
  const [fonteId, setFonteId] = useState<string | null>(null);
  const [selezione, setSelezione] = useState<SelezionePrezzario>({});
  const [ricarico, setRicarico] = useState("0");
  const [importing, setImporting] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [completate, setCompletate] = useState<string[]>([]);
  const capitoli = usePrezzarioCapitoli(fonteId);
  const fonti = usePrezzarioFonti();
  const fonte = fonti.data?.find((f) => f.id === fonteId);
  const ricaricoNum = ricarico.trim()
    ? Number(ricarico.replace(",", "."))
    : Number.NaN;
  const ricaricoValido = Number.isFinite(ricaricoNum) && ricaricoNum >= 0;
  const selezionate = Object.values(selezione);
  const giaImportate = useMemo(
    () =>
      new Set([
        ...completate,
        ...existing.flatMap((t) => {
          const p = oggettoCampi(
            oggettoCampi(t.custom_field_values)._prezzario,
          );
          return typeof p.voce_id === "string" ? [p.voce_id] : [];
        }),
      ]),
    [existing, completate],
  );
  const chiudi = (next: boolean) => {
    if (importing) return;
    if (!next) {
      setFonteId(null);
      setSelezione({});
      setRicarico("0");
    }
    onOpenChange(next);
  };

  const importa = async () => {
    if (
      importing ||
      !isAdmin ||
      !companyId ||
      !fonte ||
      !ricaricoValido ||
      !selezionate.length ||
      selezionate.some((v) => erroreVoceTariffa(v, ricaricoNum)) ||
      capitoli.isError
    )
      return;
    setImporting(true);
    setProgresso(0);
    const fatte: string[] = [];
    let aggiunte = 0;
    let giaPresenti = 0;
    try {
      const payloads = await Promise.all(
        selezionate.map((v) =>
          payloadTariffaRegionale(v, {
            companyId,
            fonte: fonte.nome,
            capitoli: capitoli.data ?? [],
            ricarico: ricaricoNum,
            costoVisibile: isAdmin,
          }),
        ),
      );
      for (let i = 0; i < payloads.length; i += 100) {
        const chunk = payloads.slice(i, i + 100);
        const { data, error } = await supabase
          .from("tariffe_aziendali")
          .upsert(chunk, { onConflict: "id", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        aggiunte += data?.length ?? 0;
        giaPresenti += chunk.length - (data?.length ?? 0);
        fatte.push(...selezionate.slice(i, i + 100).map((v) => v.id));
        setProgresso(fatte.length);
      }
      setCompletate((prima) => [...prima, ...fatte]);
      setSelezione({});
      onImported();
      toast.success("Importazione completata", {
        description: `${aggiunte} voci aggiunte con categoria e fonte.${giaPresenti ? ` ${giaPresenti} già presenti, lasciate invariate.` : ""}`,
      });
      onOpenChange(false);
    } catch (e) {
      if (fatte.length) {
        setCompletate((prima) => [...prima, ...fatte]);
        setSelezione((prima) =>
          Object.fromEntries(
            Object.entries(prima).filter(([id]) => !fatte.includes(id)),
          ),
        );
        onImported();
      }
      toast.error(
        fatte.length ? "Importazione parziale" : "Importazione non riuscita",
        {
          description: `${fatte.length ? `${aggiunte} voci salvate. La selezione contiene solo quelle ancora da importare. ` : ""}${testoErrore(e)}`,
        },
      );
    } finally {
      setImporting(false);
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
            Scegli le voci da aggiungere a Manodopera e servizi. Categoria e
            fonte vengono conservate; il ricarico si applica al prezzo del
            prezziario.
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
            disabled={importing}
            giaImportate={giaImportate}
            giaImportata={(v) =>
              !!v.codice &&
              existing.some(
                (t) => t.codice === v.codice && t.fonte === fonte?.nome,
              )
            }
            valida={(v) =>
              erroreVoceTariffa(v, ricaricoValido ? ricaricoNum : 0)
            }
            anteprima={(v) => {
              const c = conversioneUnitaTariffa(v.unita_misura);
              if (!c || !ricaricoValido || erroreVoceTariffa(v, ricaricoNum))
                return null;
              const pv = prezziTariffaRegionale(v, ricaricoNum)!.vendita;
              return `Nel listino: ${pv.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/${c.unita === "a_corpo" ? "a corpo" : c.unita}${c.fattore !== 1 ? " · prezzo convertito" : ""}`;
            }}
          />
        </div>
        <DialogFooter className="border-t bg-muted/20 px-5 py-4 sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Label htmlFor="prezzario-ricarico">
              Ricarico sul prezzo regionale %
            </Label>
            <Input
              id="prezzario-ricarico"
              inputMode="decimal"
              value={ricarico}
              disabled={importing}
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
            <span role="status" className="text-sm text-muted-foreground">
              {importing
                ? `${progresso} / ${selezionate.length} elaborate`
                : `${selezionate.length} ${selezionate.length === 1 ? "selezionata" : "selezionate"}`}
            </span>
            <Button
              variant="outline"
              disabled={importing}
              onClick={() => chiudi(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={() => void importa()}
              disabled={
                !isAdmin ||
                !companyId ||
                !fonte ||
                capitoli.isLoading ||
                capitoli.isError ||
                !ricaricoValido ||
                selezionate.length === 0 ||
                selezionate.some((v) => erroreVoceTariffa(v, ricaricoNum)) ||
                importing
              }
            >
              {importing ? (
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
export default ImportaPrezzarioRegionaleDialog;
