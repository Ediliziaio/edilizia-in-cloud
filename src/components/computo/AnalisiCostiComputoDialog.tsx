import type { ComponentProps } from "react";
import AnalisiCostiDialog from "@/components/quotes/AnalisiCostiDialog";
import { risorseDaTariffaAnalisi, useAnalisiCostiPreventivo } from "@/hooks/useAnalisiCostiPreventivo";
import { leggiBozzaComputo } from "@/lib/computo/editorNativo";
import { economiaAnalisiComputo } from "@/lib/preventivi/analisiCostiEditor";

type Props = Omit<ComponentProps<typeof AnalisiCostiDialog>,
  "analisi" | "attesa" | "errore" | "revisioni" | "erroreRevisioni" | "onSave" | "onListino"
> & { companyId: string; draftId: string; modifica: boolean };

export default function AnalisiCostiComputoDialog({ companyId, draftId, modifica, ...props }: Props) {
  const analisi = useAnalisiCostiPreventivo({ companyId, tipo: "computo", id: draftId }, true);
  const revisioni = analisi.revisioni.flatMap(revisione => {
    if (!revisione.fotografia) return [];
    try {
      const bozza = leggiBozzaComputo(JSON.stringify(revisione.fotografia));
      return [{ ...revisione, ...economiaAnalisiComputo(bozza) }];
    } catch {
      return [];
    }
  });

  return <AnalisiCostiDialog {...props} analisi={analisi.analisi} attesa={analisi.attesa} errore={analisi.errore}
    revisioni={revisioni} erroreRevisioni={analisi.erroreRevisioni} onSave={modifica ? analisi.salva : undefined}
    onListino={voce => voce.codice?.trim()
      ? risorseDaTariffaAnalisi(companyId, { codice: voce.codice.trim(), unita: voce.unita })
      : Promise.reject(new Error("Inserisci il codice della tariffa nella lavorazione."))} />;
}
