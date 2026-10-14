// src/components/settings/SalMaturaConfig.tsx
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AmbitoImpostazione,
  SezioneImpostazione,
} from "@/components/impostazioni/SezioneImpostazione";
import { useModelliPagamento } from "@/hooks/useModelliPagamento";
import { SAL_MATURA, type SalMatura } from "@/lib/orders/salMaturazione";
import { Button } from "@/components/ui/button";
import {useConfirm} from "@/components/ui/confirm-dialog";

/** «Quando matura la rata di un SAL»: la scelta dell'azienda, vale per tutte le sue commesse (anche quelle già aperte). */
export default function SalMaturaConfig({
  puoModificare,
  evidenziata = false,
}: {
  puoModificare: boolean;
  evidenziata?: boolean;
}) {
  const confirm=useConfirm();
  const { salMatura, impostazioni, disponibile, isLoading, refetch } =
    useModelliPagamento();
  const puoSalvare =
    puoModificare && disponibile && !isLoading && !impostazioni.isPending;
  return (
    <SezioneImpostazione
      id="sal"
      titolo="Quando matura la rata di un SAL"
      descrizione="Una rata «al SAL n.» diventa da incassare quando il verbale matura. La scelta vale per tutte le commesse dell'azienda, anche per quelle già aperte."
      ambito={<AmbitoImpostazione>Tutte le commesse</AmbitoImpostazione>}
      azione={
        disponibile && !isLoading ? (
          <span role="status">
            {impostazioni.isPending ? "Salvataggio…" : puoModificare ? "Salvataggio con conferma" : "Sola lettura"}
          </span>
        ) : undefined
      }
      evidenziata={evidenziata}
    >
      <div className="px-4 py-4">
        {isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Caricamento regola SAL…
          </p>
        ) : !disponibile ? (
          <div role="alert" className="space-y-2 text-sm">
            <p>
              La regola SAL non è disponibile. Rileggila prima di modificarla.
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Riprova regola SAL
            </Button>
          </div>
        ) : (
          <RadioGroup
            aria-label="Quando matura la rata di un SAL"
            value={salMatura}
            onValueChange={async (v) => {
              if (!puoSalvare || v===salMatura || !["emesso","approvato"].includes(v))return;
              const ok=await confirm({title:"Cambiare la regola SAL per tutta l'azienda?",description:"La nuova regola ricalcola la maturazione dei verbali e può cambiare le date delle rate, anche nelle commesse già aperte. Non modifica gli incassi registrati.",confirmLabel:"Applica regola aziendale"});
              if(ok && puoSalvare)impostazioni.mutate({ salMatura: v as SalMatura });
            }}
            disabled={!puoSalvare}
            className="gap-3"
          >
            {SAL_MATURA.map((s) => (
              <div
                key={s.valore}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <RadioGroupItem
                  value={s.valore}
                  id={`sal-matura-${s.valore}`}
                  className="mt-0.5 shrink-0"
                  disabled={!puoSalvare}
                />
                <Label
                  htmlFor={`sal-matura-${s.valore}`}
                  className="cursor-pointer space-y-0.5 font-normal"
                >
                  <span className="block text-sm font-medium">
                    {s.etichetta}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {s.spiegazione}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}
      </div>
    </SezioneImpostazione>
  );
}
