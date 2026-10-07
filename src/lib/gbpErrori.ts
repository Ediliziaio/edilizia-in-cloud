/**
 * Errori del collegamento a Google Business Profile, in parole da cliente.
 *
 * `gbp_connections.last_error` contiene il testo tecnico della edge function (quote, API, console
 * Google). Al cliente serve sapere cosa sta succedendo e cosa fare; i dettagli tecnici li vede solo
 * il super admin.
 */
export interface MessaggioGbp {
  titolo: string;
  testo: string;
  /** true se il cliente non deve fare nulla: aspetta che sia pronto. */
  inAttivazione: boolean;
}

export function messaggioGbpPerCliente(lastError: string | null | undefined): MessaggioGbp | null {
  const e = (lastError ?? "").trim();
  if (!e) return null;
  const t = e.toLowerCase();

  if (t.includes("quota") || t.includes("429")) {
    return {
      titolo: "Il collegamento con Google è in attivazione",
      testo:
        "Il tuo account Google è collegato, ma Google non ci ha ancora abilitato la lettura delle schede aziendali. " +
        "Non devi fare niente e non serve ricollegarti: appena è pronto, le tue schede e le recensioni compaiono qui.",
      inAttivazione: true,
    };
  }
  if (t.includes("non abilitata") || t.includes("403")) {
    return {
      titolo: "Il collegamento con Google non è ancora attivo",
      testo: "Stiamo completando l'attivazione con Google. Non devi fare niente: ti basta ricontrollare tra qualche giorno.",
      inAttivazione: true,
    };
  }
  if (t.includes("scope insufficienti") || t.includes("token oauth non valido") || t.includes("riconnetti")) {
    return {
      titolo: "Devi ricollegare l'account Google",
      testo: "Il permesso dato a Google è scaduto o incompleto. Premi «Scollega» e poi «Collega Google» e accetta tutti i permessi richiesti.",
      inAttivazione: false,
    };
  }
  if (t.includes("nessuna scheda")) {
    return {
      titolo: "Non troviamo nessuna scheda aziendale",
      testo:
        "L'account Google che hai collegato non ha una scheda Google Business. Controlla di aver usato lo stesso account con cui gestisci la scheda " +
        "della tua attività (puoi verificarlo su business.google.com), poi ricollegalo.",
      inAttivazione: false,
    };
  }
  return {
    titolo: "Il collegamento con Google non è andato a buon fine",
    testo: "Riprova tra qualche minuto. Se il problema resta, scrivici: lo controlliamo noi.",
    inAttivazione: false,
  };
}
