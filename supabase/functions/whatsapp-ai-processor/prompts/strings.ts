// MP02 — Stringhe user-facing centralizzate (i18n-ready).

export const STR = {
  operaio: {
    unknown_user:
      "Non riconosco questo numero. Chiedi al titolare di registrarti in Edilizia in Cloud.",
    budget_soft:
      "Il bot sta andando un po' piano oggi per controllo costi. Scrivi solo l'essenziale.",
    budget_hard:
      "Il bot AI è disattivato per il resto della giornata. Riprova domani o contatta il titolare.",
    rapportino_needed:
      "Dimmi almeno le ore lavorate o un'attività svolta.",
    no_active_cantieri:
      "Non hai cantieri attivi oggi.",
    max_iterations:
      "Non ce l'ho fatta. Prova a scrivere più semplice o passa dall'app.",
  },
  titolare: {
    unknown_user:
      "Non riconosco questo numero. Verifica che il tuo telefono sia registrato nel profilo azienda.",
    budget_soft:
      "Servizio AI in modalità economica per controllo costi. Risposte più brevi.",
    budget_hard:
      "Budget AI giornaliero esaurito. Riattivo domani.",
    approvazione_conferma:
      "Confermi l'approvazione di questa richiesta? Rispondi \"sì\" o \"no\".",
  },
  shared: {
    generic_error:
      "Ho avuto un problema. Riprova tra un momento.",
    tool_unavailable:
      "Questa operazione non è disponibile per te.",
  },
} as const;
