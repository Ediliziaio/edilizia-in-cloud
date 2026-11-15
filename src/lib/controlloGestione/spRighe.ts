/**
 * Righe dello Stato patrimoniale riclassificato, con etichette e spiegazioni: le usano la pagina
 * (SPColumns) e le esportazioni, così il file scaricato dice le stesse cose dello schermo.
 */
import type { SPAttivo, SPPassivo } from "@/hooks/controlloGestione/useStatoPatrimoniale";

export interface Riga {
  chiave: string;
  label: string;
  valore: number;
  livello: "voce" | "subtot" | "totale";
  spiegazione?: string;
}

export function buildAttivo(a: SPAttivo): Riga[] {
  return [
    { chiave: "imm_immateriali", label: "Immobilizzazioni immateriali", valore: a.imm_immateriali, livello: "voce", spiegazione: "Software, licenze, marchi." },
    { chiave: "imm_materiali", label: "Immobilizzazioni materiali", valore: a.imm_materiali, livello: "voce", spiegazione: "Mezzi, attrezzature, immobili: valore residuo dopo gli ammortamenti." },
    { chiave: "imm_finanziarie", label: "Immobilizzazioni finanziarie", valore: a.imm_finanziarie, livello: "voce" },
    { chiave: "attivo_fisso", label: "Attivo fisso", valore: a.attivo_fisso, livello: "subtot", spiegazione: "Quello che resta in azienda per più anni." },
    { chiave: "rimanenze", label: "Rimanenze di magazzino", valore: a.rimanenze, livello: "voce", spiegazione: "Giacenza alla data, dai carichi e scarichi di magazzino, al costo medio attuale." },
    { chiave: "lavori_in_corso", label: "Lavori in corso", valore: a.lavori_in_corso ?? 0, livello: "voce", spiegazione: "Lavori eseguiti e non ancora fatturati, con la stessa regola del conto economico." },
    { chiave: "crediti_clienti", label: "Crediti verso clienti", valore: a.crediti_clienti, livello: "voce", spiegazione: "Fatture emesse non ancora incassate alla data, IVA compresa, meno le note di credito da rimborsare." },
    { chiave: "crediti_tributari", label: "Crediti tributari", valore: a.crediti_tributari, livello: "voce", spiegazione: "Credito IVA dalle liquidazioni periodiche (registri IVA dell'app), riportato di periodo in periodo." },
    { chiave: "anticipi_fornitori", label: "Anticipi a fornitori", valore: a.anticipi_fornitori, livello: "voce" },
    { chiave: "liquidita_differite", label: "Crediti a breve", valore: a.liquidita_differite, livello: "subtot" },
    { chiave: "cassa", label: "Cassa contanti", valore: a.cassa, livello: "voce" },
    { chiave: "banche_positive", label: "Conti in attivo", valore: a.banche_positive, livello: "voce", spiegazione: "Saldo dei conti in attivo alla data, conto per conto." },
    { chiave: "liquidita_immediate", label: "Liquidità", valore: a.liquidita_immediate, livello: "subtot" },
    { chiave: "attivo_circolante", label: "Attivo circolante", valore: a.attivo_circolante, livello: "subtot", spiegazione: "Quello che diventa denaro entro un anno." },
    { chiave: "totale", label: "Totale impieghi", valore: a.totale, livello: "totale" },
  ];
}

export function buildPassivo(p: SPPassivo): Riga[] {
  return [
    { chiave: "capitale_sociale", label: "Capitale sociale", valore: p.capitale_sociale, livello: "voce", spiegazione: "Dai dati di partenza (Controllo dei dati → Patrimonio netto): l'ultimo anno inserito." },
    { chiave: "riserve", label: "Riserve e utili degli anni passati", valore: p.riserve, livello: "voce", spiegazione: "Dai dati di partenza, più l'utile o la perdita del conto economico di ogni anno passato da allora. I dividendi non sono registrati." },
    { chiave: "utile_esercizio", label: "Utile dell'anno", valore: p.utile_esercizio, livello: "voce", spiegazione: "Dal conto economico, dall'inizio dell'anno al mese della data." },
    { chiave: "mezzi_propri", label: "Patrimonio netto", valore: p.mezzi_propri, livello: "subtot", spiegazione: "I soldi dei soci nell'azienda." },
    { chiave: "fondo_tfr", label: "Fondo TFR", valore: p.fondo_tfr, livello: "voce", spiegazione: "Fondo di partenza più il TFR maturato in azienda dai cedolini fino alla data (lordo / 13,5, come nel conto economico), meno liquidazioni e anticipi, più la rivalutazione annua (1,5% + 75% dell'inflazione ISTAT) al netto dell'imposta sostitutiva del 17%. Il TFR versato a fondi pensione o al Fondo Tesoreria INPS non c'è." },
    { chiave: "fondi_rischi", label: "Fondi rischi", valore: p.fondi_rischi, livello: "voce" },
    { chiave: "mutui_mlt", label: "Mutui e finanziamenti oltre 12 mesi", valore: p.mutui_mlt, livello: "voce", spiegazione: "Capitale residuo che si rimborsa dopo i prossimi 12 mesi." },
    { chiave: "pas_consolidato", label: "Debiti a lungo termine", valore: p.pas_consolidato, livello: "subtot" },
    { chiave: "banche_negative", label: "Conti in rosso", valore: p.banche_negative, livello: "voce", spiegazione: "Saldo dei conti in rosso alla data (scoperti, anticipi), senza compensarli coi conti in attivo." },
    { chiave: "mutui_breve", label: "Mutui: quota entro 12 mesi", valore: p.mutui_breve ?? 0, livello: "voce", spiegazione: "Quota capitale delle prossime dodici rate." },
    { chiave: "debiti_fornitori", label: "Debiti verso fornitori", valore: p.debiti_fornitori, livello: "voce", spiegazione: "Fatture ricevute registrate e non pagate alla data, IVA compresa, più i pagamenti a fornitori aperti nello scadenzario." },
    { chiave: "debiti_tributari", label: "Debiti tributari", valore: p.debiti_tributari, livello: "voce", spiegazione: "IRES e IRAP stimate dell'esercizio meno gli acconti usciti dalla banca, il saldo dell'anno prima fino al 30/6, F24 e scadenze fiscali da pagare, ritenute dei cedolini fino al 16 del mese dopo, IVA dei periodi non ancora scaduti (quelli scaduti si considerano versati: il confronto con la banca è in Controllo dei dati → Versamenti F24) e imposta sostitutiva sulla rivalutazione del TFR (acconto il 16 dicembre, saldo il 16 febbraio)." },
    { chiave: "debiti_personale", label: "Debiti verso il personale", valore: p.debiti_personale, livello: "voce", spiegazione: "Stipendi netti non ancora pagati alla data." },
    { chiave: "debiti_previdenziali", label: "Debiti previdenziali", valore: p.debiti_previdenziali, livello: "voce", spiegazione: "Contributi dei cedolini da versare con l'F24 del 16 del mese dopo, e TFR destinato a fondi pensione o al Fondo Tesoreria INPS non ancora versato." },
    { chiave: "pas_corrente", label: "Debiti a breve", valore: p.pas_corrente, livello: "subtot" },
    { chiave: "totale", label: "Totale fonti", valore: p.totale, livello: "totale" },
  ];
}
