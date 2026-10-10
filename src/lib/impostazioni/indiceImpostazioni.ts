/**
 * La ricerca delle impostazioni: un indice solo e un motore solo.
 *
 * Il ⌘K delle impostazioni, la palette dell'app, il campo nel menu a sinistra e l'elenco da telefono usano la stessa
 * lista e lo stesso modo di cercare, quindi le parole di un titolare («prezzo a mano», «ore lavorate», «iban») portano
 * alla stessa pagina ovunque:
 *
 *  - SETTINGS_INDEX: le voci che non sono nel menu (le funzioni dentro una pagina, le schede, i sinonimi) e le
 *    parole che usa chi cerca. Le voci del menu ci sono già: vociRicercabili le prende da buildSettingsGroups e
 *    ne arricchisce il nome con le parole di qui.
 *  - cercaImpostazioni: ogni parola della domanda deve comparire, senza accenti né maiuscole, all'inizio di una
 *    parola della voce (il titolo, le parole chiave, il gruppo, la frase). «logo» non trova «catalogo», «iva» non
 *    trova «privacy», «ore lavorate» trova «Rapportini e presenze».
 *  - vociRicercabili: solo quello che l'utente può aprire davvero (piano, permesso, schede, telefono, fatturazione
 *    nativa). Il gruppo di ogni voce è quello del menu: se il menu cambia, la ricerca lo segue.
 *
 * Una voce di ricerca porta a una pagina che esiste e funziona; Webhook, Automazioni finanza e il Bot WhatsApp
 * «classico» non hanno voci né parole in più.
 */
import type { Permissions } from "@/hooks/usePermissions";
import { buildSettingsGroups, impostazioneAccessibile, type SettingsNavItem } from "./navigazioneImpostazioni";
import { requisitoSoddisfatto, type StatoPiano } from "./pianoImpostazioni";
import { sezioneDaPercorso } from "./gruppiImpostazioni";
import { descrizioneDellaSezione } from "./titoliImpostazioni";

const BASE = "/azienda/impostazioni";

export interface VoceIndice {
  title: string;
  url: string;
  /**
   * La pagina del menu a cui appartiene (il suo segmento: «persone», «listino»…), quando l'indirizzo da solo
   * non basta a capirlo. Da lì si ricava il gruppo.
   */
  parent?: string;
  /** Il gruppo, solo per le voci che non appartengono a nessuna pagina del menu. */
  group?: string;
  description?: string;
  keywords?: string[];
  /** Solo tablet e computer: da telefono la scheda non c'è. */
  desktopOnly?: boolean;
  /** Compare solo se l'azienda fattura con Edilizia in Cloud: altrimenti si arriverebbe a un modulo spento. */
  soloFatturazioneNativa?: boolean;
  /** Pagina fuori da Impostazioni: ha il suo permesso e la sua funzione del piano. */
  fuori?: { permesso: keyof Permissions; funzione: string };
}

export interface VoceRicercabile {
  title: string;
  url: string;
  /** Il nome del gruppo nel menu («Preventivi & Listino»…). */
  group: string;
  description?: string;
  keywords?: string[];
  /** L'indirizzo (`to`) della voce del menu a cui appartiene; null se non ne ha (pagine fuori da Impostazioni). */
  madre: string | null;
}

