// Dati di prova del dossier di rendicontazione: due operazioni vere nei conti (uno sviluppo
// con piano, fonti, investitori e unità; un appalto con contratto, SAL e garanzie), calcolate
// con le funzioni dei moduli, non scritte a mano.
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { CONTRATTO_VUOTO, type DatiContratto } from "@/lib/orders/generali/contratto";
import { calcolaChecklist, vociDelModello } from "@/lib/orders/generali/documenti";
import { calcolaInvestitori, numeriDalPiano, type Fonte } from "@/lib/orders/generali/investitoriConti";
import { calcolaPianoEconomico, numeriPerInvestitori, type RigaReale, type VocePiano } from "@/lib/orders/generali/pianoConti";
import type { FotografiaPiano } from "@/lib/orders/generali/pianoLettura";
import type { InputDossier } from "@/lib/orders/generali/rendiconto";
import type { ElencoUnita, UnitaGenerale } from "@/lib/orders/generali/unita";

export const OGGI = "2027-06-15";

const figlia = (id: string, nome: string, p: Partial<RiepilogoGenerale["figlie"][number]> = {}): RiepilogoGenerale["figlie"][number] => ({
  id, codice: null, nome, stato: "in_corso", statoNome: "In corso", statoColore: null, indirizzo: null, inizio: null, fine: null,
  avanzamento: 40, importo: 400_000, eseguito: 160_000, fatturato: 100_000, incassato: 80_000, costo: 120_000, margine: 40_000, ...p,
});

export const permessiTutti = { importi: true, costi: true, margini: true };

export const riepilogoSviluppo = (permessi = permessiTutti): RiepilogoGenerale => ({
  generale: { id: "g1", codice: "SV-27", nome: "Residenza Via Roma", cliente: null, clienteId: null, modello: "sviluppo", creataIl: "2027-01-10", valore: 1_500_000 },
  figlie: [figlia("u1", "Appartamento A1", { avanzamento: 50 }), figlia("u2", "Appartamento A2", { avanzamento: 30 })],
  permessi,
});

const voce = (p: Partial<VocePiano> & Pick<VocePiano, "id">): VocePiano => ({
  tipo: "costo", categoria: "costruzione", descrizione: "Voce", importo: 0, mese: null, durataMesi: 1,
  figliaId: null, categorieCosto: [], aFinire: null, nota: null, ordine: 0, origineId: null, ...p,
});
const riga = (p: Partial<RigaReale> & Pick<RigaReale, "id" | "importo">): RigaReale => ({
  fonte: "spesa", rifId: null, orderId: "u1", data: "2027-03-10", tipo: "costo", chiave: "materiali",
  categoria: null, descrizione: "Spesa", voceId: null, ...p,
});

export const pianoSviluppo = () => calcolaPianoEconomico({
  oggi: OGGI,
  generaleId: "g1",
  voci: [
    voce({ id: "v1", tipo: "ricavo", categoria: "vendite", descrizione: "Vendita appartamenti", importo: 1_500_000, mese: "2028-03", durataMesi: 6 }),
    voce({ id: "v2", categoria: "terreno", descrizione: "Terreno", importo: 300_000, mese: "2027-01" }),
    voce({ id: "v3", categoria: "costruzione", descrizione: "Costruzione", importo: 800_000, mese: "2027-02", durataMesi: 12 }),
  ],
  righe: [
    riga({ id: "r1", importo: 300_000, voceId: "v2", data: "2027-01-15", orderId: "g1" }),
    riga({ id: "r2", importo: 350_000, voceId: "v3", data: "2027-04-10" }),
  ],
  incassi: [],
  figlie: [{ id: "u1", nome: "A1", importo: 750_000 }, { id: "u2", nome: "A2", importo: 750_000 }],
});

