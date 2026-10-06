/**
 * L'indirizzo dei lavori nel passo Cliente dei preventivi edili (06/10/2026). Qui il cliente non ha un indirizzo
 * proprio: se è collegato un contatto del CRM con un indirizzo, i lavori possono essere «allo stesso indirizzo del
 * contatto» (la spunta copia via, città, CAP e provincia); altrimenti, o se i lavori sono altrove, si scrivono i
 * quattro campi.
 *
 * Come nei serramenti (`useIndirizzoLavori`) la copia la fanno i gestori, non un effetto che riscrive a ogni giro:
 * aprire un preventivo non lo modifica mai. Due differenze volute: un cantiere VUOTO non conta come «stesso
 * indirizzo» (negli edili un cantiere vuoto è un cantiere ancora da scrivere), e un preventivo NUOVO nato da un
 * contatto (?contact_id=…) parte con i lavori all'indirizzo di quel contatto, una volta sola.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { chiaveIndirizzoContatto, useIndirizzoContatto } from "@/hooks/useIndirizzoContatto";
import {
  CAMPI_INDIRIZZO,
  indirizziUgualiStretti,
  indirizzoVuoto,
  leggiIndirizzo,
  testoIndirizzo,
  valoreDaCopiare,
  type CampoIndirizzo,
  type Indirizzo,
} from "@/lib/preventivatore/indirizzoLavori";

export type ChiaveCantiere = `cantiere_${CampoIndirizzo}`;

const dato = (valore: string | null | undefined): string | null => (valore == null || valore === "" ? null : valore);

export function useIndirizzoLavoriEdile(
  form: object,
  /** Scrive un campo del preventivo (`cantiere_citta`, `cantiere_cap`…). */
  scrivi: (chiave: ChiaveCantiere, valore: string | null) => void,
  { contattoId, nuovo }: { contattoId: string | null | undefined; nuovo: boolean },
) {
  const queryClient = useQueryClient();
  const lavori = leggiIndirizzo(form, "cantiere");
  const { data: contatto } = useIndirizzoContatto(contattoId);
  /** Il contatto collegato ha un indirizzo da proporre. */
  const conSpunta = !!contatto && !indirizzoVuoto(contatto);
  // L'utente ha scelto (o ha scritto) un indirizzo dei lavori suo: da lì non si richiude da solo.
  const [sceltoAltrove, setSceltoAltrove] = useState(false);
  const uguale = conSpunta && !sceltoAltrove && indirizziUgualiStretti(contatto, lavori);
  /** L'ultimo indirizzo «altrove» scritto, se si torna a «stesso indirizzo» per sbaglio. */
  const ultimoAltrove = useRef<Indirizzo | null>(null);
  /** Il preventivo è già partito da un contatto: niente più copia automatica. */
  const partito = useRef(false);

  const copiaNeiLavori = (da: Indirizzo | null) => {
    for (const c of CAMPI_INDIRIZZO) {
      const valore = valoreDaCopiare(c, da?.[c]);
      if ((lavori[c] ?? null) !== valore) scrivi(`cantiere_${c}`, valore);
    }
  };

  // Un preventivo NUOVO nato da un contatto del CRM (?contact_id=…): i lavori partono dal suo indirizzo, una volta.
  useEffect(() => {
    if (!nuovo || partito.current || !conSpunta || sceltoAltrove || !indirizzoVuoto(lavori)) return;
    partito.current = true;
    copiaNeiLavori(contatto);
  });

  return {
    lavori,
    conSpunta,
    /** I campi si vedono: i lavori sono altrove, o non c'è un indirizzo da copiare. */
    altrove: !uguale,
    /** L'indirizzo del contatto, detto a chi sceglie. */
    riassunto: contatto ? testoIndirizzo(contatto) : "",

    /** Si è scelto un contatto dal CRM: se i lavori erano vuoti o copiati dal contatto di prima, seguono il nuovo. */
    dalContatto(id: string, indirizzo: Indirizzo) {
      // La scheda è già in mano: la spunta compare subito, senza aspettare di rileggerla.
      queryClient.setQueryData(chiaveIndirizzoContatto(id), indirizzo);
      const seguiva = !sceltoAltrove && (indirizzoVuoto(lavori) || (!!contatto && indirizziUgualiStretti(contatto, lavori)));
      if (seguiva) copiaNeiLavori(indirizzo);
      partito.current = true;
    },

    /** La spunta «stesso indirizzo del contatto»: false = i lavori sono altrove. */
    scegliAltrove(vaiAltrove: boolean) {
      if (vaiAltrove) {
        setSceltoAltrove(true);
        copiaNeiLavori(ultimoAltrove.current);
      } else {
        ultimoAltrove.current = { ...lavori };
        setSceltoAltrove(false);
        copiaNeiLavori(contatto ?? null);
      }
    },

    /** Si scrive nei campi dei lavori: l'indirizzo è suo, non si richiude più mentre ci si lavora. */
    scriviLavori(campo: CampoIndirizzo, valore: string) {
      setSceltoAltrove(true);
      scrivi(`cantiere_${campo}`, campo === "provincia" ? dato(valore.toUpperCase()) : dato(valore));
    },
  };
}