// Le parole che un titolare usa. Scritte come le direbbe lui, con gli accenti: il motore li toglie.
export const SETTINGS_INDEX: VoceIndice[] = [
  // ── Il mio account ──
  { title: "Il mio profilo", url: `${BASE}/mio-profilo`, keywords: ["profilo", "personale", "account", "nome", "cognome", "foto profilo", "avatar", "telefono personale"] },
  { title: "Sicurezza profilo", url: `${BASE}/mio-profilo?tab=sicurezza`, parent: "mio-profilo", description: "La tua password e la verifica in due passaggi", keywords: ["password", "cambio password", "cambiare password", "2fa", "autenticazione", "account", "autenticazione a due fattori", "doppia autenticazione", "verifica in due passaggi", "authenticator", "app di autenticazione", "codice di verifica"] },
  { title: "Regole di sicurezza dell'azienda", url: `${BASE}/mio-profilo?tab=sicurezza#regole-azienda`, parent: "mio-profilo", description: "Dopo quante password sbagliate si blocca l'accesso e da quali indirizzi si può entrare", keywords: ["regole di sicurezza", "tentativi sbagliati", "password sbagliate", "blocco dopo password sbagliate", "blocco account", "blocca l'accesso", "tentativi di accesso", "ip consentiti", "indirizzi consentiti", "indirizzi ip", "accesso da una rete", "sicurezza azienda", "sicurezza dell'azienda"], desktopOnly: true },
  { title: "Il mio profilo · Posta e firma email", url: `${BASE}/mio-profilo?tab=email`, parent: "mio-profilo", description: "Collega la tua casella e scrivi la firma delle email", keywords: ["posta", "casella", "casella di posta", "email aziendale", "gmail", "outlook", "imap", "smtp", "collegare la posta", "collegare la casella", "collega la posta", "firma email", "inviare email dal gestionale"], desktopOnly: true },
  { title: "Il mio profilo · Calendari", url: `${BASE}/mio-profilo?tab=calendari`, parent: "mio-profilo", description: "Collega Google, Outlook o Apple Calendar ai tuoi appuntamenti", keywords: ["calendario", "calendario personale", "google calendar", "calendario google", "outlook", "icloud", "apple", "apple calendar", "sincronizza", "collega calendario", "appuntamenti", "importa eventi"], desktopOnly: true },

  // ── La mia azienda ──
  { title: "Profilo aziendale", url: `${BASE}/profilo`, keywords: ["azienda", "ragione sociale", "p.iva", "partita iva", "sede legale", "codice fiscale", "pec", "codice sdi", "indirizzo", "telefono azienda", "sito web", "settore"] },
  // Le sezioni del Profilo aziendale: ognuna ha la sua àncora, la ricerca ci porta già scorsi.
  // Logo, portale clienti e bonus li vede solo chi può modificare il profilo; recensioni, portale e bonus non ci sono da telefono.
  { title: "Logo aziendale", url: `${BASE}/profilo#logo`, parent: "profilo", description: "Il logo di preventivi, email e portale clienti", keywords: ["logo", "logo azienda", "carica logo", "carica il logo", "cambiare il logo", "immagine aziendale", "marchio dell'azienda"] },
  { title: "Recensioni online", url: `${BASE}/profilo#recensioni`, parent: "profilo", description: "Il tuo voto su Google o Trustpilot nella pagina «Dicono di noi» dei preventivi", keywords: ["recensioni", "voto google", "trustpilot", "stelle", "dicono di noi", "valutazioni", "voto online", "opinioni clienti", "reputazione"], desktopOnly: true },
  { title: "Portale clienti", url: `${BASE}/profilo#portale-clienti`, parent: "profilo", description: "L'area privata dove i clienti entrano con email e password", keywords: ["portale clienti", "portale cliente", "portale", "area clienti", "area privata", "area riservata", "accesso clienti", "accesso dei clienti", "login clienti"], desktopOnly: true },
  { title: "Bonus edilizi e blocca prezzo", url: `${BASE}/profilo#bonus`, parent: "profilo", description: "Per chi lavora con le detrazioni edilizie: si attivano solo se servono", keywords: ["bonus", "bonus fiscali", "bonus edilizi", "bonus multipli", "ecobonus", "detrazioni", "bonifico parlante", "ritenuta 11%", "blocca prezzo", "caparra"], desktopOnly: true },
  { title: "Prefisso del codice commessa", url: `${BASE}/profilo#prefisso-commessa`, parent: "profilo", description: "Le lettere con cui comincia il numero delle commesse", keywords: ["prefisso commessa", "prefisso commesse", "numero commessa", "codice commessa", "numerazione commesse", "progressivo commesse"] },
  { title: "Sedi", url: `${BASE}/sedi`, keywords: ["sede", "filiale", "negozio", "ufficio", "showroom", "magazzino", "orari di apertura", "orari", "punto vendita", "responsabile sede", "sede principale", "preventivi per sede", "colore sede"] },
  { title: "White-Label", url: `${BASE}/branding`, keywords: ["brand", "logo", "colori", "personalizzazione", "favicon", "icona del browser", "nome della piattaforma", "sfondo accesso", "pagina di accesso", "sottodominio", "dominio personalizzato", "indirizzo web", "powered by", "marchio", "white label", "marchio e colori", "nome piattaforma", "logo chiaro"] },
  { title: "Indirizzo web proprio", url: `${BASE}/branding?tab=indirizzo`, parent: "branding", description: "Il sottodominio ediliziaincloud.com o un dominio tuo (per esempio crm.tuaazienda.it)", keywords: ["dominio", "dominio personalizzato", "dominio proprio", "sottodominio", "indirizzo web", "cname", "url personalizzato"] },
  { title: "Piano abbonamento", url: `${BASE}/abbonamento`, keywords: ["piano", "abbonamento", "subscription", "fattura abbonamento", "pagamento", "carta", "carta di credito", "metodo di pagamento", "bonifico", "cambiare piano", "cambia piano", "upgrade", "disdetta", "annulla abbonamento", "rinnovo", "prova gratuita", "dati di fatturazione", "fatture di edilizia in cloud", "portafoglio", "fatture edilizia in cloud"] },
  { title: "Crediti e ricariche", url: `${BASE}/crediti`, keywords: ["crediti", "saldo", "ricarica", "ricarica automatica", "auto ricarica", "ricaricare", "consumi", "consumi ai", "portafoglio", "carta", "saldo basso", "credito esaurito", "ai", "render", "sms", "whatsapp", "email"] },

  // ── Listino ──
  { title: "Listino · Prodotti", url: `${BASE}/listino`, keywords: ["catalogo", "articoli", "sku", "prezzi", "famiglie", "prodotti", "listino prezzi", "prezzi di vendita", "tipologie", "linee", "colori", "codice articolo", "foto prodotto", "foto del profilo", "immagine", "prezzo al mq", "a pezzo", "griglia", "misure", "margine prodotto", "nascondi dai preventivi", "cestino", "duplica prodotto", "aggiungi prodotto", "prodotto", "foto", "senza foto", "tipologia", "linea", "area", "disattiva prodotto", "nei preventivi"] },
  { title: "Import listini", url: `${BASE}/listino/import`, keywords: ["import", "importa listino", "importare", "importa prodotti", "excel", "csv", "pdf", "carica listino", "listino fornitore", "listino fornitore in pdf", "listino in excel", "importa", "catalogo articoli", "prezzi fornitore", "leggi pdf con ai"] },
  { title: "Listino · Manodopera e servizi", url: `${BASE}/tariffe`, keywords: ["tariffe", "manodopera", "servizi", "posa", "orario", "ricarico", "costo orario", "prezzo orario", "ore di lavoro", "varianti di costo", "subappalto", "squadra interna", "prezzario", "prezzario regionale", "adegua prezzi", "trasporto", "smaltimento", "ponteggio", "voci", "catalogo standard"] },
  { title: "Listino Manutenzione", url: `${BASE}/tariffe?tab=manutenzione`, keywords: ["manutenzione", "abbonamenti", "contratti", "impianti", "interventi", "tipi di impianto", "caldaia", "condizionatore", "riparazione", "guasto", "listino manutenzione", "prezzi di manutenzione"] },
  { title: "Listino · Kit e pacchetti", url: `${BASE}/bundle`, keywords: ["bundle", "pacchetti", "pacchetto", "chiavi in mano", "kit", "offerte pronte", "kit fotovoltaico", "kwp", "potenza", "prezzo offerta", "pacchetti di esempio"] },
  { title: "Catalogo render", url: `${BASE}/catalogo-render`, keywords: ["render", "foto prodotto", "foto per i render", "catalogo foto", "riferimento", "mobile bagno", "sanitari", "piastrelle", "catalogo render"] },

  // ── Modelli di preventivo, prezzo, sconti, firma ──
  // 09/10/2026: prezzo e margini, sconti e approvazioni sono schede di «Modelli di preventivo». Le funzioni che si
  // cercano di più hanno una voce a sé, che apre la pagina già scorsa alla sezione giusta (àncora nell'indirizzo).
  { title: "Modelli di preventivo", url: `${BASE}/template-preventivi`, keywords: ["template", "offerta", "pdf preventivo", "modello", "modelli", "serramenti", "fotovoltaico", "bagno", "bagni", "tetto", "tetti", "climatizzazione", "elettrico", "impianto elettrico", "termoidraulico", "pavimenti", "piscina", "piscine", "ristrutturazione", "cappotto", "pompa di calore", "logo del preventivo", "colori del preventivo", "copertina", "intestazione", "carta intestata", "testi del preventivo", "coordinate bancarie", "condizioni di pagamento", "layout", "pagine del pdf", "chi siamo", "nascondi preventivatore", "menu nuovo preventivo", "stili pronti", "filigrana", "timbro", "firma impresa", "margini del foglio", "piè di pagina", "modulo di recesso", "modello predefinito", "recensioni"] },
  { title: "Quali preventivi compaiono in «Nuovo preventivo»", url: `${BASE}/template-preventivi?tab=moduli-vendita`, parent: "template-preventivi", description: "Gli interruttori «Area nel menu Nuovo preventivo»", keywords: ["nascondi preventivatore", "menu nuovo preventivo", "area nel menu", "interruttore area", "aree", "serramenti", "bagni", "fotovoltaico", "moduli"] },
  { title: "Modelli di preventivo · Prezzo e margini", url: `${BASE}/margini`, description: "Prezzo a mano, margini, posa e trasporto, numero e PDF del preventivo", keywords: ["prezzo", "prezzi", "margini", "ricarico", "markup", "spese generali", "overhead"] },
  { title: "Prezzo scritto a mano", url: `${BASE}/margini#prezzo`, parent: "margini", description: "Il prezzo del preventivo si scrive a mano, al posto della somma delle voci", keywords: ["prezzo a mano", "prezzo manuale", "prezzo scritto a mano", "scrivere il prezzo", "inserire il prezzo", "inserimento prezzo manuale", "prezzo finale", "prezzo a corpo", "senza listino", "non carico i prezzi", "prezzo preventivo"] },
  { title: "Margini e spese generali", url: `${BASE}/margini#margini`, parent: "margini", description: "Margine minimo e target, spese generali, margine per categoria", keywords: ["margine minimo", "margine target", "semaforo", "spese generali", "overhead", "margine per categoria", "ricarico"] },
  { title: "Posa, trasporto e smaltimento", url: `${BASE}/margini#posa-e-trasporto`, parent: "margini", description: "Cosa aggiunge o chiede da solo il preventivo generico", keywords: ["posa automatica", "aggiungi posa", "piano di installazione", "smaltimento", "trasporto", "distanza", "km", "tiro al piano"] },
  { title: "Numero del preventivo", url: `${BASE}/margini#numerazione`, parent: "margini", description: "Prefisso e numerazione dei preventivi", keywords: ["numerazione", "prefisso", "numero preventivo", "numerazione preventivi", "progressivo", "off-2026"] },
  { title: "PDF e firma del preventivo", url: `${BASE}/margini#pdf-e-firma`, parent: "margini", description: "Cosa mostra il PDF del preventivo generico e la firma elettronica del cliente", keywords: ["pdf", "prezzi per riga", "solo totale", "totale finale", "sconti nel pdf", "immagini", "schede tecniche", "firma digitale", "firma elettronica", "otp", "firma online", "accetta preventivo"] },
  { title: "Modelli di preventivo · Sconti", url: `${BASE}/scontistica`, description: "Limiti di sconto per venditore, importo e categoria cliente", keywords: ["sconto", "sconti", "sconto massimo", "sconto massimo agente", "sconto per venditore", "limite sconto", "limiti di sconto", "sconti ai clienti", "sconti agli agenti", "agenti", "venditori", "fasce sconto", "scontistica", "simulatore sconto"] },
  { title: "Modelli di preventivo · Approvazioni", url: `${BASE}/approvazioni`, description: "Seconda firma oltre una soglia e avvisi su costi e margine", keywords: ["approvazione", "approvazioni", "doppia approvazione", "seconda firma", "soglia importo", "soglia di margine", "scostamento sal", "scostamento costi", "avvisi", "avvisi sulle commesse", "margine commesse", "margine minimo commesse", "governance"] },
  { title: "Firma e condizioni · Condizioni", url: `${BASE}/condizioni-firma`, keywords: ["clausole", "vessatorie", "recesso", "privacy", "firma", "condizioni contrattuali", "condizioni di vendita", "termini e condizioni", "clausole contrattuali", "testi che il cliente accetta", "ripensamento", "14 giorni", "penali", "foro competente", "informativa", "termini legali", "foro", "seconda firma"] },
  { title: "Firma e condizioni · Firma elettronica", url: `${BASE}/firma-elettronica`, keywords: ["firma", "fea", "otp", "elettronica", "firma online", "firma del cliente", "firma sul preventivo", "codice otp", "qr", "accetta preventivo", "consenso", "ripensamento", "archivio firme", "codice sms"] },
  { title: "Firma dei preventivi", url: `${BASE}/firma-elettronica#firma-sul-preventivo`, parent: "firma-elettronica", description: "Il cliente firma il preventivo online, con il codice OTP, dal link che riceve", keywords: ["firma online", "firma sul preventivo", "accetta preventivo", "qr", "codice qr", "otp", "link di firma", "spegni la firma"] },
  { title: "Diritto di ripensamento", url: `${BASE}/firma-elettronica#ripensamento`, parent: "firma-elettronica", description: "Il testo che il cliente privato legge prima di firmare", keywords: ["ripensamento", "recesso", "14 giorni", "consenso", "consumatore", "cliente privato", "informativa recesso", "b2c"] },
  { title: "Finanziamenti", url: `${BASE}/finanziamenti`, keywords: ["finanziamento", "rate", "finanziaria", "compass", "findomestic", "tan", "taeg", "tabella finanziaria", "tabella tassi", "calcolatore", "calcolatore rate", "simulatore finanziamento", "rata", "rate mensili", "fiditalia", "agos", "durata"] },
  { title: "Finanziamenti · Calcolatore rate", url: `${BASE}/finanziamenti/calcolatore`, parent: "finanziamenti", description: "Quanto paga il cliente al mese, a confronto tra durate", keywords: ["calcolatore", "calcolatore rate", "calcola rata", "confronto durate", "quanto paga il cliente", "simulatore finanziamento"] },
  { title: "Finanziamenti · Nuova tabella", url: `${BASE}/finanziamenti/nuova`, parent: "finanziamenti", description: "Carica la tabella dei tassi di una finanziaria", keywords: ["carica tabella", "nuova tabella", "pdf finanziaria", "csv rate", "aggiungi finanziaria"] },

  // ── Commesse e cantieri ──
  { title: "Cartelle documenti", url: `${BASE}/cartelle-documenti`, keywords: ["cartelle", "documenti", "allegati", "file commessa", "carica documenti", "pratica", "documenti obbligatori", "cartella obbligatoria", "visibile al cliente", "cartelle commessa", "archivio documenti", "archivia cartella", "spazio archiviazione", "archiviazione", "mancano"] },
  { title: "Stati commessa", url: `${BASE}/stati-ordine`, keywords: ["stato", "stati commessa", "stati della commessa", "stato della commessa", "stato ordine", "ordini", "commesse", "passaggi", "percorso", "avviso al cliente", "email al cliente", "cambio di stato", "cambio stato", "assistenza", "area clienti", "portale cliente", "stati ordine", "avviso cliente", "colori", "icone", "elenco pronto"] },
  { title: "Stati commessa · Cosa vede il cliente", url: `${BASE}/stati-ordine#cliente`, parent: "stati-ordine", description: "Se il cliente è avvisato a ogni cambio di stato e come vede la sua commessa", keywords: ["avviso al cliente", "avvisa il cliente", "email al cliente", "cambio di stato", "area clienti", "portale cliente"] },
  { title: "Categorie costi", url: `${BASE}/categorie-costi`, keywords: ["costi", "categoria costo", "categorie di costo", "categoria di costo", "voci spesa", "voci di spesa", "voci di costo", "tipi di costo", "spese", "affitto", "utenze", "importa categorie"] },
  { title: "Fornitori", url: `${BASE}/fornitori`, keywords: ["fornitore", "anagrafica fornitori", "ordini di acquisto", "oda", "listino fornitore", "scadenze fornitori", "iban fornitore", "fido", "condizioni di pagamento", "condizioni di pagamento fornitore", "unisci fornitori", "unire fornitori", "unisci doppioni", "doppioni", "duplicati", "merge", "partita iva", "iban", "esporta fornitori", "report acquisti", "chi compriamo di più", "cosa è cambiato", "codici a barre", "gs1"] },
  // Automazioni finanza: nessuna parola in più. La pagina non parla di ritenute, fideiussioni o trattenute.
  { title: "Automazioni finanza", url: `${BASE}/automazioni-finanza`, keywords: ["automazione"] },
  { title: "Calendari lavori", url: `${BASE}/calendari-lavori`, keywords: ["squadre", "posa", "google calendar", "calendario lavori", "cantieri", "calendario squadre", "squadra interna", "squadre esterne", "calendari collegati", "squadre di posa", "ditte", "calendario delle pose", "dipendenti della squadra", "squadra"] },
  { title: "Calendari lavori · Google Calendar", url: `${BASE}/calendari-lavori?tab=google`, parent: "calendari-lavori", description: "L'account Google dell'azienda, il calendario di tutte le pose e i calendari del team", keywords: ["google calendar", "account google", "calendario delle pose", "calendari del team"] },
  { title: "Rapportini e presenze", url: `${BASE}/rapportini-cantiere`, keywords: ["rapportino", "ore", "timbrature", "timbratura", "capocantiere", "operai", "presenze", "squadra", "cantiere", "ore lavorate", "ore di lavoro", "ore timbrate", "foglio ore", "giornale lavori", "chi scrive il rapportino", "ore che non tornano", "scostamento ore", "app operai", "app cantiere", "rapportini"] },
  { title: "Fasi e avanzamento", url: `${BASE}/modelli-fasi`, keywords: ["fasi", "modello", "modelli di fasi", "sottofasi", "sottofase", "avanzamento", "avanzamento commessa", "percentuale avanzamento", "come si calcola l'avanzamento", "commessa", "cantiere", "lavorazioni", "fasi di lavoro", "fasi di partenza", "cantiere da organizzare", "chi spunta", "chi può spuntare", "capocantiere", "peso", "media", "importa modelli standard"] },
  { title: "Fasi e avanzamento · Quando apri una commessa", url: `${BASE}/modelli-fasi#nuova-commessa`, parent: "modelli-fasi", description: "Con quali fasi parte una commessa nuova e cosa ricorda «Cantiere da organizzare»", keywords: ["fasi di partenza", "cantiere da organizzare", "commessa nuova", "nuova commessa", "apri una commessa"] },
  { title: "Fasi e avanzamento · Chi spunta e come si calcola", url: `${BASE}/modelli-fasi#regole`, parent: "modelli-fasi", description: "Chi può spuntare le sottofasi dal cantiere e come si calcola l'avanzamento", keywords: ["chi può spuntare", "chi spunta", "sottofasi", "come si calcola l'avanzamento", "peso delle fasi", "avanzamento"] },
  { title: "Modelli di pagamento", url: `${BASE}/modelli-pagamento`, keywords: ["pagamento", "pagamenti", "modello di pagamento", "modelli di pagamento", "rate", "acconto", "caparra", "anticipo", "saldo", "saldo finale", "SAL", "stato avanzamento lavori", "pagamento a rate", "piano rate", "rata al sal", "quando matura", "incassi", "scadenze di incasso", "come si paga", "commessa", "importa modelli standard"] },
  { title: "Modelli di pagamento · Come si paga", url: `${BASE}/modelli-pagamento#modelli`, parent: "modelli-pagamento", description: "I modelli di rate tra cui scegli e quello con cui partono le commesse nuove", keywords: ["modello di pagamento", "piano rate", "stella", "modello predefinito", "acconto e saldo"] },
  { title: "Modelli di pagamento · Quando matura la rata di un SAL", url: `${BASE}/modelli-pagamento#sal`, parent: "modelli-pagamento", description: "Se la rata al SAL matura quando il SAL è emesso o quando è approvato", keywords: ["quando matura", "rata al sal", "maturazione rata", "sal emesso", "sal approvato"] },
  { title: "Sopralluoghi", url: `${BASE}/sopralluoghi`, keywords: ["sopralluogo", "sopralluoghi", "scheda sopralluogo", "modello sopralluogo", "modelli di sopralluogo", "rilievo", "rilievi", "campi del rilievo", "misure", "foto richieste", "template sopralluogo"] },
  { title: "QR & Codici", url: `${BASE}/qr-codici`, keywords: ["qr", "qr code", "qr dinamici", "codice a barre", "codici a barre", "barcode", "scanner", "scansione", "scansioni", "etichette", "gs1", "magazzino", "prova una scansione", "qr con link"] },

  // ── Fatturazione ──
  { title: "Fatturazione", url: `${BASE}/fatturazione`, keywords: ["fatturazione", "iva", "documenti", "fattura", "fatture", "fattura elettronica", "provider", "fatture in cloud", "fattura24", "gestionale", "collega gestionale", "programma di fatturazione", "come fatturi"] },
  { title: "Fatturazione · Dati fiscali (regime, REA, DURC)", url: `${BASE}/fatturazione?tab=nativa&sezione=fiscale`, parent: "fatturazione", keywords: ["regime fiscale", "forfettario", "regime forfettario", "durc", "rea", "capitale sociale", "registro imprese", "società in liquidazione"], desktopOnly: true, soloFatturazioneNativa: true },
  { title: "Fatturazione · Conto corrente e IBAN", url: `${BASE}/fatturazione?tab=nativa&sezione=pagamenti`, parent: "fatturazione", keywords: ["iban", "conto corrente", "banca", "bic", "intestatario", "coordinate bancarie", "metodo di pagamento"], desktopOnly: true, soloFatturazioneNativa: true },
  { title: "Fatturazione · Numerazione delle fatture", url: `${BASE}/fatturazione?tab=nativa&sezione=numeratori`, parent: "fatturazione", keywords: ["numero fattura", "prefisso fattura", "numerazione fatture", "prossimo numero", "note di credito", "ddt", "serie"], desktopOnly: true, soloFatturazioneNativa: true },
  { title: "Fatturazione · Aspetto delle fatture", url: `${BASE}/fatturazione?tab=nativa&sezione=pdf`, parent: "fatturazione", description: "Il logo e il colore che escono sulle fatture", keywords: ["logo", "logo fattura", "colore", "colore fattura", "aspetto delle fatture", "anteprima fattura", "intestazione", "carta intestata"], desktopOnly: true, soloFatturazioneNativa: true },
  { title: "Fatturazione · IVA per cassa, split payment, bollo", url: `${BASE}/fatturazione?tab=nativa&sezione=avanzate`, parent: "fatturazione", keywords: ["iva per cassa", "split payment", "bollo", "socio unico", "iva"], desktopOnly: true, soloFatturazioneNativa: true },
  { title: "Fatturazione · Fattura elettronica e invio allo SDI", url: `${BASE}/fatturazione?tab=nativa&sezione=elettronica`, parent: "fatturazione", keywords: ["fatturazione elettronica", "fattura elettronica", "sdi", "invio allo sdi", "attiva l'invio", "codice destinatario", "pec", "fatture dei fornitori", "conservazione", "conservazione a norma", "aruba", "p7m", "xml"], desktopOnly: true, soloFatturazioneNativa: true },
  { title: "Fatturazione · Esporta per il commercialista", url: `${BASE}/fatturazione?tab=nativa&sezione=export-contabile`, parent: "fatturazione", keywords: ["export contabile", "prima nota", "csv", "commercialista", "esporta fatture", "riepilogo xml"], desktopOnly: true, soloFatturazioneNativa: true },

  // ── CRM e vendite ──
  { title: "Tag", url: `${BASE}/tag`, keywords: ["tag", "etichette", "categoria contatti"] },
  { title: "Campi personalizzati", url: `${BASE}/campi-personalizzati`, keywords: ["campo", "campi extra", "campo personalizzato", "aggiungere un campo", "dati aggiuntivi", "custom field", "field", "variabili", "segnaposto", "variabili per i testi", "campi di sistema"] },
  { title: "Motivi di perdita", url: `${BASE}/motivi-perdita`, keywords: ["persa", "perdita", "motivo", "lost reason", "opportunita persa", "trattativa persa", "perché abbiamo perso"] },
  { title: "Pipeline di vendita", url: `${BASE}/sequenze`, keywords: ["pipeline", "pipeline di vendita", "sequenza", "sequenze", "fase opportunita", "fasi della trattativa", "fasi delle opportunità", "fasi di vendita", "trattative", "imbuto", "percorso di vendita", "stati opportunità", "kanban", "vinta", "stage", "fasi", "persa"] },
  { title: "Form & UTM", url: `${BASE}/form-builder`, keywords: ["form", "utm", "lead form", "acquisizione", "modulo contatti", "modulo contatto", "moduli contatto del sito", "modulo sito", "modulo di richiesta preventivo", "richiesta preventivo", "form sul sito", "iframe", "embed", "tracciamento", "da dove arrivano", "origine contatti"] },
  { title: "Appuntamenti e prenotazioni", url: `${BASE}/calendari`, keywords: ["calendario", "google calendar", "appuntamenti", "prenotazioni", "prenota", "disponibilità", "orari", "durata appuntamento", "link di prenotazione", "link prenotazione", "calendario pubblico", "promemoria whatsapp", "spostamenti", "ferie", "pausa pranzo", "outlook", "icloud"] },
  { title: "Appuntamenti e prenotazioni · Orari", url: `${BASE}/calendari?tab=availability`, parent: "calendari", description: "Quando i clienti possono prenotare", keywords: ["orari", "disponibilità", "link prenotazione", "prenota", "ferie", "pausa pranzo"] },
  { title: "Appuntamenti e prenotazioni · Spostamenti", url: `${BASE}/calendari?tab=preferences`, parent: "calendari", description: "Durata degli appuntamenti e tempo per spostarsi", keywords: ["km", "spostamenti", "durata appuntamento", "percorrenza"] },
  { title: "Lead Facebook", url: `${BASE}/lead-forms`, keywords: ["meta", "facebook", "instagram", "lead ads", "moduli lead", "pagina facebook", "contatti da facebook"] },

  // ── Persone ──
  { title: "Persone & Accessi", url: `${BASE}/persone`, keywords: ["utenti", "venditori", "staff", "operai", "team", "ruoli", "permessi", "dipendenti", "subappaltatori", "commercialista", "collaboratori", "collaboratore", "invitare", "invita", "invito", "nuovo utente", "provvigioni", "squadre", "ferie", "multi azienda", "utente", "aggiungi utente", "creare account", "dare accesso", "password temporanea", "cosa può vedere", "togliere un permesso", "ruolo", "sola lettura", "solo i suoi dati", "blocca accesso", "ex dipendente", "non lavora più", "revoca accesso", "sblocca", "accessi", "importa utenti", "file csv", "amministratore", "elimina utente", "licenziato"] },
  { title: "Modelli di permessi", url: `${BASE}/persone?tab=template-permessi`, parent: "persone", description: "Gruppi di permessi già pronti da applicare a una persona (solo amministratore)", keywords: ["modello", "template", "template permessi", "permessi pronti", "ruoli", "ruoli personalizzati", "applica a una persona", "permessi", "accessi", "utenti", "cosa può vedere"], desktopOnly: true },
  { title: "Commercialista", url: `${BASE}/persone?tab=commercialista`, parent: "persone", description: "Dai al tuo commercialista l'accesso ai dati e revocalo quando vuoi", keywords: ["commercialista", "studio", "delega", "accesso del commercialista", "accesso allo studio", "invita commercialista", "revoca", "consulente", "dare accesso"], desktopOnly: true },
  { title: "Venditori e provvigioni", url: `${BASE}/persone?tab=venditori`, parent: "persone", description: "Chi vende per te e come viene pagato", keywords: ["venditori", "venditore", "agenti", "provvigioni", "regole provvigioni", "commissioni", "compenso", "percentuale", "percentuale sul venduto", "fisso mensile", "regole di provvigione"], desktopOnly: true },
  { title: "Dipendenti e operai", url: `${BASE}/persone?tab=dipendenti`, parent: "persone", description: "Operai, staff interno e squadre esterne, con stipendio e costo orario", keywords: ["dipendenti", "operai", "personale", "ferie", "documenti dipendenti", "scadenze documenti", "rapportini", "rapportini dipendenti", "stipendio", "costo orario", "staff interno", "squadre esterne"], desktopOnly: true },
  { title: "Subappaltatori e app cantiere", url: `${BASE}/persone?tab=subappaltatori`, parent: "persone", description: "Dai a un subappaltatore l'accesso all'app cantiere", keywords: ["subappaltatori", "subappalto", "accesso app cantiere", "account cantiere", "collega account", "togli accesso", "imprese esterne", "ditte esterne", "squadre esterne"], desktopOnly: true },
  { title: "Team e squadre", url: `${BASE}/persone?tab=team`, parent: "persone", keywords: ["team", "squadra", "squadre di lavoro", "responsabile squadra"], desktopOnly: true },
  { title: "Persone di altre aziende", url: `${BASE}/persone?tab=accessi-azienda`, parent: "persone", description: "Un consulente o un'altra tua società che entra con il suo account", keywords: ["accessi azienda", "altra azienda", "multi azienda", "accesso multi azienda", "più aziende", "consulente", "consulente esterno", "collega account", "invita persona esistente"], desktopOnly: true },
  { title: "Controllo accessi", url: `${BASE}/persone?tab=sicurezza-accessi`, parent: "persone", description: "Chi ha accesso, chi non entra da tempo, chi ha permessi importanti", keywords: ["controllo accessi", "accessi a rischio", "mai connessi", "inattivi", "amministratori senza verifica", "chi guardare per primo"], desktopOnly: true },

  // ── Sicurezza e dati ──
  { title: "Sicurezza & Privacy", url: `${BASE}/sicurezza-privacy`, keywords: ["privacy", "gdpr", "sicurezza", "consensi", "log", "registro attività", "chi è collegato"] },
  { title: "Registro attività", url: `${BASE}/sicurezza-privacy?tab=attivita`, parent: "sicurezza-privacy", description: "Chi ha fatto cosa in azienda", keywords: ["registro attività", "chi ha fatto cosa", "storico modifiche", "cronologia", "audit", "audit log", "log", "modifiche"], desktopOnly: true },
  { title: "Chi è collegato", url: `${BASE}/sicurezza-privacy?tab=dashboard`, parent: "sicurezza-privacy", description: "Persone collegate adesso, tentativi di accesso e azioni sugli utenti", keywords: ["chi è collegato", "collegati adesso", "accessi", "accessi e sessioni", "sessioni", "sessioni attive", "disconnetti", "tentativi falliti", "tentativi di accesso", "tentativi di login", "account bloccati", "security dashboard"], desktopOnly: true },
  { title: "Privacy e consensi", url: `${BASE}/sicurezza-privacy?tab=privacy`, parent: "sicurezza-privacy", description: "I tuoi consensi, la copia dei tuoi dati e la richiesta di cancellazione", keywords: ["privacy", "gdpr", "consensi", "privacy e consensi", "dati personali", "cancellazione dati", "scarica i miei dati", "cancella account", "oblio"] },
  { title: "Esporta i dati", url: `${BASE}/esporta-dati`, keywords: ["esporta", "export", "backup", "csv", "zip", "portabilita", "migrazione", "commercialista", "scaricare i dati", "tutti i dati", "uscire dalla piattaforma", "excel", "archivio", "copia di sicurezza"] },

  // ── Integrazioni e canali ──
  { title: "Integrazioni", url: `${BASE}/integrazioni`, keywords: ["integrazione", "api esterna", "stripe", "gocardless", "google", "claude", "chatgpt", "caselle email", "posta", "gmail", "outlook", "whatsapp business", "facebook", "instagram", "google ads", "google business", "scheda google", "recensioni", "conti bancari", "banca", "open banking", "pagamenti con carta", "carta"], desktopOnly: true },
  { title: "API Platform", url: `${BASE}/api`, keywords: ["api", "chiavi api", "chiave api", "chiavi", "chiavi di accesso", "token", "developer", "integrare altri programmi", "claude", "mcp", "collega assistente"] },
  // Webhook: nessuna parola in più.
  { title: "Webhook", url: `${BASE}/webhook`, keywords: ["webhook", "eventi", "callback"] },
  { title: "Dominio email", url: `${BASE}/dominio-email`, keywords: ["dominio", "smtp", "spf", "dkim", "email", "mittente", "email dal tuo dominio", "invio email", "dns", "record dns", "verifica dominio", "spam"] },
  { title: "Email · Mittente e aspetto", url: `${BASE}/preferenze-email`, parent: "dominio-email", description: "Nome del mittente, risposte, logo e colori delle email", keywords: ["mittente", "nome mittente", "risposte", "reply-to", "logo email", "colori email", "piè di pagina", "footer", "newsletter", "disiscrizione", "unsubscribe"] },
  { title: "Telefonia", url: `${BASE}/numeri-telefono`, keywords: ["telefono", "numero", "telefonia", "sistema telefonico", "centralino", "voce", "telnyx", "chiamate", "numeri aziendali", "numero per gli agenti ai", "centralino ai", "prefisso", "sms", "acquista numero", "dati normativi", "numero italiano"] },
  { title: "Telefonia · Dati normativi", url: `${BASE}/numeri-telefono#dati-normativi`, parent: "numeri-telefono", description: "I dati dell'azienda da far approvare prima di comprare un numero italiano", keywords: ["dati normativi", "numero italiano", "acquista numero", "approvazione dati", "documenti per il numero"] },
  // Il bot di WhatsApp si governa dai numeri, non dalla pagina «classica»: la voce porta lì.
  { title: "WhatsApp (numeri, bot, modelli)", url: "/azienda/whatsapp", group: "Integrazioni & API", description: "I numeri WhatsApp dell'azienda, il bot e i messaggi di massa", keywords: ["whatsapp", "numeri whatsapp", "bot", "bot whatsapp", "silvio", "rapportini whatsapp", "modelli", "invii di massa", "broadcast"], fuori: { permesso: "canViewMarketingWhatsapp", funzione: "whatsapp" } },

  // ── AI e avvisi ──
  { title: "AI Personas (chat + memoria)", url: `${BASE}/ai-memoria`, keywords: ["ai", "memoria", "personas", "silvio", "ricordo", "ricordi", "preferenza", "decisione", "assistente", "assistenti", "assistente ai", "intelligenza artificiale", "chat", "chat con l'ai", "cosa ricorda l'ai", "cosa sa l'assistente", "chat con l'assistente", "cfo", "capocantiere"] },
  { title: "AI Personas · Memoria", url: `${BASE}/ai-memoria?tab=memoria`, parent: "ai-memoria", description: "Cosa ricorda l'assistente della tua azienda", keywords: ["assistente ai", "memoria", "ricordi", "cosa sa l'assistente", "abitudini", "preferenze", "ricordo"], desktopOnly: true },
  { title: "Notifiche", url: `${BASE}/notifiche`, keywords: ["notifiche", "telegram", "email", "silvio chat", "canale", "fallback", "avvisi", "promemoria", "campanella", "push", "email attività"] },
  { title: "Notifiche · Avvisi", url: `${BASE}/notifiche#avvisi`, parent: "notifiche", description: "Quali avvisi ricevi nella campanella, con l'app chiusa e per email", keywords: ["avvisi", "campanella", "push", "notifiche attività", "email attività", "disattiva tutto", "promemoria attività"] },
  // Le sezioni di Notifiche (ognuna con la sua àncora). I messaggi programmati sono dell'amministratore e non ci sono da telefono.
  { title: "Notifiche · Orari di silenzio", url: `${BASE}/notifiche#orari-di-silenzio`, parent: "notifiche", description: "La fascia in cui non vuoi essere disturbato", keywords: ["silenzio", "orari di silenzio", "non disturbare", "quiet hours", "fascia oraria", "notte"] },
  { title: "Notifiche · Messaggi automatici", url: `${BASE}/notifiche#messaggi-automatici`, parent: "notifiche", description: "Su quali canali ti scrive Silvio con briefing e promemoria, e in che ordine", keywords: ["messaggi automatici", "canali", "telegram", "ordine di preferenza", "chat silvio", "briefing", "promemoria", "fallback"] },
  { title: "Notifiche · Messaggi programmati", url: `${BASE}/notifiche#messaggi-programmati`, parent: "notifiche", description: "I messaggi che l'amministratore manda a orari fissi a operai, staff e colleghi", keywords: ["messaggi programmati", "pianificati", "orari fissi", "briefing del mattino", "promemoria agli operai", "messaggio agli operai", "invio programmato"], desktopOnly: true },
];

