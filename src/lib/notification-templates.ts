// ============================================================================
// Template standard per i messaggi di notifica delle automazioni
// ============================================================================
// Nascono da un incidente reale: un nodo "Notifica interna" pubblicato senza il
// campo Messaggio ha fatto fallire 21 lead di fila. Il campo era obbligatorio a
// runtime ma nessuno lo guidava. Questi template sono la risposta: chi crea
// un'automazione parte da un testo già scritto invece che da un riquadro vuoto.
//
// ⚠️ REGOLA NON NEGOZIABILE SULLE VARIABILI
// Il motore (process-automation, resolveContactText) risolve SOLO queste chiavi,
// nella forma {{contatto.X}} o {{contact.X}}:
//
//   id · first_name · last_name · full_name · name · email · phone · city
//   province · region/regione · address/indirizzo · postal_code/cap
//   company_name/contact_company · source
//
// Qualunque altra chiave viene sostituita con STRINGA VUOTA, in silenzio.
// Scrivere {{contatto.tipo_lavoro}} non dà errore: dà un buco nel messaggio.
// Perciò qui sotto NON si inventano variabili: se un dato serve e non è in
// quella lista, va scritto in chiaro o aggiunto prima al resolver.
// ============================================================================

export interface NotificationTemplate {
  id: string;
  label: string;
  /** A quale evento serve: mostrato sotto il nome nel selettore. */
  descrizione: string;
  /** Raggruppa il menu a tendina. */
  categoria: "Commerciale" | "Operativo" | "Amministrazione" | "Personale";
  oggetto: string;
  messaggio: string;
  /**
   * Id dei nodi-trigger per cui questo template ha senso. Vuoto = sempre.
   * Serve a proporre per primi i template coerenti col trigger del flusso,
   * non a nasconderli: l'utente resta libero di scegliere.
   */
  triggerSuggeriti?: string[];
}

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  // ── COMMERCIALE ───────────────────────────────────────────────────────────
  {
    id: "nuovo_lead",
    label: "Nuovo lead da ricontattare",
    descrizione: "Arriva un contatto da form, Meta o campagna: avvisa chi deve chiamarlo.",
    categoria: "Commerciale",
    triggerSuggeriti: ["contatto_creato", "campagna_facebook_lead", "form_compilato"],
    oggetto: "Nuovo lead: {{contatto.full_name}}",
    messaggio:
      "È entrato un nuovo contatto da ricontattare.\n\n" +
      "Nome: {{contatto.full_name}}\n" +
      "Telefono: {{contatto.phone}}\n" +
      "Email: {{contatto.email}}\n" +
      "Zona: {{contatto.city}} ({{contatto.province}})\n" +
      "Provenienza: {{contatto.source}}\n\n" +
      "Chiamalo entro oggi: sui lead il primo che risponde chiude.",
  },
  {
    id: "lead_da_richiamare",
    label: "Lead non ancora richiamato",
    descrizione: "Sollecito interno quando un contatto resta fermo senza contatto telefonico.",
    categoria: "Commerciale",
    oggetto: "Da richiamare: {{contatto.full_name}}",
    messaggio:
      "Questo contatto è ancora in attesa di essere richiamato.\n\n" +
      "Nome: {{contatto.full_name}}\n" +
      "Telefono: {{contatto.phone}}\n" +
      "Zona: {{contatto.city}}\n\n" +
      "Se è già stato sentito, aggiorna la scheda così smette di comparire.",
  },
  {
    id: "appuntamento_fissato",
    label: "Appuntamento fissato",
    descrizione: "Un sopralluogo o una visita è stata messa in calendario.",
    categoria: "Commerciale",
    triggerSuggeriti: ["appuntamento_creato", "appuntamento_confermato"],
    oggetto: "Appuntamento fissato con {{contatto.full_name}}",
    messaggio:
      "È stato fissato un appuntamento.\n\n" +
      "Cliente: {{contatto.full_name}}\n" +
      "Telefono: {{contatto.phone}}\n" +
      "Indirizzo: {{contatto.address}}, {{contatto.city}} ({{contatto.province}})\n\n" +
      "Controlla il calendario per l'orario e porta il materiale che serve.",
  },
  {
    id: "preventivo_firmato",
    label: "Preventivo accettato",
    descrizione: "Il cliente ha firmato: si apre la commessa.",
    categoria: "Commerciale",
    triggerSuggeriti: ["opportunita_vinta"],
    oggetto: "Preventivo firmato — {{contatto.full_name}}",
    messaggio:
      "Il cliente ha accettato il preventivo.\n\n" +
      "Cliente: {{contatto.full_name}}\n" +
      "Telefono: {{contatto.phone}}\n" +
      "Cantiere: {{contatto.address}}, {{contatto.city}}\n\n" +
      "Da fare adesso: aprire la commessa, programmare i materiali e dare una data di inizio.",
  },
  {
    id: "opportunita_persa",
    label: "Trattativa persa",
    descrizione: "Serve a capire perché si perde, non solo a registrarlo.",
    categoria: "Commerciale",
    triggerSuggeriti: ["opportunita_persa"],
    oggetto: "Trattativa persa — {{contatto.full_name}}",
    messaggio:
      "Abbiamo perso questa trattativa.\n\n" +
      "Cliente: {{contatto.full_name}}\n" +
      "Zona: {{contatto.city}}\n" +
      "Provenienza: {{contatto.source}}\n\n" +
      "Scrivi il motivo nella scheda: se non lo annotiamo, non sapremo mai dove stiamo perdendo.",
  },

  // ── OPERATIVO ─────────────────────────────────────────────────────────────
  {
    id: "task_assegnato",
    label: "Attività assegnata",
    descrizione: "Qualcuno ha un nuovo compito da fare.",
    categoria: "Operativo",
    oggetto: "Nuova attività da fare",
    messaggio:
      "Ti è stata assegnata una nuova attività.\n\n" +
      "Riferimento: {{contatto.full_name}}\n" +
      "Contatto: {{contatto.phone}}\n\n" +
      "La trovi in Attività. Se non è di tua competenza, riassegnala invece di lasciarla ferma.",
  },
  {
    id: "task_scaduto",
    label: "Attività scaduta",
    descrizione: "Un compito ha superato la data ed è ancora aperto.",
    categoria: "Operativo",
    oggetto: "Attività scaduta — {{contatto.full_name}}",
    messaggio:
      "Un'attività ha superato la scadenza e risulta ancora da fare.\n\n" +
      "Riferimento: {{contatto.full_name}}\n\n" +
      "Chiudila o sposta la data: una scadenza che nessuno guarda non serve a niente.",
  },
  {
    id: "cantiere_avviato",
    label: "Cantiere partito",
    descrizione: "I lavori sono iniziati: avvisa ufficio e magazzino.",
    categoria: "Operativo",
    triggerSuggeriti: ["ordine_creato", "cantiere_creato"],
    oggetto: "Cantiere avviato — {{contatto.full_name}}",
    messaggio:
      "È partito un nuovo cantiere.\n\n" +
      "Cliente: {{contatto.full_name}}\n" +
      "Indirizzo: {{contatto.address}}, {{contatto.city}} ({{contatto.province}})\n" +
      "Telefono: {{contatto.phone}}\n\n" +
      "Verifica materiali, squadra assegnata e documenti di sicurezza.",
  },
  {
    id: "cantiere_in_ritardo",
    label: "Cantiere in ritardo",
    descrizione: "La data di fine è passata e il cantiere è ancora aperto.",
    categoria: "Operativo",
    triggerSuggeriti: ["ordine_in_ritardo", "cantiere_in_ritardo"],
    oggetto: "Cantiere in ritardo — {{contatto.full_name}}",
    messaggio:
      "Questo cantiere ha superato la data di fine prevista ed è ancora aperto.\n\n" +
      "Cliente: {{contatto.full_name}}\n" +
      "Indirizzo: {{contatto.address}}, {{contatto.city}}\n\n" +
      "Aggiorna la data o chiudi il cantiere. Se il ritardo dipende dal cliente, mettilo per iscritto.",
  },
  {
    id: "lavori_conclusi",
    label: "Lavori conclusi",
    descrizione: "Cantiere chiuso: parte la fatturazione e la richiesta di recensione.",
    categoria: "Operativo",
    oggetto: "Lavori conclusi — {{contatto.full_name}}",
    messaggio:
      "I lavori sono stati completati.\n\n" +
      "Cliente: {{contatto.full_name}}\n" +
      "Indirizzo: {{contatto.address}}, {{contatto.city}}\n" +
      "Telefono: {{contatto.phone}}\n\n" +
      "Da fare: verbale di fine lavori, fattura a saldo e richiesta di recensione finché il cliente è contento.",
  },

  // ── AMMINISTRAZIONE ───────────────────────────────────────────────────────
  {
    id: "pagamento_ricevuto",
    label: "Pagamento incassato",
    descrizione: "È arrivato un incasso da un cliente.",
    categoria: "Amministrazione",
    triggerSuggeriti: ["pagamento_ricevuto"],
    oggetto: "Incasso ricevuto — {{contatto.full_name}}",
    messaggio:
      "È stato registrato un incasso.\n\n" +
      "Cliente: {{contatto.full_name}}\n\n" +
      "Controlla che risulti abbinato alla fattura giusta in Tesoreria.",
  },
  {
    id: "fattura_scaduta",
    label: "Fattura scaduta",
    descrizione: "Una fattura ha superato la scadenza senza essere incassata.",
    categoria: "Amministrazione",
    triggerSuggeriti: ["fattura_scaduta"],
    oggetto: "Fattura scaduta — {{contatto.full_name}}",
    messaggio:
      "Una fattura risulta scaduta e non incassata.\n\n" +
      "Cliente: {{contatto.full_name}}\n" +
      "Telefono: {{contatto.phone}}\n" +
      "Email: {{contatto.email}}\n\n" +
      "Primo sollecito al telefono e con tono cordiale: quasi sempre è una dimenticanza.",
  },
  {
    id: "costo_in_scadenza",
    label: "Scadenza da pagare",
    descrizione: "Una scadenza in uscita sta per arrivare.",
    categoria: "Amministrazione",
    triggerSuggeriti: ["costo_in_scadenza"],
    oggetto: "Scadenza in arrivo da pagare",
    messaggio:
      "C'è una scadenza in uscita che si avvicina.\n\n" +
      "Riferimento: {{contatto.full_name}}\n\n" +
      "Verifica la liquidità sul conto prima della data, così non si paga in ritardo.",
  },

  // ── PERSONALE ─────────────────────────────────────────────────────────────
  {
    id: "richiesta_personale",
    label: "Richiesta dal personale",
    descrizione: "Ferie, permessi o segnalazioni da approvare.",
    categoria: "Personale",
    oggetto: "Richiesta da approvare",
    messaggio:
      "È arrivata una richiesta dal personale che aspetta una risposta.\n\n" +
      "Da: {{contatto.full_name}}\n\n" +
      "La trovi nella sezione Personale. Rispondi entro un paio di giorni: le richieste ferme demotivano.",
  },
  {
    id: "documento_in_scadenza",
    label: "Documento in scadenza",
    descrizione: "Visita medica, corso sicurezza o certificato che sta scadendo.",
    categoria: "Personale",
    oggetto: "Documento in scadenza — {{contatto.full_name}}",
    messaggio:
      "Un documento del personale sta per scadere.\n\n" +
      "Persona: {{contatto.full_name}}\n\n" +
      "Rinnovalo prima della data: con un documento scaduto la persona non può stare in cantiere.",
  },
];

