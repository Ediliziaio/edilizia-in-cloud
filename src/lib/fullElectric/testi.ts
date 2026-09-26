/**
 * I testi fissi del preventivo Casa Full Electric. Niente promesse a nome
 * dell'azienda: produzione, risparmi e incentivi sono stime, e il documento lo
 * dice. Chi vende può riscrivere domande e passaggi nel modello.
 */
import type { NomeIcona } from "../../../supabase/functions/_shared/iconePreventivo";
import type { DomandaRisposta, Passaggio } from "@/lib/contoTermico/testi";
import type { ComponenteFullElectric } from "./regole";

/** Cosa fa ogni pezzo del sistema, in una riga, e il suo segno. */
export const PEZZI_FULL_ELECTRIC: Record<ComponenteFullElectric, { icona: NomeIcona; cosaFa: string }> = {
  fotovoltaico: { icona: "sole", cosaFa: "Trasforma il sole sul tetto in elettricità: di giorno la casa usa prima la sua." },
  accumulo: { icona: "batteria", cosaFa: "Tiene l'energia di mezzogiorno per la sera e la notte, quando il sole non c'è." },
  pompa_calore: { icona: "temperatura", cosaFa: "Scalda la casa e l'acqua prendendo calore dall'aria: per ogni kWh elettrico ne rende circa 3 o 4 di calore." },
  induzione: { icona: "energia", cosaFa: "Cucina senza fiamma: più veloce del gas, più sicura, e il piano si pulisce con un panno." },
  scaldacqua: { icona: "acqua", cosaFa: "L'acqua calda sanitaria con una piccola pompa di calore, al posto del boiler o della caldaia." },
  climatizzazione: { icona: "ventilazione", cosaFa: "Fresco d'estate con l'energia del tetto, quando il sole produce di più." },
  wallbox: { icona: "rete", cosaFa: "La ricarica dell'auto a casa, di giorno col sole o di notte con la tariffa più bassa." },
};

export const FAQ_FULL_ELECTRIC: DomandaRisposta[] = [
  {
    domanda: "E d'inverno, quando il sole è poco?",
    risposta: "La casa prende dalla rete quello che il tetto non produce: il conto lo trovi mese per mese in queste pagine. D'inverno la pompa di calore lavora di più e il fotovoltaico produce meno, per questo impianto, batteria e contratto della luce si scelgono insieme.",
  },
  {
    domanda: "Devo aumentare la potenza del contatore?",
    risposta: "Spesso sì: con pompa di calore e induzione si passa di solito da 3 a 4,5 o 6 kW. Si verifica al sopralluogo; se serve, l'aumento di potenza è indicato nella proposta.",
  },
  {
    domanda: "Posso chiudere il contratto del gas?",
    risposta: "Sì, quando riscaldamento, acqua calda e cucina non lo usano più. Senza gas non paghi più nemmeno le quote fisse del contratto, e la caldaia non va più revisionata.",
  },
  {
    domanda: "Cosa succede se va via la corrente?",
    risposta: "Dipende dall'inverter e dalla batteria: alcuni sistemi tengono accese le utenze principali. Se la funzione è compresa la trovi nella scheda del sistema; se non c'è, la casa si comporta come oggi con la rete.",
  },
  {
    domanda: "Quanto dura la batteria?",
    risposta: "Le batterie al litio per la casa hanno garanzie del produttore di solito di 10 anni o di un numero di cicli: le condizioni sono quelle della sua documentazione.",
  },
  {
    domanda: "Quali incentivi posso avere?",
    risposta: "Sul fotovoltaico e sulla batteria la detrazione per la casa, in 10 anni; sulla pompa di calore che sostituisce un generatore, il Conto Termico del GSE. Non si sommano sullo stesso componente: nel preventivo trovi quale vale per cosa.",
  },
  {
    domanda: "Con l'induzione devo cambiare le pentole?",
    risposta: "Servono pentole col fondo magnetico: una calamita che si attacca sotto la pentola lo dice subito. Molte pentole in acciaio vanno già bene.",
  },
  {
    domanda: "Quanta manutenzione serve?",
    risposta: "Poca: il fotovoltaico chiede controlli e, se serve, la pulizia dei moduli; la pompa di calore una manutenzione periodica più semplice di quella di una caldaia a gas. I servizi compresi sono quelli della proposta.",
  },
];

export const PASSAGGI_FULL_ELECTRIC: Passaggio[] = [
  { titolo: "Sopralluogo e consumi", testo: "Guardiamo tetto, locale tecnico e impianto di oggi, e leggiamo con te le bollette di gas e luce." },
  { titolo: "Progetto e pratiche", testo: "Dimensioniamo impianto e batteria sui tuoi consumi e prepariamo connessione alla rete e pratiche per gli incentivi." },
  { titolo: "Installazione coordinata", testo: "Fotovoltaico, batteria, pompa di calore e induzione in giorni concordati, un lavoro alla volta." },
  { titolo: "Attivazione", testo: "Colleghiamo l'impianto alla rete, avviamo la pompa di calore e ti spieghiamo l'app per seguire l'energia di casa." },
  { titolo: "Addio al gas", testo: "Quando tutto funziona chiudi il contratto del gas: da lì paghi una bolletta sola." },
];

export const DOCUMENTI_FULL_ELECTRIC = [
  "Bollette di gas e luce",
  "Foto del tetto e del locale tecnico",
  "Schede tecniche dei componenti",
  "Dichiarazioni di conformità",
  "Pratica di connessione alla rete",
  "Fatture e bonifici per gli incentivi",
] as const;