/** Le voci che si cercano di più: in cima alla finestra a casella vuota. L'ordine è questo. */
export const PIU_CERCATE: string[] = [
  `${BASE}/margini#prezzo`,
  `${BASE}/scontistica`,
  `${BASE}/firma-elettronica`,
  `${BASE}/persone`,
  `${BASE}/branding`,
  `${BASE}/fatturazione`,
  `${BASE}/notifiche`,
  `${BASE}/esporta-dati`,
];

// ─── Il motore ───────────────────────────────────────────────────────────────

/** Senza accenti e in minuscolo: «Attività» e «attivita» sono la stessa parola. */
export const piega = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Le parole di un testo. L'apostrofo divide («l'iva» → «l», «iva»); il «%» resta («11%»). */
const parole = (s: string): string[] => piega(s).split(/[^a-z0-9%]+/).filter(Boolean);

/** Un testo come frase sola, per confrontare una domanda con una parola chiave intera. */
const comeFrase = (s: string): string => parole(s).join(" ");

const PAROLE_VUOTE = new Set([
  "a", "al", "alla", "alle", "ai", "agli", "il", "lo", "la", "le", "i", "gli", "un", "uno", "una",
  "di", "del", "della", "dei", "delle", "per", "con", "da", "dal", "in", "nel", "nella", "e", "o", "su", "che", "come", "si",
]);

