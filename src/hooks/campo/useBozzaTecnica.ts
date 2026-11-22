import { useEffect, useRef, useState } from "react";
import { idBozzaTecnica, type BozzaTecnica, type DatiBozzaTecnica } from "@/lib/campo/bozzaTecnica";
import { syncQueue } from "@/lib/campo/sync-queue";

const messaggio = (errore: unknown) => errore instanceof Error && errore.message.startsWith("Questa bozza")
  ? errore.message : "Il telefono non è riuscito a salvare la bozza. Riprova.";

export function useBozzaTecnica<T extends DatiBozzaTecnica>(iniziale: T) {
  const id = idBozzaTecnica(iniziale);
  const inizialeRef = useRef(iniziale);
  const persistita = useRef<BozzaTecnica<T> | undefined>(undefined);
  const corrente = useRef<T | undefined>(undefined);
  const scrittura = useRef(Promise.resolve());
  const [dati, setDati] = useState<T>();
  const [errore, setErrore] = useState("");
  const [stato, setStato] = useState<"iniziale" | "salvataggio" | "salvata">("iniziale");
  const [tentativo, setTentativo] = useState(0);

  useEffect(() => {
    let attivo = true;
    const modello = inizialeRef.current;
    void syncQueue.getBozzaTecnica(modello).then(bozza => {
      if (!attivo) return;
      persistita.current = bozza;
      corrente.current = bozza?.payload ?? modello;
      setDati(corrente.current);
      setErrore("");
      setStato(bozza ? "salvata" : "iniziale");
    }, error => { if (attivo) setErrore(messaggio(error)); });
    return () => { attivo = false; };
  }, [id, tentativo]);

  function salva(prossimo: T) {
    setStato("salvataggio");
    setErrore("");
    const lavoro = scrittura.current.then(async () => {
      if (corrente.current !== prossimo) return;
      persistita.current = await syncQueue.salvaBozzaTecnica(prossimo, persistita.current);
    });
    // Un fallimento non blocca la scrittura successiva. La bozza visibile rimane disponibile.
    scrittura.current = lavoro.catch((): void => undefined);
    void lavoro.then(() => {
      if (corrente.current === prossimo) setStato("salvata");
    }, error => {
      if (corrente.current === prossimo) {
        setStato("iniziale");
        setErrore(messaggio(error));
      }
    });
    return lavoro;
  }

  function modifica(patch: Partial<T>) {
    if (!corrente.current) return;
    const prossimo: T = { ...corrente.current, ...patch };
    corrente.current = prossimo;
    setDati(prossimo);
    void salva(prossimo).catch((): void => undefined);
  }

  async function sincronizza() {
    await scrittura.current;
    if (!corrente.current || persistita.current?.payload === corrente.current) return persistita.current;
    if (corrente.current === inizialeRef.current && !persistita.current) return undefined;
    await salva(corrente.current);
    return persistita.current;
  }

  async function accoda() {
    try {
      const bozza = await sincronizza();
      if (!bozza) return undefined;
      await syncQueue.accodaBozzaTecnica(bozza);
      return bozza.operationId;
    } catch (error) {
      setErrore(messaggio(error));
      return undefined;
    }
  }

  async function chiudi(onClose: () => void) {
    try {
      await sincronizza();
      onClose();
    } catch (error) {
      setErrore(messaggio(error));
    }
  }

  return {
    dati, errore, stato, modifica, accoda, chiudi,
    riprova: () => {
      if (errore.startsWith("Questa bozza")) setTentativo(n => n + 1);
      else if (corrente.current) void salva(corrente.current).catch((): void => undefined);
      else setTentativo(n => n + 1);
    },
  };
}