/** Variabili che il motore risolve davvero. Fonte unica per UI e controlli. */
export const VARIABILI_CONTATTO_SUPPORTATE = [
  "first_name", "last_name", "full_name", "name", "email", "phone",
  "city", "province", "region", "address", "postal_code", "company_name", "source",
] as const;

/**
 * Trova le variabili scritte in un testo che il motore NON sa risolvere.
 * Restituirle all'utente evita il caso peggiore: un messaggio che parte con
 * dei buchi dentro e nessuno se ne accorge.
 */
export function variabiliNonRisolvibili(testo: string): string[] {
  if (!testo) return [];
  const ammesse = new Set<string>([
    ...VARIABILI_CONTATTO_SUPPORTATE,
    "regione", "indirizzo", "cap", "contact_company", "id",
  ]);
  const trovate = [...testo.matchAll(/\{\{\s*(?:contatto|contact)\.(\w+)\s*\}\}/g)]
    .map((m) => m[1])
    .filter((k) => !ammesse.has(k));
  return [...new Set(trovate)];
}

/** Template proposti per un trigger, i coerenti per primi. */
export function templatePerTrigger(triggerItemId?: string): NotificationTemplate[] {
  if (!triggerItemId) return NOTIFICATION_TEMPLATES;
  const pertinente = (t: NotificationTemplate) => t.triggerSuggeriti?.includes(triggerItemId) ?? false;
  return [...NOTIFICATION_TEMPLATES].sort((a, b) => Number(pertinente(b)) - Number(pertinente(a)));
}