/** Le parole che contano in una domanda: senza le particelle («prezzo a mano» → prezzo, mano) e senza lettere sole. */
function paroleDellaDomanda(testo: string): string[] {
  const tutte = parole(testo);
  const senzaLettereSole = tutte.filter((p) => p.length > 1 || /\d/.test(p));
  const utili = senzaLettereSole.filter((p) => !PAROLE_VUOTE.has(p));
  return utili.length > 0 ? utili : senzaLettereSole.length > 0 ? senzaLettereSole : tutte;
}

/** Singolare e plurale cambiano l'ultima lettera: fattura/fatture, preventivo/preventivi, sede/sedi, rata/rate. */
const ALTERNANZE: Record<string, string> = { a: "e", e: "ai", i: "eo", o: "i" };

/**
 * La parola cercata combacia con una parola della voce se questa comincia così, oppure se è la stessa parola al
 * singolare o al plurale: chi scrive «fattura» trova «fatture». Niente altro: «ricarica» non trova «ricarico»
 * (il ricarico di un prezzo), «carta» non trova «cartelle».
 */
function combacia(parolaDellaVoce: string, cercata: string): boolean {
  if (parolaDellaVoce.startsWith(cercata)) return true;
  if (cercata.length < 4 || parolaDellaVoce.length !== cercata.length) return false;
  if (parolaDellaVoce.slice(0, -1) !== cercata.slice(0, -1)) return false;
  return (ALTERNANZE[cercata.slice(-1)] ?? "").includes(parolaDellaVoce.slice(-1));
}

