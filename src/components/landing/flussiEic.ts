import type { WorkflowAction, WorkflowGraph } from "@/components/ui/interactive-workflow-blueprint";

/**
 * I flussi che Edilizia in Cloud fa davvero, raccontati passaggio per passaggio
 * nella vetrina «Silvio al lavoro». Uno per pagina, solo dove serve: home,
 * funzionalità chiave, mestieri principali. Nomi e cifre sono d'esempio.
 * Regola: solo cose che il programma fa oggi, niente prezzi del listino EiC.
 */
export const SILVIO = "/images/silvio/silvio-busto.png";

type Passo = Pick<WorkflowAction, "label" | "detail" | "kind"> & { tool?: string; live?: string; silvio?: boolean };
export type Flusso = {
  eyebrow: string;
  titolo: string;
  testo: string;
  lavagna: string;
  oraInizio: string;
  passi: Passo[];
};

/** Fino a 4 passaggi a zig-zag; oltre, due file da tre: la lavagna resta leggibile. */
export function grafoDa(passi: Passo[]): WorkflowGraph {
  const tre = passi.length > 4;
  const nodes = passi.map(({ silvio, ...p }, i) => ({
    id: `p${i}`,
    type: "blueprint" as const,
    position: tre ? { x: (i % 3) * 300, y: Math.floor(i / 3) * 260 + (i % 3 === 1 ? 40 : 0) } : { x: i * 290, y: i % 2 ? 200 : 40 },
    data: { ...p, avatar: silvio ? SILVIO : undefined } as WorkflowAction,
  }));
  const edges = passi.slice(1).map((_, i) => ({ id: `e${i}`, source: `p${i}`, target: `p${i + 1}` }));
  return { nodes, edges };
}

