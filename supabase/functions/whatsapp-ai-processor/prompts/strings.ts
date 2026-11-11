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
  },
  shared: {
    generic_error:
      "Ho avuto un problema. Riprova tra un momento.",
    ai_ferma:
      "L'assistente è fermo per un problema del servizio AI: il titolare è già avvisato. Nel frattempo puoi fare la stessa cosa dall'app.",
    // Carta mancante o abbonamento sospeso/scaduto dell'azienda (11/11/2026): chi scrive
    // non ne sa nulla e non può farci niente. Frase neutra; il motivo va all'ufficio.
    ai_non_disponibile_avvisato:
      "Al momento non posso rispondere in automatico: ho passato il messaggio all'ufficio, ti ricontatterà una persona dell'azienda.",
    ai_non_disponibile:
      "Al momento non posso rispondere in automatico. Riprova più tardi oppure contatta direttamente l'azienda.",
    tool_unavailable:
      "Questa operazione non è disponibile per te.",
  },
} as const;