interface Cercabile {
  title: string;
  group: string;
  description?: string;
  keywords?: string[];
}

function punteggio(voce: Cercabile, cercate: string[], frase: string): number {
  const titolo = parole(voce.title);
  const chiavi = (voce.keywords ?? []).map(comeFrase);
  const paroleChiave = chiavi.map(parole);
  const resto = parole(`${voce.group} ${voce.description ?? ""}`);
  let totale = 0;
  for (const t of cercate) {
    let p = 0;
    if (titolo.includes(t)) p = 5; //                                                la parola è nel titolo
    else if (chiavi.includes(t)) p = 4; //                                           è una parola chiave da sola
    else if (titolo.some((w) => combacia(w, t))) p = 3.5; //                         comincia come una parola del titolo
    else if (paroleChiave.some((ws) => ws.includes(t))) p = 3; //                    è una parola dentro una parola chiave
    else if (paroleChiave.some((ws) => ws.some((w) => combacia(w, t)))) p = 2; //    comincia come una di quelle
    else if (resto.some((w) => combacia(w, t))) p = 1; //                            sta nel gruppo o nella frase
    if (p === 0) return 0; // ogni parola della domanda deve trovare qualcosa
    totale += p;
  }
  // Una domanda identica a una parola chiave intera («prezzo a mano») vale più di una che ha solo le stesse parole.
  if (cercate.length > 1 && chiavi.includes(frase)) totale += 5;
  // Chi scrive il nome intero di una voce («chi è collegato») la trova per prima, prima di chi ha la stessa frase tra le parole chiave.
  const nome = paroleDellaDomanda(voce.title);
  if (nome.length === cercate.length && nome.every((p, i) => p === cercate[i])) totale += 6;
  // A parità, prima chi comincia con la parola cercata: «Firma elettronica» prima di «Collega la casella e firma email».
  if (titolo[0] && combacia(titolo[0], cercate[0])) totale += 0.5;
  return totale;
}

