/**
 * «+ Area»: le aree standard che l'azienda non ha ancora (Serramenti,
 * Fotovoltaico, Bagni), ciascuna con le sue tipologie già pronte.
 *
 * Un'area non è una tabella: nasce con la prima tipologia etichettata per il
 * suo preventivatore (areeStandard.ts). Qui si sceglie l'area e quali delle
 * sue tipologie standard creare; le altre restano fra le standard da
 * aggiungere, nella colonna delle tipologie.
 */
import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AppWindow, Bath, Check, Layers3, Loader2, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AreaStandard, TipologiaStandard } from "@/lib/listino/areeStandard";
import type { AreaListino } from "@/lib/listino/lineeListino";
import { areeDaAggiungere, nomeTipologiaLibero } from "@/lib/listino/organizzaListino";

const ICONE: Record<string, LucideIcon> = { serramenti: AppWindow, fotovoltaico: Sun, bagni: Bath };

interface Props {
  aree: AreaListino[];
  /** Tutte le tipologie dell'azienda: i nomi sono unici. */
  macrocategorie: ReadonlyArray<{ nome: string }>;
  inCorso: boolean;
  onChiudi: () => void;
  onCrea: (area: AreaStandard, tipologie: TipologiaStandard[]) => void;
}

export function NuovaAreaDialog({ aree, macrocategorie, inCorso, onChiudi, onCrea }: Props) {
  const disponibili = useMemo(() => areeDaAggiungere(aree), [aree]);
  const [scelta, setScelta] = useState<AreaStandard | null>(disponibili[0] ?? null);
  const [escluse, setEscluse] = useState<Set<string>>(() => new Set());
  const daCreare = scelta ? scelta.tipologie.filter((t) => !escluse.has(t.nome)) : [];

  const scegli = (area: AreaStandard) => {
    setScelta(area);
    setEscluse(new Set());
  };

  const alterna = (nome: string, dentro: boolean) =>
    setEscluse((prima) => {
      const dopo = new Set(prima);
      if (dentro) dopo.delete(nome);
      else dopo.add(nome);
      return dopo;
    });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !inCorso) onChiudi();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aggiungi un&apos;area</DialogTitle>
          <DialogDescription>
            L&apos;area raccoglie le tipologie di un settore e decide in quale preventivatore arrivano i loro prodotti.
          </DialogDescription>
        </DialogHeader>

        {disponibili.length === 0 ? (
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Hai già tutte le aree standard. Per un settore diverso crea una tipologia da «Tipologie» e scegli il suo
            verticale.
          </p>
        ) : (
          <div className="space-y-4">
            <div role="radiogroup" aria-label="Area da aggiungere" className="grid gap-2 sm:grid-cols-2">
              {disponibili.map((a) => {
                const Icona = ICONE[a.chiave] ?? Layers3;
                const attiva = a.chiave === scelta?.chiave;
                return (
                  <button
                    key={a.chiave}
                    type="button"
                    role="radio"
                    aria-checked={attiva}
                    onClick={() => scegli(a)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      attiva ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        attiva ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      <Icona className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">Area {a.nome}</span>
                      <span className="block text-xs text-muted-foreground">
                        {a.preventivatore
                          ? `Collegata al ${a.preventivatore.toLowerCase()}`
                          : "Senza un preventivatore dedicato"}
                      </span>
                    </span>
                    {attiva && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            {scelta && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Tipologie da creare subito</legend>
                <p className="text-xs text-muted-foreground">
                  Quelle che togli restano fra le standard da aggiungere, nella colonna delle tipologie.
                </p>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {scelta.tipologie.map((t) => {
                    const id = `nuova-area-${scelta.chiave}-${t.nome}`;
                    const nomeFinale = nomeTipologiaLibero(t.nome, macrocategorie, scelta.nome);
                    return (
                      <li key={t.nome} className="flex items-start gap-2">
                        <Checkbox
                          id={id}
                          className="mt-0.5"
                          checked={!escluse.has(t.nome)}
                          onCheckedChange={(v) => alterna(t.nome, v === true)}
                        />
                        <label htmlFor={id} className="text-sm leading-snug">
                          {nomeFinale}
                          {t.accessorio && <span className="ml-1.5 text-xs text-muted-foreground">accessorio</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <Button variant="ghost" onClick={onChiudi} disabled={inCorso} className="h-10 w-full sm:w-auto">
            {disponibili.length === 0 ? "Chiudi" : "Annulla"}
          </Button>
          {scelta && (
            <Button
              onClick={() => onCrea(scelta, daCreare)}
              disabled={inCorso || daCreare.length === 0}
              className="h-10 w-full sm:w-auto"
            >
              {inCorso ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Creazione…
                </>
              ) : (
                `Aggiungi l'area ${scelta.nome}`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
