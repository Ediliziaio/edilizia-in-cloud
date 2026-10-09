/**
 * Dove porta la freccia «indietro» della testata.
 *
 * Aprendo l'app da un link (una notifica, un messaggio) la pagina è la PRIMA della cronologia: `navigate(-1)` non ha
 * dove tornare e l'operaio usciva dall'app. In quel caso (la chiave della posizione è «default») si va alla Home.
 */
export function destinazioneIndietro(chiavePosizione: string): -1 | "/campo" {
  return chiavePosizione === "default" ? "/campo" : -1;
}
