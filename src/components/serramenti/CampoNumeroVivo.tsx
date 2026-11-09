/**
 * Un numero di una riga del preventivo serramenti che si salva mentre lo si cambia.
 *
 * Quantità e misure scrivevano solo uscendo dal campo: con le frecce o scrivendo un numero, riepilogo della riga,
 * totale in alto e PDF restavano fermi e sembrava che il valore non cambiasse. Il valore valido parte poco dopo
 * l'ultimo tasto (uno solo anche scrivendo «12» o tenendo premuta la freccia) e subito uscendo dal campo o chiudendo
 * la riga. Mentre si scrive il campo può restare vuoto; uscendo, un valore non valido torna quello salvato.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

export const ATTESA_NUMERO_MS = 350;
/** Le misure si scrivono cifra per cifra: «19» di «1900» non deve diventare una misura vera. */
export const ATTESA_MISURA_MS = 900;

type Numero = number | null;

interface Props extends Omit<ComponentProps<typeof Input>, "value" | "defaultValue" | "onChange" | "onBlur" | "type"> {
  valore: Numero;
  /** Il numero scritto; `undefined` vuol dire non valido e non si salva. */
  daTesto: (testo: string) => Numero | undefined;
  onCambia: (valore: Numero) => void;
  attesaMs?: number;
}

const comeTesto = (valore: Numero) => (valore === null ? "" : String(valore));

export function CampoNumeroVivo({ valore, daTesto, onCambia, attesaMs = ATTESA_NUMERO_MS, ...resto }: Props) {
  const [testo, setTesto] = useState(comeTesto(valore));
  const inModifica = useRef(false);
  const attesa = useRef<ReturnType<typeof setTimeout> | null>(null);
  const daInviare = useRef<Numero | undefined>(undefined);
  // L'ultimo valore mandato e non ancora tornato nella riga: uscendo dal campo non si riscrive.
  const inviato = useRef<Numero | undefined>(undefined);
  const salvato = useRef(valore);
  const onCambiaRef = useRef(onCambia);
  useLayoutEffect(() => {
    salvato.current = valore;
    onCambiaRef.current = onCambia;
  });

  const fermaAttesa = () => {
    if (attesa.current) clearTimeout(attesa.current);
    attesa.current = null;
  };
  const invia = () => {
    fermaAttesa();
    const nuovo = daInviare.current;
    daInviare.current = undefined;
    if (nuovo === undefined || nuovo === (inviato.current !== undefined ? inviato.current : salvato.current)) return;
    inviato.current = nuovo;
    onCambiaRef.current(nuovo);
  };

  // La riga cambiata altrove (rilettura, Silvio, sopralluogo) si vede nel campo, ma mai mentre ci si scrive.
  useEffect(() => {
    inviato.current = undefined;
    if (!inModifica.current) setTesto(comeTesto(valore));
  }, [valore]);

  // Riga chiusa o passo cambiato prima che scada l'attesa: il valore scritto parte lo stesso.
  useEffect(() => () => invia(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Input
      {...resto}
      type="number"
      value={testo}
      onChange={(e) => {
        inModifica.current = true;
        setTesto(e.target.value);
        fermaAttesa();
        daInviare.current = daTesto(e.target.value);
        if (daInviare.current !== undefined) attesa.current = setTimeout(invia, attesaMs);
      }}
      onBlur={(e) => {
        inModifica.current = false;
        const nuovo = daTesto(e.target.value);
        daInviare.current = nuovo;
        setTesto(comeTesto(nuovo === undefined ? salvato.current : nuovo));
        invia();
      }}
    />
  );
}
