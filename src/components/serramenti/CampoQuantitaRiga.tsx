/**
 * Il campo Quantità di una riga del preventivo serramenti.
 *
 * Scriveva solo uscendo dal campo: con le frecce o scrivendo un numero, riepilogo della riga, totale in alto e PDF
 * restavano fermi e sembrava che la quantità non cambiasse. Il numero valido parte poco dopo l'ultimo tasto (uno solo
 * anche scrivendo «12» o tenendo premuta la freccia) e subito uscendo dal campo o chiudendo la riga. Mentre si scrive
 * il campo può restare vuoto; uscendo, un numero non valido torna quello salvato.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { quantitaDaTesto } from "@/lib/serramenti/righePreventivo";

export const ATTESA_QUANTITA_MS = 350;

interface Props {
  quantita: number;
  onCambia: (pezzi: number) => void;
}

export function CampoQuantitaRiga({ quantita, onCambia }: Props) {
  const [testo, setTesto] = useState(String(quantita));
  const inModifica = useRef(false);
  const attesa = useRef<ReturnType<typeof setTimeout> | null>(null);
  const daInviare = useRef<number | null>(null);
  // L'ultimo numero mandato e non ancora tornato nella riga: uscendo dal campo non si riscrive.
  const inviata = useRef<number | null>(null);
  const salvata = useRef(quantita);
  const onCambiaRef = useRef(onCambia);
  useLayoutEffect(() => {
    salvata.current = quantita;
    onCambiaRef.current = onCambia;
  });

  const fermaAttesa = () => {
    if (attesa.current) clearTimeout(attesa.current);
    attesa.current = null;
  };
  const invia = () => {
    fermaAttesa();
    const pezzi = daInviare.current;
    daInviare.current = null;
    if (pezzi === null || pezzi === (inviata.current ?? salvata.current)) return;
    inviata.current = pezzi;
    onCambiaRef.current(pezzi);
  };

  // La riga cambiata altrove (rilettura, Silvio, sopralluogo) si vede nel campo, ma mai mentre ci si scrive.
  useEffect(() => {
    inviata.current = null;
    if (!inModifica.current) setTesto(String(quantita));
  }, [quantita]);

  // Riga chiusa o passo cambiato prima che scada l'attesa: il numero scritto parte lo stesso.
  useEffect(() => () => invia(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Input
      type="number"
      min={1}
      step={1}
      aria-label="Quantità"
      value={testo}
      onChange={(e) => {
        inModifica.current = true;
        setTesto(e.target.value);
        fermaAttesa();
        const pezzi = quantitaDaTesto(e.target.value);
        daInviare.current = pezzi ?? null;
        if (pezzi !== undefined) attesa.current = setTimeout(invia, ATTESA_QUANTITA_MS);
      }}
      onBlur={(e) => {
        inModifica.current = false;
        const pezzi = quantitaDaTesto(e.target.value);
        daInviare.current = pezzi ?? null;
        setTesto(String(pezzi ?? salvata.current));
        invia();
      }}
      className="h-9 text-xs"
    />
  );
}