export const FLUSSI = {
  /** Home: il controllo dei numeri, dal cantiere al margine. */
  margine: {
    eyebrow: "Il cuore di Edilizia in Cloud",
    titolo: "Dal cantiere al margine, con Silvio accanto.",
    testo: "Rilievo, computo, preventivo, commessa, costi veri: ogni passaggio alimenta il successivo e Silvio tiene d'occhio il margine mentre lavori, non a fine anno.",
    lavagna: "Dal rilievo al margine della commessa",
    oraInizio: "08:30",
    passi: [
      { label: "Rilievo in cantiere", detail: "Foto e misure prese dal telefono, già sulla scheda del cliente.", kind: "trigger", tool: "App cantiere", live: "Bagno e cucina rilevati: 14 foto e misure salvate" },
      { label: "Computo metrico", detail: "Silvio legge la planimetria e prepara le voci con le quantità.", kind: "agent", tool: "Silvio AI", silvio: true, live: "Planimetria letta: 23 voci, 86 mq di pavimenti" },
      { label: "Preventivo dal tuo listino", detail: "Prezzi e costi presi dal tuo listino: il margine previsto si vede subito.", kind: "integration", tool: "Preventivi", live: "Preventivo pronto: margine previsto 22%" },
      { label: "Commessa aperta", detail: "Alla firma nasce la commessa con fasi e budget per voce.", kind: "delivery", tool: "Commesse", live: "Commessa Via dei Mille aperta: 6 fasi, budget per voce" },
      { label: "Costi veri dal cantiere", detail: "DDT, ore e fatture finiscono sulla commessa nel momento in cui arrivano.", kind: "integration", tool: "DDT e rapportini", live: "Ore di oggi e DDT del cemento caricati sulla commessa" },
      { label: "Silvio sul margine", detail: "Avvisa quando una voce sfora e calcola come finire la commessa.", kind: "agent", tool: "Silvio AI", silvio: true, live: "Manodopera +12%: margine a finire 17%, ecco come recuperare" },
    ],
  },
  ddt: {
    eyebrow: "DDT con Silvio",
    titolo: "Una foto alla bolla, il resto lo fa Silvio.",
    testo: "L'operaio fotografa il DDT dall'app o lo manda su WhatsApp. Silvio lo legge, lo abbina all'ordine e alla fattura del fornitore e mette il costo sulla commessa giusta.",
    lavagna: "Dalla foto del DDT al costo in commessa",
    oraInizio: "07:52",
    passi: [
      { label: "Foto del DDT", detail: "L'operaio scatta la foto della bolla dall'app o la manda su WhatsApp.", kind: "trigger", tool: "App · WhatsApp", live: "Foto ricevuta da Marco, cantiere Via dei Mille" },
      { label: "Silvio legge il DDT", detail: "Fornitore, righe, quantità e prezzi letti dalla foto.", kind: "agent", tool: "Silvio AI", silvio: true, live: "DDT n. 418 letto: 3 righe, 40 sacchi di cemento" },
      { label: "Abbinato all'ordine", detail: "Il DDT viene confrontato con l'ordine fatto al fornitore.", kind: "integration", tool: "Ordini", live: "Ordine 112 trovato: quantità giuste, nessuna differenza" },
      { label: "Abbinato alla fattura", detail: "Quando arriva la fattura del fornitore, si paga solo quello che è arrivato.", kind: "integration", tool: "Fatture", live: "Fattura del fornitore abbinata: importi uguali" },
      { label: "Costo sulla commessa", detail: "Il materiale finisce sulla commessa e sulla voce giusta.", kind: "delivery", tool: "Commessa", live: "1.240 € su Materiali, commessa Via dei Mille" },
      { label: "Ufficio verifica", detail: "Se qualcosa non torna, l'ufficio lo vede in un'unica lista.", kind: "review", tool: "Ufficio", live: "Tutto in ordine: niente da controllare a mano" },
    ],
  },
  preventivo: {
    eyebrow: "Preventivi con Silvio",
    titolo: "Dal sopralluogo al preventivo firmato.",
    testo: "Silvio prepara la bozza con le voci del tuo listino, tu la controlli, il cliente la firma dal telefono e la commessa nasce da sola.",
    lavagna: "Dal sopralluogo alla commessa",
    oraInizio: "17:30",
    passi: [
      { label: "Sopralluogo", detail: "Misure, foto e richieste del cliente prese in cantiere.", kind: "trigger", tool: "App cantiere", live: "Sopralluogo da Bianchi: misure e 9 foto salvate" },
      { label: "Bozza di preventivo", detail: "Silvio abbina le richieste alle voci del tuo listino e della manodopera.", kind: "agent", tool: "Silvio AI", silvio: true, live: "Bozza pronta: 17 voci dal listino, margine 24%" },
      { label: "Controllo del titolare", detail: "Il preventivo passa da te prima di partire.", kind: "review", tool: "Approvazione", live: "Approvato con una modifica alla posa" },
      { label: "Firma del cliente", detail: "Il cliente legge e firma dal telefono, senza stampare.", kind: "delivery", tool: "Firma elettronica", live: "Preventivo firmato dal cliente alle 21:14" },
      { label: "Commessa pronta", detail: "Voci, fasi e acconti passano dal preventivo alla commessa.", kind: "delivery", tool: "Commesse", live: "Commessa aperta con fasi e rate già impostate" },
    ],
  },
  computo: {
    eyebrow: "Computo metrico con Silvio",
    titolo: "Dalla planimetria al computo, in pochi minuti.",
    testo: "Carichi il PDF o la foto della planimetria: Silvio riconosce stanze e superfici, tu scegli le lavorazioni e il computo si compila con le voci del prezzario.",
    lavagna: "Dalla planimetria al preventivo",
    oraInizio: "10:05",
    passi: [
      { label: "Planimetria caricata", detail: "PDF del progettista o foto della pianta, anche fatta col telefono.", kind: "trigger", tool: "PDF · foto", live: "Pianta del piano terra caricata" },
      { label: "Silvio misura", detail: "Riconosce stanze, superfici e perimetri dalla pianta.", kind: "agent", tool: "Silvio AI", silvio: true, live: "7 stanze riconosciute: 92 mq, 118 m di pareti" },
      { label: "Voci dal prezzario", detail: "Le lavorazioni scelte prendono le voci del prezzario della tua regione.", kind: "integration", tool: "Prezzario regionale", live: "31 voci compilate con le quantità" },
      { label: "Computo pronto", detail: "Computo metrico completo, da controllare e scaricare.", kind: "review", tool: "Computo", live: "Computo controllato e salvato" },
      { label: "Preventivo", detail: "Dal computo al preventivo per il cliente, con i tuoi prezzi.", kind: "delivery", tool: "Preventivi", live: "Preventivo generato dal computo" },
    ],
  },
  rapportini: {
    eyebrow: "Cantiere e rapportini",
    titolo: "La giornata in cantiere, già sulla commessa.",
    testo: "La squadra timbra con un tocco, compila il rapportino con le foto e il cliente firma a fine lavori: le ore diventano costo sulla commessa senza ricopiare niente.",
    lavagna: "Dalla timbratura al costo della manodopera",
    oraInizio: "07:30",
    passi: [
      { label: "Timbratura", detail: "Entrata in cantiere con un tocco, con la posizione.", kind: "trigger", tool: "App cantiere", live: "Squadra di Luca in cantiere alle 7:30" },
      { label: "Rapportino con foto", detail: "Lavori fatti, materiali usati e foto, dal telefono.", kind: "integration", tool: "Rapportino", live: "Massetto completato: 6 foto e 2 materiali" },
      { label: "Firma del cliente", detail: "A fine lavori il cliente firma sul telefono dell'operaio.", kind: "review", tool: "Firma", live: "Rapportino firmato dal cliente" },
      { label: "Ore sulla commessa", detail: "Le ore diventano costo al costo orario completo.", kind: "delivery", tool: "Commessa", live: "32 ore sulla fase Massetti" },
      { label: "Silvio sul margine", detail: "Confronta le ore con quelle previste e avvisa se sforano.", kind: "agent", tool: "Silvio AI", silvio: true, live: "Massetti +8% di ore: segnalato al titolare" },
    ],
  },
  fatture: {
    eyebrow: "Fatture e incassi",
    titolo: "Dal SAL all'incasso, senza rincorrere niente.",
    testo: "Il SAL firmato diventa fattura elettronica, la scadenza entra nello scadenzario e quando il cliente paga il movimento si abbina alla fattura.",
    lavagna: "Dal SAL alla fattura pagata",
    oraInizio: "11:20",
    passi: [
      { label: "SAL firmato", detail: "Lo stato avanzamento lavori firmato dal cliente.", kind: "trigger", tool: "SAL", live: "SAL 2 firmato: 18.000 €" },
      { label: "Fattura elettronica", detail: "La fattura nasce dal SAL e parte verso il Sistema di Interscambio.", kind: "integration", tool: "Fatturazione", live: "Fattura emessa e consegnata" },
      { label: "Scadenza in fila", detail: "Il pagamento atteso entra nello scadenzario.", kind: "delivery", tool: "Scadenzario", live: "Incasso atteso tra 30 giorni" },
      { label: "Incasso abbinato", detail: "Il movimento della banca si abbina alla fattura.", kind: "integration", tool: "Tesoreria", live: "Bonifico ricevuto e abbinato" },
      { label: "Silvio sulla cassa", detail: "Ti avvisa delle fatture scadute e di cosa entra nelle prossime settimane.", kind: "agent", tool: "Silvio AI", silvio: true, live: "Cassa delle prossime 4 settimane: tutto coperto" },
    ],
  },
  serramenti: {
    eyebrow: "Per i serramentisti",
    titolo: "Dal rilievo delle finestre all'ordine al fornitore.",
    testo: "Misure in cantiere, preventivo dal listino del tuo fornitore, render per far vedere il risultato, firma del cliente e ordine pronto: tutto nello stesso posto.",
    lavagna: "Dal rilievo alla posa",
    oraInizio: "16:00",
    passi: [
      { label: "Rilievo delle misure", detail: "Larghezza, altezza e apertura di ogni finestra, dal telefono.", kind: "trigger", tool: "App cantiere", live: "7 finestre e 1 portafinestra misurate" },
      { label: "Preventivo dal listino", detail: "Silvio prende i prezzi dal listino del tuo fornitore, misura per misura.", kind: "agent", tool: "Silvio AI", silvio: true, live: "Preventivo pronto: profilo, vetro e posa per ogni finestra" },
      { label: "Render per il cliente", detail: "Il cliente vede come saranno le finestre nuove sulla sua casa.", kind: "integration", tool: "Render AI", live: "Render della facciata con i nuovi infissi" },
      { label: "Firma del cliente", detail: "Firma dal telefono e acconto registrato.", kind: "review", tool: "Firma elettronica", live: "Contratto firmato, acconto del 30%" },
      { label: "Ordine al fornitore", detail: "Dal preventivo firmato nasce l'ordine con le misure.", kind: "delivery", tool: "Ordini", live: "Ordine inviato al fornitore con tutte le misure" },
      { label: "Posa in calendario", detail: "Data di posa nel calendario della squadra.", kind: "delivery", tool: "Calendario lavori", live: "Posa lunedì 3 marzo, squadra di Andrea" },
    ],
  },
  fotovoltaico: {
    eyebrow: "Per chi installa fotovoltaico",
    titolo: "Dalla bolletta all'impianto acceso.",
    testo: "Sopralluogo con le bollette, preventivo con il cronoprogramma, firma, pratiche e posa: ogni passaggio sulla stessa commessa.",
    lavagna: "Dalla bolletta all'impianto",
    oraInizio: "15:10",
    passi: [
      { label: "Sopralluogo e bollette", detail: "Tetto, consumi e foto raccolti dal telefono.", kind: "trigger", tool: "App cantiere", live: "Tetto a falde, consumi 4.200 kWh l'anno" },
      { label: "Preventivo dell'impianto", detail: "Silvio prepara il preventivo con pannelli, accumulo e cronoprogramma.", kind: "agent", tool: "Silvio AI", silvio: true, live: "Impianto 6 kW con accumulo, cronoprogramma incluso" },
      { label: "Firma del cliente", detail: "Il cliente firma dal telefono.", kind: "review", tool: "Firma elettronica", live: "Contratto firmato" },
      { label: "Pratiche e commessa", detail: "Documenti e scadenze della pratica sulla commessa.", kind: "integration", tool: "Commessa", live: "Pratica avviata, scadenze in calendario" },
      { label: "Posa e collaudo", detail: "Squadra, materiali e foto della posa sulla stessa commessa.", kind: "delivery", tool: "Calendario lavori", live: "Impianto montato e acceso" },
    ],
  },
  ristrutturazioni: {
    eyebrow: "Per chi ristruttura",
    titolo: "Dalla planimetria al SAL del cliente.",
    testo: "Computo dalla pianta, preventivo con le fasi, commessa con i costi veri e SAL da far firmare: la ristrutturazione tenuta in mano, fase per fase.",
    lavagna: "Dalla pianta al SAL",
    oraInizio: "09:00",
    passi: [
      { label: "Planimetria", detail: "La pianta della casa, in PDF o in foto.", kind: "trigger", tool: "PDF · foto", live: "Pianta dell'appartamento caricata" },
      { label: "Computo con Silvio", detail: "Stanze e superfici riconosciute, lavorazioni con le quantità.", kind: "agent", tool: "Silvio AI", silvio: true, live: "Bagno, cucina e pavimenti: 28 voci" },
      { label: "Preventivo a fasi", detail: "Demolizioni, impianti, massetti, finiture: ogni fase col suo importo.", kind: "integration", tool: "Preventivi", live: "Preventivo a 6 fasi, firmato dal cliente" },
      { label: "Costi sulla commessa", detail: "Materiali, ore e subappalti fase per fase.", kind: "integration", tool: "Commessa", live: "Fase Impianti al 70%, costi in linea" },
      { label: "SAL al cliente", detail: "Lo stato avanzamento lavori da far firmare e fatturare.", kind: "delivery", tool: "SAL", live: "SAL 2 pronto da firmare" },
    ],
  },
  impianti: {
    eyebrow: "Per gli impiantisti",
    titolo: "Dal sopralluogo all'impianto collaudato.",
    testo: "Preventivo dal tuo listino, materiali dal magazzino, ore della squadra e certificazioni sulla stessa commessa.",
    lavagna: "Dal sopralluogo al collaudo",
    oraInizio: "08:15",
    passi: [
      { label: "Sopralluogo", detail: "Impianto attuale, foto e misure.", kind: "trigger", tool: "App cantiere", live: "Caldaia del 2009, 110 mq, 8 termosifoni" },
      { label: "Preventivo con Silvio", detail: "Voci dal tuo listino e dalla manodopera.", kind: "agent", tool: "Silvio AI", silvio: true, live: "Pompa di calore e posa: preventivo pronto" },
      { label: "Materiali dal magazzino", detail: "Quello che serve viene prenotato o ordinato.", kind: "integration", tool: "Magazzino", live: "Materiali prenotati, 2 righe ordinate" },
      { label: "Ore della squadra", detail: "Rapportini e ore sulla commessa.", kind: "integration", tool: "Rapportini", live: "2 giornate di lavoro registrate" },
      { label: "Collaudo e documenti", detail: "Foto, dichiarazioni e firma del cliente.", kind: "delivery", tool: "Documenti", live: "Impianto collaudato, documenti firmati" },
    ],
  },
} satisfies Record<string, Flusso>;

export type NomeFlusso = keyof typeof FLUSSI;

/** Quale flusso mostrare nelle pagine funzionalità (per slug). */
export const FLUSSO_FUNZIONALITA: Partial<Record<string, NomeFlusso>> = {
  "ddt-digitali": "ddt",
  "ordini-acquisto": "ddt",
  "preventivi-edilizia": "preventivo",
  "quote-builder-ai": "preventivo",
  "computo-metrico": "computo",
  "rapportini-cantiere": "rapportini",
  "fatturazione-elettronica": "fatture",
  "margini-cantiere": "margine",
  "gestione-commesse": "margine",
};

/** Quale flusso mostrare nelle pagine «Per chi» (per mestiere). */
export const FLUSSO_MESTIERE: Partial<Record<string, NomeFlusso>> = {
  serramentisti: "serramenti",
  fotovoltaico: "fotovoltaico",
  ristrutturatori: "ristrutturazioni",
  impiantisti: "impianti",
};