const fonte = (f: Partial<Fonte> & Pick<Fonte, "id" | "tipo" | "nome">): Fonte => ({
  soggetto: "persona", clienteId: null, email: null, impegno: 0, quotaUtilePct: null, tassoPct: null,
  dataInizio: null, scadenza: null, nota: null, ordine: 0, ...f,
});

export const contiSviluppo = () => {
  const piano = pianoSviluppo();
  return calcolaInvestitori({
    fonti: [
      fonte({ id: "P", tipo: "propri", nome: "Edil Srl", impegno: 300_000 }),
      fonte({ id: "M", tipo: "capitale", nome: "Mario Rossi", impegno: 200_000 }),
      fonte({ id: "B", tipo: "banca", nome: "Banca Locale", impegno: 500_000, tassoPct: 4.5, dataInizio: "2027-02-01", scadenza: "2028-12-31", forma: "mutuo_fondiario" }),
    ],
    movimenti: [
      { id: "1", fonteId: "P", tipo: "versamento", data: "2027-01-10", importo: 300_000, nota: null },
      { id: "2", fonteId: "M", tipo: "versamento", data: "2027-01-15", importo: 200_000, nota: null },
      { id: "3", fonteId: "B", tipo: "versamento", data: "2027-04-01", importo: 150_000, nota: null },
    ],
    numeri: numeriDalPiano(numeriPerInvestitori(piano), piano.confronto.costi),
    oggi: OGGI,
  });
};

const unita = (p: Partial<UnitaGenerale> & Pick<UnitaGenerale, "orderId" | "sigla">): UnitaGenerale => ({
  codice: null, nome: p.sigla, scheda: true, id: `id-${p.orderId}`, edificio: null, piano: null, tipologia: "Appartamento",
  mq: 90, millesimi: null, listino: 750_000, trattato: null, rogito: null, provvigione: null, stato: "libera",
  dataPrenotazione: null, dataCompromesso: null, rogitoPrevisto: null, dataRogito: null, acquirenteId: null, acquirente: null,
  agenzia: null, note: null, origineId: null, divisaIl: null, movimenti: [], importoCommessa: 750_000, costoDiretto: 0, ...p,
});

export const unitaSviluppo = (): ElencoUnita => ({
  modello: "sviluppo",
  costiGenerale: 300_000,
  unita: [
    unita({ orderId: "u1", sigla: "A1", stato: "compromesso", trattato: 740_000, movimenti: [{ id: "m1", tipo: "caparra", importo: 74_000, data: "2027-05-02", descrizione: null }] }),
    unita({ orderId: "u2", sigla: "A2" }),
  ],
  permessi: { importi: true, costi: true, margini: true, modifica: true },
});

export const fotografieSviluppo: FotografiaPiano[] = ["2027-03", "2027-04", "2027-05"].map((mese, i) => ({
  mese, versioneNumero: 1, versioneStato: "approvata",
  ricaviPrevisti: 1_500_000, costiPrevisti: 1_100_000, ricaviReali: 0, costiReali: 300_000 + i * 100_000,
  ricaviStima: 1_500_000 - i * 10_000, costiStima: 1_100_000 + i * 5_000, capitaleMassimoPrevisto: 900_000,
  capitaleInvestito: 300_000 + i * 100_000, origine: "automatica",
}));