/**
 * Le voci che rispondono alla domanda, la migliore per prima; a parità, l'ordine di partenza (quello del menu).
 * Domanda vuota: tutte, come sono.
 */
export function cercaImpostazioni<T extends Cercabile>(voci: T[], testo: string): T[] {
  const cercate = paroleDellaDomanda(testo);
  if (cercate.length === 0) return voci;
  const frase = comeFrase(testo);
  return voci
    .map((voce, ordine) => ({ voce, ordine, p: punteggio(voce, cercate, frase) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.ordine - b.ordine)
    .map((x) => x.voce);
}

/**
 * Il campo di ricerca del menu a sinistra: lascia le voci del menu che rispondono alla domanda. Una voce risponde se
 * lei o una delle funzioni che contiene (una scheda, una sezione, un sinonimo) risponde: «prezzo» accende «Modelli di
 * preventivo», «iban» accende «Fatturazione». I gruppi senza voci spariscono. Domanda vuota: il menu com'è.
 */
export function filtraGruppiDelMenu<V extends { to: string }, G extends { items: V[] }>(
  gruppi: G[],
  voci: VoceRicercabile[],
  domanda: string,
): G[] {
  if (!domanda.trim()) return gruppi;
  const trovate = new Set(cercaImpostazioni(voci, domanda).map((v) => v.madre));
  return gruppi
    .map((g) => ({ ...g, items: g.items.filter((item) => trovate.has(item.to)) }))
    .filter((g) => g.items.length > 0);
}

// ─── Le voci che l'utente può aprire ─────────────────────────────────────────

export interface OpzioniRicerca {
  /** L'azienda fattura con Edilizia in Cloud: compaiono le voci dentro la Fatturazione. */
  fatturazioneNativa?: boolean;
}

interface VoceDelMenu {
  item: SettingsNavItem;
  gruppo: string;
}

/** La voce del menu a cui appartiene un indirizzo (o il segmento `parent` che ne fa le veci). */
function voceMadre(voci: VoceDelMenu[], url: string, parent?: string): VoceDelMenu | null {
  const indirizzo = parent ? `${BASE}/${parent}` : url;
  const sezione = sezioneDaPercorso(indirizzo);
  return (
    voci.find((v) => v.item.attivoSu?.(indirizzo)) ??
    voci.find((v) => sezioneDaPercorso(v.item.to) === sezione) ??
    null
  );
}

/**
 * Tutto quello che l'utente può cercare: le voci del suo menu e le voci dell'indice che può aprire.
 * Dove una voce non basta (permesso mancante, fuori dal piano, scheda assente da telefono) non c'è.
 */
export function vociRicercabili(
  permissions: Permissions,
  piano: StatoPiano,
  isMobile: boolean,
  opzioni: OpzioniRicerca = {},
): VoceRicercabile[] {
  if (permissions.isLoading) return [];
  const delMenu: VoceDelMenu[] = buildSettingsGroups(permissions.isAdmin, permissions, piano, isMobile)
    .flatMap((g) => g.items.filter((i) => i.visible).map((item) => ({ item, gruppo: g.label })));

  const risultato: VoceRicercabile[] = delMenu.map(({ item, gruppo }) => {
    const dellIndice = SETTINGS_INDEX.find((x) => x.url === item.to);
    return {
      title: item.label,
      url: item.to,
      group: gruppo,
      description: dellIndice?.description ?? descrizioneDellaSezione(sezioneDaPercorso(item.to)),
      keywords: dellIndice?.keywords,
      madre: item.to,
    };
  });

  for (const voce of SETTINGS_INDEX) {
    if (delMenu.some((v) => v.item.to === voce.url)) continue; // è già nel menu: ne ha arricchito il nome
    if (voce.desktopOnly && isMobile) continue;
    if (voce.soloFatturazioneNativa && !opzioni.fatturazioneNativa) continue;
    if (voce.fuori) {
      const { permesso, funzione } = voce.fuori;
      if (!(permissions.isAdmin || permissions[permesso])) continue;
      if (!requisitoSoddisfatto({ funzioni: [funzione] }, piano)) continue;
      risultato.push({ title: voce.title, url: voce.url, group: voce.group ?? "Impostazioni", description: voce.description, keywords: voce.keywords, madre: null });
      continue;
    }
    if (!impostazioneAccessibile(voce.url, permissions, piano, isMobile)) continue;
    const madre = voceMadre(delMenu, voce.url, voce.parent);
    risultato.push({
      title: voce.title,
      url: voce.url,
      group: madre?.gruppo ?? voce.group ?? "Impostazioni",
      description: voce.description,
      keywords: voce.keywords,
      madre: madre?.item.to ?? null,
    });
  }
  return risultato;
}
