/**
 * Il titolo e la frase sotto il titolo di ogni pagina delle impostazioni (SettingsLayout).
 *
 * Il titolo è il nome che la pagina ha nel menu: stesso nome nel menu, nella ricerca, nella palette e nella
 * testata. La frase dice a cosa serve, in parole di cantiere e di ufficio.
 *
 * Le pagine con le schede (Listino, Modelli di preventivo, Firma e condizioni) hanno il titolo del gruppo
 * (gruppiImpostazioni.ts): per loro qui non serve niente. Gli indirizzi che reindirizzano altrove
 * (venditori, staff, privacy, fatturazione-nativa…) non hanno mai una testata propria e non stanno qui.
 * Il test titoliImpostazioni.test.ts controlla che ogni pagina abbia il suo titolo e che nessuna riga sia
 * irraggiungibile.
 */
import { gruppoDellaSezione, sezioneDaPercorso } from "./gruppiImpostazioni";

export interface TitoloImpostazione {
  title: string;
  description: string;
}

/** Segmento dell'indirizzo dopo /azienda/impostazioni/ → titolo e frase. */
export const TITOLI_IMPOSTAZIONI: Record<string, TitoloImpostazione> = {
  "mio-profilo":          { title: "Il mio profilo",           description: "I tuoi dati, la password, i calendari e la posta collegata" },
  profilo:                { title: "Profilo aziendale",        description: "I dati dell'azienda che compaiono su preventivi, fatture e documenti" },
  sedi:                   { title: "Sedi",                     description: "Showroom, magazzini e uffici dell'azienda" },
  branding:               { title: "White-Label",              description: "Logo, colori, nome e indirizzo web della piattaforma con il tuo marchio" },
  abbonamento:            { title: "Piano abbonamento",        description: "Il tuo piano, i pagamenti e le fatture dell'abbonamento" },
  crediti:                { title: "Crediti e ricariche",      description: "Il saldo per AI, email, WhatsApp e SMS; la ricarica anche automatica" },
  persone:                { title: "Persone & Accessi",        description: "Utenti e permessi, venditori, dipendenti, subappaltatori, team e commercialista" },
  utenti:                 { title: "Utenti",                   description: "Gestisci gli accessi e i ruoli degli utenti" },
  "ai-memoria":           { title: "AI Personas — Chat & Memoria", description: "Parla con gli assistenti specializzati (finanza, commesse, sicurezza…) e controlla cosa ricordano della tua azienda" },
  "ai-automazioni":       { title: "Cosa fa Silvio da solo",   description: "Per ogni azione scegli se Silvio la propone, chiede conferma o la esegue" },
  notifiche:              { title: "Notifiche",                description: "Quali avvisi ricevi, su quale dispositivo e in quali orari" },
  "catalogo-render":      { title: "Catalogo render",          description: "Foto dei tuoi prodotti da usare come riferimento nei render" },
  finanziamenti:          { title: "Finanziamenti",            description: "Tabelle delle finanziarie convenzionate e calcolatore rate" },
  "stati-ordine":         { title: "Stati commessa",           description: "I passaggi di una commessa, dal contratto all'assistenza. Le fasi di lavoro sono un'altra cosa: stanno in «Fasi e avanzamento»." },
  "cartelle-documenti":   { title: "Cartelle documenti",       description: "Le cartelle dei documenti di ogni commessa: quali si vedono al cliente e quali sono obbligatorie" },
  "calendari-lavori":     { title: "Calendari lavori",         description: "Le squadre di posa, interne e di ditte esterne. Se vuoi, ognuna ha il suo calendario Google" },
  "rapportini-cantiere":  { title: "Rapportini e presenze",    description: "Come lavorano i tuoi cantieri: chi scrive il rapportino e da dove vengono le ore" },
  "modelli-fasi":         { title: "Fasi e avanzamento",       description: "I modelli di fasi, con quali fasi parte una commessa nuova, chi spunta le sottofasi e come si calcola l'avanzamento" },
  "modelli-pagamento":    { title: "Modelli di pagamento",     description: "Le rate con cui si incassa una commessa, e quando matura la rata di un SAL" },
  fornitori:              { title: "Fornitori",                description: "Fornitori, ordini d'acquisto, pagamenti e acquisti in un posto solo" },
  "categorie-costi":      { title: "Categorie costi",          description: "Le categorie con cui dividi i costi: affitto, utenze, marketing…" },
  "automazioni-finanza":  { title: "Automazioni finanza",      description: "Configura automazioni per la gestione finanziaria" },
  sopralluoghi:           { title: "Sopralluoghi",             description: "I modelli con cui si fa un sopralluogo: campi da compilare e foto da scattare. Attiva quelli che usi" },
  "qr-codici":            { title: "QR & Codici",              description: "Codici a barre e QR del magazzino: controlla le scansioni, prova un codice, crea QR che aprono una commessa o un documento" },
  tag:                    { title: "Tag",                      description: "Etichette per ritrovare contatti e opportunità" },
  "campi-personalizzati": { title: "Campi personalizzati",     description: "Campi in più da compilare su contatti e opportunità" },
  sequenze:               { title: "Pipeline di vendita",      description: "Le fasi per cui passa una trattativa, dal primo contatto alla firma" },
  "motivi-perdita":       { title: "Motivi di perdita",        description: "Organizza i motivi delle opportunità perse mantenendo lo storico" },
  "form-builder":         { title: "Form & UTM",               description: "Moduli da mettere sul tuo sito: chi li compila diventa un contatto" },
  calendari:              { title: "Appuntamenti e prenotazioni", description: "Calendari, disponibilità e collegamenti per gli appuntamenti" },
  "lead-forms":           { title: "Lead Facebook",            description: "I contatti che arrivano dai moduli dei tuoi annunci" },
  "sicurezza-privacy":    { title: "Sicurezza & Privacy",      description: "Chi è collegato, il registro delle attività e la privacy dei dati" },
  "esporta-dati":         { title: "Esporta i dati",           description: "Esporta i dati strutturati dell'azienda: non è un backup completo degli allegati" },
  integrazioni:           { title: "Integrazioni",             description: "Connetti strumenti e servizi esterni" },
  api:                    { title: "API Platform",             description: "Per collegare Claude Code, Claude Desktop o un programma ai dati dell'azienda" },
  webhook:                { title: "Webhook",                  description: "Configura gli endpoint, controlla i test e i tentativi di consegna" },
  "dominio-email":        { title: "Dominio Email",            description: "Da quale indirizzo partono le email e come appaiono ai clienti" },
  "preferenze-email":     { title: "Mittente e aspetto delle email", description: "Nome del mittente, risposte, logo e colori delle email" },
  "numeri-telefono":      { title: "Telefonia",                description: "Numeri per SMS, chiamate e agenti vocali. Per comprare un numero italiano servono prima i dati dell'azienda, approvati" },
  fatturazione:           { title: "Fatturazione",             description: "Come fatturi: con un altro programma o con Edilizia in Cloud, e i dati che escono sulle fatture" },
  "ai-test-lab":          { title: "AI Test Lab",              description: "Confronto di costo, velocità e qualità dei modelli AI. Solo azienda dimostrativa" },
  "listini-serramenti":   { title: "Listini serramenti",       description: "Fornitori di infissi, sconti di default e matrice dei prezzi" },
};

export const TITOLO_PREDEFINITO: TitoloImpostazione = {
  title: "Impostazioni",
  description: "Configura il tuo account e la tua azienda",
};

/**
 * Titolo e frase della pagina aperta: quelli del gruppo se la pagina ha le schede, altrimenti i suoi.
 * Funzione pura, nessun effetto.
 */
export function titoloDaPercorso(pathname: string): TitoloImpostazione {
  const sezione = sezioneDaPercorso(pathname);
  if (!sezione) return TITOLO_PREDEFINITO;
  const gruppo = gruppoDellaSezione(sezione);
  if (gruppo) return { title: gruppo.titolo, description: gruppo.descrizione };
  return TITOLI_IMPOSTAZIONI[sezione] ?? TITOLO_PREDEFINITO;
}

/** La frase di una voce del menu (per mostrarla sotto il nome nella ricerca). */
export function descrizioneDellaSezione(sezione: string | null): string | undefined {
  if (!sezione) return undefined;
  const gruppo = gruppoDellaSezione(sezione);
  if (gruppo) return gruppo.descrizione;
  return TITOLI_IMPOSTAZIONI[sezione]?.description;
}