export const inputSviluppo = (p: Partial<InputDossier> = {}): InputDossier => {
  const riepilogo = p.riepilogo ?? riepilogoSviluppo();
  const margini = riepilogo.permessi.margini;
  return {
    oggi: OGGI,
    periodo: { dal: "2027-01-01", al: OGGI },
    modello: "completo",
    sezioni: ["sintesi", "avanzamento", "foto", "piano", "andamento", "cassa", "fonti", "investitori", "unita", "contratto", "documenti", "note"],
    riepilogo,
    azienda: { nome: "Edil Srl", partitaIva: "01234567890", indirizzo: "Via Garibaldi 1, 10100 Torino (TO)", email: "info@edil.example", telefono: null, logo: null },
    // Senza il permesso sui margini gli hook non leggono niente: qui come lì.
    piano: margini ? pianoSviluppo() : null,
    versionePiano: margini ? { id: "ver1", numero: 1, stato: "approvata", nota: null, approvataIl: "2027-01-20", creataIl: "2027-01-10" } : null,
    fotografie: margini ? fotografieSviluppo : null,
    conti: margini ? contiSviluppo() : null,
    unita: unitaSviluppo(),
    contratto: null,
    checklist: calcolaChecklist({
      voci: vociDelModello("sviluppo"), generaleId: "g1",
      figlie: riepilogo.figlie.map((f) => ({ id: f.id, incassato: f.incassato })),
      allegati: [{ id: "a1", order_id: "g1", file_name: "Permesso di costruire.pdf", file_url: "x", file_type: "application/pdf", created_at: "2027-01-12" }],
      segni: [], oggi: OGGI,
    }),
    foto: [],
    note: "Le vendite del secondo lotto partono a settembre.",
    ...p,
  };
};

export const riepilogoAppalto = (permessi = permessiTutti): RiepilogoGenerale => ({
  generale: { id: "g2", codice: "AP-27", nome: "Manutenzione scuole 2027", cliente: "Comune di Asti", clienteId: "c1", modello: "appalto", creataIl: "2027-01-05", valore: 1_000_000 },
  figlie: [figlia("o1", "Scuola Rodari", { avanzamento: 70 }), figlia("o2", "Scuola Collodi", { avanzamento: 20 })],
  permessi,
});

export const contrattoAppalto = (): DatiContratto => ({
  permessi: { importi: true, modifica: true },
  contratto: {
    ...CONTRATTO_VUOTO,
    riferimento: "Rep. 123/2027", importoBase: 1_000_000, ribassoPct: 10, oneriSicurezza: 30_000,
    dataFirma: "2027-01-05", dataConsegnaLavori: "2027-01-20", dataFinePrevista: "2027-12-31",
    anticipazionePct: 20, anticipazioneImporto: 186_000, anticipazioneData: "2027-02-01", ritenutaPct: 0.5, cig: "ABC123", cup: "J12345",
  },
  atti: [{ id: "at1", tipo: "atto_aggiuntivo", numero: "1", data: "2027-04-01", descrizione: "Rifacimento palestra", importo: 50_000, giorniProroga: 30, allegato: null }],
  garanzie: [{ id: "ga1", tipo: "cauzione_definitiva", garante: "Assicura Spa", numero: "P-77", importo: 93_000, dataEmissione: "2027-01-03", scadenza: "2027-07-01", svincolataIl: null, note: null, allegato: null }],
  sal: [{
    id: "s1", numero: 1, stato: "emesso", data: "2027-04-30", note: null, cumulativo: 300_000, dal: "2027-01-20", al: "2027-04-30", precedente: 0,
    lordo: 300_000, ritenutaPct: 0.5, ritenuta: 1_500, recuperoPct: 20, recupero: 60_000, netto: 238_500, diContratto: true,
    registro: null, firma: null, voci: [],
  }],
  fatture: [{ id: "f1", numero: "12", data: "2027-05-05", scadenza: "2027-06-04", stato: "inviata", totale: 238_500, incassato: 0 }],
  elencoVoci: 0,
});

export const inputAppalto = (p: Partial<InputDossier> = {}): InputDossier => ({
  oggi: OGGI,
  periodo: { dal: null, al: OGGI },
  modello: "banca",
  sezioni: ["sintesi", "avanzamento", "contratto", "documenti"],
  riepilogo: riepilogoAppalto(),
  azienda: { nome: "Edil Srl", partitaIva: null, indirizzo: null, email: null, telefono: null, logo: null },
  piano: null,
  contratto: contrattoAppalto(),
  checklist: null,
  ...p,
});
