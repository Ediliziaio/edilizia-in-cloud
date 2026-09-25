/**
 * I testi fissi del preventivo Conto Termico. Dicono solo ciò che le regole
 * del GSE dicono (vedi regole.ts): niente importi promessi, niente tempi di
 * pagamento inventati. Chi vende può riscrivere domande e passaggi nel modello.
 */
import { CONTO_TERMICO, type InterventoContoTermico } from "./regole";

export interface DomandaRisposta { domanda: string; risposta: string }
export interface Passaggio { titolo: string; testo: string }
export interface Vantaggio { titolo: string; testo: string }

export const FAQ_CONTO_TERMICO: DomandaRisposta[] = [
  {
    domanda: "Quanto ricevo esattamente?",
    risposta: "Il contributo scritto in questo preventivo è una stima. Il GSE calcola l'importo definitivo in base alla potenza del generatore, alla sua efficienza stagionale (SCOP) e alla zona climatica, e lo conferma alla fine dell'istruttoria.",
  },
  {
    domanda: "Posso avere anche la detrazione fiscale?",
    risposta: "No, non sullo stesso intervento: il Conto Termico non si somma ad altri incentivi dello Stato. Si sceglie il contributo oppure la detrazione.",
  },
  {
    domanda: "Quando arrivano i soldi?",
    risposta: `Dopo che il GSE ha accettato la domanda. Fino a ${CONTO_TERMICO.sogliaUnicaRata.toLocaleString("it-IT")} € paga in un'unica soluzione; oltre, in 2 rate annuali per i generatori fino a ${CONTO_TERMICO.potenzaPerDueAnnualita} kW e in 5 per quelli più grandi.`,
  },
  {
    domanda: "Devo per forza sostituire l'impianto che ho?",
    risposta: "Di regola sì: la casa deve avere un impianto di riscaldamento funzionante, che viene sostituito, e il vecchio generatore va smaltito. Fanno eccezione il solare termico e la pompa di calore «add on» affiancata a una caldaia a condensazione con meno di 5 anni.",
  },
  {
    domanda: "Posso chiederlo se la casa è in affitto?",
    risposta: "Sì, se hai un titolo sull'immobile: il proprietario, chi ha un diritto reale e chi ne ha un diritto personale di godimento, come l'inquilino o il comodatario.",
  },
  {
    domanda: "Chi presenta la domanda al GSE?",
    risposta: `La domanda va inviata entro ${CONTO_TERMICO.giorniPerLaDomanda} giorni dalla fine dei lavori. Ti accompagniamo nella raccolta dei documenti e nell'invio.`,
  },
  {
    domanda: "Quali documenti devo conservare?",
    risposta: "Le foto prima e dopo i lavori, le fatture, i bonifici, la scheda tecnica del generatore, il certificato di smaltimento del vecchio, il libretto d'impianto e la dichiarazione di conformità.",
  },
  {
    domanda: "Per quanto tempo devo tenere l'impianto?",
    risposta: `Per tutta la durata dell'incentivo e per i ${CONTO_TERMICO.anniDiMantenimento} anni successivi all'ultima rata: in quel periodo il GSE può fare controlli.`,
  },
];

export const PASSAGGI_CONTO_TERMICO: Passaggio[] = [
  { titolo: "Sopralluogo e requisiti", testo: "Verifichiamo l'impianto da sostituire, la casa e i requisiti del nuovo generatore." },
  { titolo: "Firma della proposta", testo: "Confermi la configurazione e il modo in cui ricevi il contributo." },
  { titolo: "Installazione", testo: "Smontiamo e smaltiamo il vecchio generatore, installiamo il nuovo e lo mettiamo in funzione." },
  { titolo: "Domanda al GSE", testo: `Entro ${CONTO_TERMICO.giorniPerLaDomanda} giorni dalla fine dei lavori, con foto, fatture e documenti tecnici.` },
  { titolo: "Il contributo", testo: "Accettata la domanda, il GSE paga il contributo, oppure lo sconta l'impresa in fattura se hai scelto così." },
];

export const DOCUMENTI_CONTO_TERMICO: string[] = [
  "Foto prima e dopo i lavori",
  "Fatture e bonifici",
  "Scheda tecnica del generatore",
  "Certificato di smaltimento",
  "Libretto d'impianto",
  "Dichiarazione di conformità",
];

/**
 * I vantaggi di ogni tipo di intervento: solo ciò che vale sempre per quella
 * tecnologia. Chi vende li può riscrivere nel modello.
 */
