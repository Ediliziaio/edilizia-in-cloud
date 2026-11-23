/**
 * L'avviso che accompagna l'invio di un rapportino, dal tocco su «Invia» alla conferma dell'ufficio.
 *
 * Collaudo 23/11/2026: con il telefono «connesso» ma senza internet (campo debole in cantiere) il modulo
 * metteva il rapportino in coda senza dire niente — l'avviso esisteva solo col telefono offline — e l'operaio
 * restava senza sapere se il lavoro era salvato. Ora l'avviso c'è sempre, e quando la coda lo consegna lo
 * stesso avviso (stesso id) diventa «Rapportino inviato»: uno solo, non due che si accavallano.
 */
export const TOAST_INVIO_RAPPORTINO = "campo-invio-rapportino";

export function testoRapportinoAccodato(online: boolean): string {
  return online
    ? "Rapportino salvato sul telefono. Lo sto inviando all’ufficio."
    : "Rapportino salvato sul telefono. Parte da solo quando torna la rete.";
}
