/**
 * Due punti che il fondatore vuole in ogni confronto (30/10/2026): Edilizia in
 * Cloud lavora anche su WhatsApp, e si adatta all'azienda invece del contrario.
 * Stesso testo nelle pagine /confronto, negli articoli del blog e nelle copie
 * per i crawler (functions/_middleware.js): se lo cambi qui, allinea anche là.
 */
export const eicWhatsapp = {
  heading: "Anche Edilizia in Cloud lavora su WhatsApp",
  body:
    "Con WhatsApp Business attivo (servizio aggiuntivo), titolare, ufficio e squadra scrivono al numero dell'azienda come scriverebbero a un collega. Un vocale diventa il rapportino della giornata. La foto della bolla carica il magazzino. Lo scontrino della merce presa in negozio finisce sulla commessa giusta. Chiedi un preventivo e lo ricevi in PDF nella chat. Prima di registrare, il sistema chiede conferma con Sì o No. Ai nuovi contatti risponde un agente che fissa l'appuntamento sul tuo calendario.\n\n" +
    "La differenza è cosa c'è dietro la chat: non un archivio di messaggi, ma tutto il gestionale. Il rapportino aggiorna ore e costi della commessa, la bolla aggiorna le giacenze, il preventivo finisce tra quelli del cliente. Chi preferisce l'app usa l'app, chi preferisce WhatsApp scrive: i dati arrivano nello stesso posto.",
};

export const eicSiAdatta = {
  heading: "Il gestionale si adatta alla tua azienda, non il contrario",
  body:
    "Ogni impresa lavora a modo suo, e Edilizia in Cloud parte da come lavori oggi. Scegli tu se il rapportino lo fa ogni operaio o il capo squadra per tutti, chi lo approva, quali fasi ha una commessa, quali modelli di preventivo usare, cosa vede ogni ruolo e quali moduli accendere. Le regole si cambiano dalle impostazioni, senza stravolgere il lavoro della squadra.\n\n" +
    "Un programma rigido ti obbliga a cambiare abitudini per stare dentro le sue caselle. Qui succede il contrario: si configura sul tuo flusso e cresce con te quando aggiungi un mestiere, una squadra o un ufficio.",
};

/** Le due sezioni pronte per gli articoli del blog. */
export const eicPuntiFermiSezioni = [eicWhatsapp, eicSiAdatta].map((p) => ({ type: "section" as const, heading: p.heading, body: p.body }));
