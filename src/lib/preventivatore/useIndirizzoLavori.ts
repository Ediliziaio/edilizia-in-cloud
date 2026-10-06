/**
 * Il passo «Contatto» con l'indirizzo dei lavori (06/10/2026). Di serie i lavori sono allo stesso indirizzo del
 * cliente e lo seguono: ogni volta che si scrive o si sceglie l'indirizzo del cliente, i lavori diventano una
 * copia intera (via, città, CAP, provincia), così l'elenco, la commessa e l'assistente trovano sempre un luogo
 * senza che nessuno debba ricopiarlo. «Altrove» si sceglie solo quando i lavori sono in un altro posto: i campi si
 * aprono vuoti (niente CAP del cliente rimasto per sbaglio) e non seguono più il cliente. Se ci si ripensa
 * l'indirizzo scritto non si perde: tornando ad «altrove» ricompare.
 *
 * La copia la fanno i gestori dei campi, non un effetto: nello stesso gesto che cambia il cliente cambiano anche i
 * lavori, quindi a ogni disegno lo schermo è coerente (niente istante in cui i lavori sembrano «diversi» solo
 * perché non hanno ancora raggiunto il cliente) e aprire un preventivo non lo modifica mai.
 *
 * Lo stato si legge dai dati: un preventivo col cantiere scritto e diverso si apre già su «altrove»; uno con il
 * cantiere vuoto o uguale (come quelli di prima) su «stesso indirizzo».
 */
import { useRef, useState } from "react";
import {
  CAMPI_INDIRIZZO,
  indirizziUguali,
  leggiIndirizzo,
  testoIndirizzo,
  type CampoIndirizzo,
  type Indirizzo,
} from "@/lib/preventivatore/indirizzoLavori";

export type ChiaveIndirizzo = `${"cliente" | "cantiere"}_${CampoIndirizzo}`;

/** Il valore da scrivere: i campi vuoti sono null. */
const dato = (valore: string | null | undefined): string | null => (valore == null || valore === "" ? null : valore);

export function useIndirizzoLavori(
  form: object,
  /** Scrive un campo del preventivo (`cliente_citta`, `cantiere_cap`…). */
  scrivi: (chiave: ChiaveIndirizzo, valore: string | null) => void,
) {
  const cliente = leggiIndirizzo(form, "cliente");
  const lavori = leggiIndirizzo(form, "cantiere");
  // L'utente ha scelto (o ha scritto) un indirizzo dei lavori suo: da lì non si richiude da solo.
  const [sceltoAltrove, setSceltoAltrove] = useState(false);
  const altrove = sceltoAltrove || !indirizziUguali(cliente, lavori);
  /** L'ultimo indirizzo «altrove» scritto, se si torna a «stesso indirizzo» per sbaglio. */
  const ultimoAltrove = useRef<Indirizzo | null>(null);

  const copiaNeiLavori = (da: Indirizzo) => {
    for (const c of CAMPI_INDIRIZZO) {
      if ((lavori[c] ?? null) !== (da[c] ?? null)) scrivi(`cantiere_${c}`, da[c] ?? null);
    }
  };

  return {
    cliente,
    lavori,
    altrove,
    /** «Via Tortona 33, 20121 Milano (MI)»: quello che i lavori copiano, detto a chi sceglie. */
    riassunto: testoIndirizzo(cliente),

    /** Scrive un campo dell'indirizzo del cliente; se i lavori erano lì, lo seguono. */
    cambiaCliente(campo: CampoIndirizzo, valore: string) {
      scrivi(`cliente_${campo}`, valore);
      if (!altrove) copiaNeiLavori({ ...cliente, [campo]: dato(valore) });
    },

    /** L'indirizzo intero del cliente, preso dal CRM: una volta sola, e i lavori lo seguono. */
    impostaCliente(indirizzo: Indirizzo) {
      for (const c of CAMPI_INDIRIZZO) scrivi(`cliente_${c}`, indirizzo[c] ?? null);
      if (!altrove) copiaNeiLavori(indirizzo);
    },

    /** La spunta «stesso indirizzo»: false = i lavori sono altrove. */
    scegliAltrove(vaiAltrove: boolean) {
      if (vaiAltrove) {
        setSceltoAltrove(true);
        const prima = ultimoAltrove.current;
        for (const c of CAMPI_INDIRIZZO) if ((lavori[c] ?? null) !== (prima?.[c] ?? null)) scrivi(`cantiere_${c}`, prima?.[c] ?? null);
      } else {
        ultimoAltrove.current = { ...lavori };
        setSceltoAltrove(false);
        copiaNeiLavori(cliente);
      }
    },

    /** Si scrive nei campi dei lavori: l'indirizzo è suo, non si richiude più mentre ci si lavora. */
    scriviLavori(campo: CampoIndirizzo, valore: string) {
      setSceltoAltrove(true);
      scrivi(`cantiere_${campo}`, campo === "provincia" ? dato(valore.toUpperCase()) : dato(valore));
    },
  };
}