export const VANTAGGI_CONTO_TERMICO: Record<InterventoContoTermico, Vantaggio[]> = {
  pompa_calore: [
    { titolo: "Energia dall'aria", testo: "Prende gran parte del calore dall'aria esterna: per ogni kWh di elettricità che consuma ne restituisce diversi di calore." },
    { titolo: "Niente fiamma, niente fumi", testo: "La pompa di calore non brucia gas né gasolio: in casa non c'è combustione." },
    { titolo: "Efficienza misurata", testo: "Lo SCOP dice quanto rende in una stagione intera: è anche il numero con cui il GSE calcola il contributo." },
    { titolo: "Calore costante", testo: "Lavora a bassa temperatura e in modo continuo: gli ambienti restano più uniformi." },
    { titolo: "Amica del fotovoltaico", testo: "Se hai o metterai i pannelli, una parte dell'elettricità che consuma la produci tu." },
    { titolo: "Una parte torna indietro", testo: "Con il Conto Termico 3.0 il GSE restituisce una parte della spesa." },
  ],
  ibrido: [
    { titolo: "Il meglio dei due", testo: "La pompa di calore lavora quasi sempre; la caldaia a condensazione interviene quando fa molto freddo." },
    { titolo: "Decide la regolazione", testo: "Un controllo intelligente sceglie il generatore che conviene, momento per momento." },
    { titolo: "Adatto ai radiatori", testo: "Utile dove l'impianto chiede temperature più alte, senza rinunciare alla pompa di calore." },
    { titolo: "Efficienza misurata", testo: "Il contributo si calcola sulla pompa di calore del sistema: potenza ed efficienza stagionale." },
    { titolo: "Meno gas", testo: "La caldaia resta di scorta: gran parte del calore arriva dall'aria esterna." },
    { titolo: "Una parte torna indietro", testo: "Con il Conto Termico 3.0 il GSE restituisce una parte della spesa." },
  ],
  scaldacqua_pdc: [
    { titolo: "Acqua calda dall'aria", testo: "Scalda l'acqua con l'energia dell'aria, consumando molta meno elettricità di un boiler tradizionale." },
    { titolo: "Tutto in un apparecchio", testo: "Pompa di calore e serbatoio insieme: si installa al posto del vecchio scaldabagno." },
    { titolo: "Classe energetica chiara", testo: "Il contributo dipende da capacità e classe energetica dell'apparecchio." },
    { titolo: "Amico del fotovoltaico", testo: "Può scaldare l'acqua nelle ore in cui i pannelli producono." },
    { titolo: "Niente fiamma", testo: "Nessuna combustione per produrre l'acqua calda." },
    { titolo: "Una parte torna indietro", testo: "Con il Conto Termico 3.0 il GSE restituisce una parte della spesa." },
  ],
  solare_termico: [
    { titolo: "Acqua calda dal sole", testo: "I collettori scaldano l'acqua con l'energia del sole, gratis per buona parte dell'anno." },
    { titolo: "Si affianca all'impianto", testo: "Lavora insieme al generatore che scalda la casa: non serve sostituirlo." },
    { titolo: "Contributo sulla superficie", testo: "Il GSE calcola il contributo su superficie dei collettori ed energia prodotta." },
    { titolo: "Meno combustibile", testo: "Ogni litro scaldato dal sole è combustibile o elettricità in meno." },
    { titolo: "Lunga durata", testo: "Collettori e serbatoio sono pensati per restare in funzione molti anni." },
    { titolo: "Una parte torna indietro", testo: "Con il Conto Termico 3.0 il GSE restituisce una parte della spesa." },
  ],
  biomassa: [
    { titolo: "Calore dal legno", testo: "Pellet o legna, combustibili rinnovabili, al posto di gas o gasolio." },
    { titolo: "Solo classe 5 stelle", testo: "Il Conto Termico 3.0 ammette i generatori a biomassa con la certificazione ambientale più alta." },
    { titolo: "Un accumulo che aiuta", testo: "Dove richiesto, l'accumulo rende il funzionamento più regolare." },
    { titolo: "Contributo sul rendimento", testo: "Il GSE calcola il contributo su potenza e caratteristiche emissive del generatore." },
    { titolo: "Filiera vicina", testo: "Il combustibile si trova facilmente ed è rinnovabile." },
    { titolo: "Una parte torna indietro", testo: "Con il Conto Termico 3.0 il GSE restituisce una parte della spesa." },
  ],
};
