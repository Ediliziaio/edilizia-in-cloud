import { lavorazioneVuota, posVuoto, type Lavorazione, type PosContenuto } from "../../../supabase/functions/_shared/posModello.ts";
import type { DatiStampaPos } from "../../../supabase/functions/_shared/posHtml.ts";
/** Synthetic renderer fixture; never insert its approval into the database. */
function lavorazione(extra: Partial<Lavorazione> = {}): Lavorazione {
  return {
    ...lavorazioneVuota("l1"),
    titolo: "Posa del cappotto termico",
    descrizione: "Incollaggio e tassellatura dei pannelli isolanti sulla facciata",
    sostanze: "Nessuna",
    opere_provvisionali: "Ponteggio metallico fisso",
    macchine: "Trapano tassellatore, miscelatore",
    impianti: "Impianto elettrico di cantiere",
    turni: "Turno unico diurno",
    rischi: "Caduta dall'alto\nPolveri",
    misure: "Parapetti sul ponteggio\nAspirazione delle polveri",
    dpi: "Elmetto EN 397\nCalzature di sicurezza EN ISO 20345\nFacciale filtrante FFP2 EN 149",
    durata_giorni: 20,
    ...extra,
  };
}

function posCompleto(): PosContenuto {
  const p = posVuoto();
  p.opera.committente = { nominativo: "Fabio Riva", codice_fiscale: "", indirizzo: "Via Mazzini 14, Como", telefono: "", email: "" };
  p.opera.cantiere = { via: "Via Mazzini 14", localita: "Como", provincia: "CO" };
  p.opera.descrizione_attivita = "Cappotto termico su edificio residenziale";
  p.opera.modalita_organizzative = "Accesso dal cortile, stoccaggio sotto il portico";
  p.opera.turni_lavoro = "Turno unico diurno 8-12, 13-17";
  p.impresa.ragione_sociale = "Demo Azienda S.r.l.";
  p.impresa.datore_lavoro = "Mario Rossi";
  p.impresa.sede_legale = { indirizzo: "Via dei Cantieri 1, Sesto San Giovanni", telefono: "02 1234567", email: "info@demo.it" };
  p.dirigenti = [{ nominativo: "Mario Rossi", ruolo: "direttore_tecnico", mansioni_sicurezza: "Dirige il cantiere" }];
  p.preposti = [{ nominativo: "Luca Bianchi", ruolo: "capocantiere", ruolo_altro: "", mansioni_sicurezza: "Sovrintende le lavorazioni" }];
  p.rspp = { svolto_da: "esterno", nominativo: "Anna Verdi", mansioni_sicurezza: "Collabora alla valutazione dei rischi" };
  p.medico_competente = { previsto: true, nominativo: "Dott. Neri", mansioni_sicurezza: "Sorveglianza sanitaria" };
  p.rls = { tipo: "rlst", nominativo: "Paolo Gialli", mansioni_sicurezza: "Consultato sul POS" };
  p.emergenze.addetti = [{ nominativo: "Luca Bianchi", antincendio: true, primo_soccorso: true, mansioni_sicurezza: "Emergenze in cantiere" }];
  p.lavoratori = [{ qualifica: "Operaio specializzato", numero: 2, note: "" }];
  p.formazione = [
    { nominativo: "Luca Bianchi", qualifica: "Capocantiere", base: true, verificata: true, rischi_specifici: true, rischi_cantiere: true, dpi_terza_categoria: true, altro: "", attestati: "" },
    { nominativo: "Marco Operaio", qualifica: "Operaio", base: true, verificata: true, rischi_specifici: false, rischi_cantiere: false, dpi_terza_categoria: false, altro: "", attestati: "" },
  ];
  p.rumore.esito = "Dalla valutazione del 12/03/2026 l'esposizione è inferiore a 80 dB(A)";
  p.lavorazioni = [lavorazione()];
  return p;
}


export function esempioPdfPos(lungo=false): DatiStampaPos {
 const p=posCompleto();
 p.opera.descrizione_attivita="ESEMPIO SINTETICO PER COLLAUDO — NON USARE IN CANTIERE";
 p.impresa.ragione_sociale="ESEMPIO SINTETICO — IMPRESA DI COLLAUDO";
 p.impresa.ruolo="esecutrice_subappalto";p.impresa.subappalto_a="Affidataria sintetica";
 p.opera.responsabile_lavori={...p.opera.committente,nominativo:"Responsabile sintetico"};
 p.formazione[0].nominativo="Ștefan Țurcan · Łukasz Żółć · Αλέξανδρος · Кирилл";
 p.formazione[0].attestati="Attestato sintetico";
 p.autonomi=[{nominativo:"Autonomo sintetico",codice_fiscale:"CF-SINTETICO",partita_iva:"PIVA-SINTETICA",indirizzo:"Indirizzo fittizio",attivita:"Attività sintetica",data_ingresso:"2026-11-02",data_uscita:"2026-11-03",note:"Nota autonoma sintetica"}];
 p.emergenze.gestione="comune";p.emergenze.imprese_gestione_comune="Imprese sintetiche";
 p.rumore.righe=[{mansione:"Mansione sintetica",lavorazione:"Attività sintetica rumore",livello_sorgenti:"Valore fittizio",esposizione:"Esposizione fittizia",note:"Nota rumore sintetica"}];
 p.procedure_psc={psc_presente:true,richieste:true,voci:[{procedura:"Procedura sintetica PSC",indicazioni:"Indicazioni sintetiche PSC"}]};
 p.allegati=[{tipo:"scheda_sicurezza",nome:"Scheda sintetica.pdf",file_path:"sintetico/mai-caricare.pdf"},{tipo:"altro",nome:"Allegato di collaudo.jpg",file_path:"sintetico/mai-caricare.jpg"}];
 if(lungo) p.lavorazioni[0].misure=Array.from({length:150},(_,i)=>`Misura sintetica ${i+1}: testo di collaudo per verificare la prosecuzione delle righe lunghe fra pagine senza omissioni o sovrapposizioni.`).join("\n")+"\nFINE-RIGA-LUNGA-150";
 return {contenuto:p,stato:"approvato",revisione:0,revisioni:[{rev:0,data:"2026-10-26",descrizione:"Esempio fittizio per collaudo del generatore"}],approvatoDa:"APPROVATORE SINTETICO — SOLO RENDERING",approvatoIl:"2026-10-26T12:00:00Z",codiceCommessa:"TEST-POS-2026"};
}
