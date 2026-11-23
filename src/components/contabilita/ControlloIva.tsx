/**
 * In testa alla vista IVA della Contabilità generale: che cosa impedisce a liquidazione e LIPE
 * di essere giuste, e dove si sistema (23/11/2026). Vedi `lib/contabilita/controlloIva.ts`.
 */
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mesiInLettere } from "@/lib/contabilita/controlloIva";
import type { StatoControlloIva } from "@/hooks/useControlloIva";

export function CosaMancaIva({ stato, anno, onImpostazioni, onRicezione }: {
  stato: StatoControlloIva | undefined;
  anno: number;
  onImpostazioni: () => void;
  onRicezione: () => void;
}) {
  if (!stato) return null;
  const emesse = stato.senzaImporti.filter((d) => d.lato === "emesse");
  const ricevute = stato.senzaImporti.filter((d) => d.lato === "ricevute");
  const voci = [
    !stato.impostazioniCompilate && {
      chiave: "impostazioni",
      testo: `Le Impostazioni IVA ${anno} non sono compilate: senza periodicità e regime la liquidazione periodica e la LIPE non si calcolano.`,
      azione: <Button size="sm" variant="outline" onClick={onImpostazioni}>Compila le impostazioni</Button>,
    },
    stato.acquistiSenzaRicezione > 0 && {
      chiave: "ricezione",
      testo: `${stato.acquistiSenzaRicezione} fatture ricevute non hanno la data di ricezione SDI (importate da un altro programma): la LIPE si ferma finché non la dichiari, dal registro acquisti.`,
      azione: <Button size="sm" variant="outline" onClick={onRicezione}>Apri il registro acquisti</Button>,
    },
    stato.senzaImporti.length > 0 && {
      chiave: "importi",
      testo: `${[emesse.length ? `${emesse.length} ${emesse.length === 1 ? "fattura emessa" : "fatture emesse"}` : "", ricevute.length ? `${ricevute.length} ${ricevute.length === 1 ? "ricevuta" : "ricevute"}` : ""].filter(Boolean).join(" e ")} ${stato.senzaImporti.length === 1 ? "ha" : "hanno"} solo il totale, senza imponibile né IVA (${mesiInLettere(stato.senzaImporti.map((d) => d.data))}). La loro IVA non è in contabilità né nella liquidazione: completale con l'XML, o registra a mano l'IVA di quei mesi se la liquidazione l'ha fatta un altro programma.`,
      azione: null,
    },
  ].filter(Boolean) as Array<{ chiave: string; testo: string; azione: ReactNode }>;
  if (voci.length === 0) return null;
  return (
    <section aria-label="Cosa manca per l'IVA" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
      <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" aria-hidden="true" />Prima che l'IVA del {anno} torni</p>
      <ul className="mt-2 space-y-2">
        {voci.map((v) => (
          <li key={v.chiave} className="flex flex-wrap items-center justify-between gap-2">
            <span className="max-w-3xl">{v.testo}</span>
            {v.azione}
          </li>
        ))}
      </ul>
    </section>
  );
}
