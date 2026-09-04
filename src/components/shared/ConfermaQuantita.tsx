/**
 * Il campo «scrivi quanti ne stai eliminando», per le cancellazioni in blocco.
 *
 * Nasce dal dialogo dei contatti e sta qui perché il difetto non era di quella
 * pagina: dovunque ci sia un «seleziona tutti» e un pulsante Elimina, due clic
 * cancellano una tabella intera con una conferma che si legge in mezzo secondo.
 * Sotto la soglia non compare niente — cancellare tre righe sbagliate non deve
 * diventare un rito — sopra, si scrive il numero.
 *
 * Il numero e non una parola: una parola fissa si digita a memoria senza
 * guardare, un numero costringe a leggere quante sono.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  richiestaConferma,
  confermaValida,
  type RichiestaConferma,
} from "@/lib/marketing/confermaEliminazione";

export interface StatoConfermaQuantita {
  richiesta: RichiestaConferma;
  testo: string;
  setTesto: (v: string) => void;
  /** true quando si può procedere: sotto soglia lo è sempre. */
  valida: boolean;
}

/**
 * `aperto` serve solo a svuotare il campo quando il dialogo si riapre: senza,
 * chi ha confermato una volta si ritroverebbe la conferma già valida alla
 * richiesta successiva, che è il contrario di quello che serve qui.
 */
export function useConfermaQuantita(count: number, aperto: boolean): StatoConfermaQuantita {
  const [stato, setStato] = useState({ eraAperto: aperto, testo: "" });
  if (stato.eraAperto !== aperto) {
    // Aggiustamento durante il render, non in un effetto: così il campo è già
    // vuoto al primo disegno del dialogo e non per un istante pieno.
    setStato({ eraAperto: aperto, testo: "" });
  }
  const richiesta = richiestaConferma(count, null);
  return {
    richiesta,
    testo: stato.testo,
    setTesto: (v: string) => setStato((s) => ({ ...s, testo: v })),
    valida: confermaValida(stato.testo, richiesta),
  };
}

export function ConfermaQuantita({
  stato,
  disabled,
  cosa = "elementi",
}: {
  stato: StatoConfermaQuantita;
  disabled?: boolean;
  /** Come si chiamano le righe, per il testo: «anagrafiche», «costi»… */
  cosa?: string;
}) {
  if (!stato.richiesta.serve) return null;
  return (
    <div className="space-y-1.5 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-semibold text-red-900">
        Stai eliminando {stato.richiesta.parola} {cosa}. Non si torna indietro.
      </p>
      <Label htmlFor="conferma-quantita" className="text-sm font-medium text-red-900">
        Per procedere scrivi quanti ne stai eliminando:{" "}
        <span className="font-bold">{stato.richiesta.parola}</span>
      </Label>
      <Input
        id="conferma-quantita"
        value={stato.testo}
        onChange={(e) => stato.setTesto(e.target.value)}
        placeholder={stato.richiesta.parola}
        autoComplete="off"
        autoFocus
        disabled={disabled}
        className="bg-white"
      />
    </div>
  );
}
