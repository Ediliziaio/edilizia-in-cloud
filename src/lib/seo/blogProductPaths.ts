/** Public product paths shared by the article and its server-rendered fallback. */
export interface BlogProductPath { href: string; label: string; desc: string }

const STRUMENTI_PER_CATEGORIA: Record<string, BlogProductPath[]> = {
  "Gestione Cantieri": [
    { href: "/funzionalita/gestione-cantieri/", label: "Gestione cantieri", desc: "Avanzamento lavori, SAL e varianti per ogni commessa." },
    { href: "/funzionalita/giornale-lavori/", label: "Giornale dei lavori", desc: "Compilato dal telefono, con foto e firma." },
    { href: "/funzionalita/app-cantiere-mobile/", label: "App cantiere", desc: "Consulta la pagina dedicata al lavoro da telefono." },
  ],
  Finanza: [
    { href: "/funzionalita/margini-cantiere/", label: "Margini per commessa", desc: "Confronta costi previsti e costi registrati della commessa." },
    { href: "/funzionalita/tesoreria/", label: "Tesoreria", desc: "Approfondisci il controllo dei flussi e delle scadenze." },
    { href: "/funzionalita/fatturazione-elettronica/", label: "Fatturazione elettronica", desc: "Esamina il flusso dei documenti e della fatturazione." },
  ],
  "HR & Personale": [
    { href: "/funzionalita/timbrature-gps/", label: "Timbrature GPS", desc: "Presenze per cantiere, senza fogli da ricopiare." },
    { href: "/funzionalita/hr-personale/", label: "HR e Cassa Edile", desc: "Approfondisci la gestione delle informazioni sul personale." },
    { href: "/funzionalita/cedolini-paga/", label: "Cedolini paga", desc: "Collega le informazioni del personale alla gestione delle paghe." },
  ],
  Marketing: [
    { href: "/funzionalita/crm-edilizia/", label: "CRM per imprese edili", desc: "Ogni richiesta seguita fino al preventivo." },
    { href: "/funzionalita/whatsapp-marketing/", label: "WhatsApp marketing", desc: "Promemoria e follow-up dove il cliente risponde." },
    { href: "/funzionalita/lead-form-facebook/", label: "Lead da Facebook e Instagram", desc: "Esamina il collegamento fra moduli pubblicitari e CRM." },
  ],
  Commerciale: [
    { href: "/funzionalita/preventivi-edilizia/", label: "Preventivi e computi", desc: "Approfondisci la preparazione di offerte e computi." },
    { href: "/funzionalita/pipeline-vendite/", label: "Pipeline vendite", desc: "Sai sempre quali preventivi stanno per chiudersi." },
    { href: "/funzionalita/firma-elettronica/", label: "Firma elettronica", desc: "Leggi come viene presentato il processo di firma." },
  ],
  Digitalizzazione: [
    { href: "/funzionalita/agenti-ai/", label: "Silvio, l'assistente AI", desc: "Legge i numeri dell'azienda e ti dice dove guardare." },
    { href: "/funzionalita/cruscotto-aziendale/", label: "Cruscotto aziendale", desc: "Cantieri, cassa e margini in una schermata." },
    { href: "/funzionalita/automazioni/", label: "Automazioni", desc: "Valuta quali passaggi del processo puoi organizzare." },
  ],
  Normativa: [
    { href: "/funzionalita/gestione-subappalti/", label: "Subappalti e DURC", desc: "Organizza documenti e scadenze dei subappaltatori." },
    { href: "/funzionalita/sicurezza-cantiere/", label: "Sicurezza cantiere", desc: "Approfondisci la gestione documentale della sicurezza." },
    { href: "/funzionalita/ritenute-garanzia/", label: "Ritenute di garanzia", desc: "Trattenute e svincoli tracciati per ogni appalto." },
  ],
};


// The next step follows the specific question answered by these guides.
const STRUMENTI_PER_ARTICOLO: Record<string, BlogProductPath[]> = {
  "cassa-edile-come-funziona": [
    { href: "/funzionalita/hr-personale/", label: "Organizzare i dati del personale", desc: "Esamina le informazioni da raccogliere e mantenere aggiornate per le persone dell’impresa." },
    { href: "/funzionalita/timbrature-gps/", label: "Collegare le presenze al cantiere", desc: "Approfondisci la raccolta delle presenze da confrontare con i dati amministrativi." },
    { href: "/blog/controllo-ore-cantiere-prima-paghe/", label: "Controllare le ore prima delle paghe", desc: "Raccorda presenze, rapportini e riepilogo con un esempio e una scheda di controllo." },
  ],
  "ritenuta-di-garanzia-appalti-come-funziona": [
    { href: "/funzionalita/ritenute-garanzia/", label: "Seguire trattenute e svincoli", desc: "Collega gli importi registrati all’appalto e ai documenti del singolo caso." },
    { href: "/funzionalita/gestione-cantieri/", label: "Riunire i riferimenti della commessa", desc: "Esamina il percorso che collega lavorazioni, avanzamento e documentazione." },
    { href: "/funzionalita/tesoreria/", label: "Distinguere importi e movimenti di cassa", desc: "Approfondisci il monitoraggio delle scadenze e dei flussi, tenendo separati gli importi attesi dagli incassi." },
  ],
  "cartello-di-cantiere-obbligatorio": [
    { href: "/funzionalita/sicurezza-cantiere/", label: "Organizzare la documentazione del cantiere", desc: "Leggi il percorso documentale e chiarisci con il tecnico quali dati e adempimenti riguardano il tuo intervento." },
    { href: "/funzionalita/gestione-cantieri/", label: "Tenere insieme i riferimenti del lavoro", desc: "Esamina come collegare commessa, persone e informazioni operative." },
    { href: "/funzionalita/giornale-lavori/", label: "Documentare il lavoro eseguito", desc: "Approfondisci il diario operativo, mantenendolo distinto dagli adempimenti formali del caso." },
  ],
};

export function getBlogProductPaths(post: { slug: string; category: string }): BlogProductPath[] {
  return STRUMENTI_PER_ARTICOLO[post.slug] ?? STRUMENTI_PER_CATEGORIA[post.category] ?? [];
}
