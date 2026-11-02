/**
 * La scadenza letta dal documento, non battuta a mano.
 *
 * Con i file dentro (il caricamento in blocco) le date restano l'ultimo lavoro
 * manuale: ventitré carte vogliono ventitré date copiate da ventitré PDF. Il
 * documento ce l'ha scritta sopra, e lo stesso lettore che legge i DDT e i
 * libretti dei mezzi (`generic-doc-ai-extract`) la trova.
 *
 * La regola che conta è una: **la data si propone, non si scrive.** Una scadenza
 * sbagliata su un DURC è peggio di una scadenza mancante — quella mancante la
 * vedi vuota, quella sbagliata ti fa credere di essere a posto e te ne accorgi
 * in gara. Quindi:
 *   - niente proposta sotto `FIDUCIA_MINIMA`: se il modello non è sicuro,
 *     meglio il campo vuoto che un numero inventato;
 *   - niente date fuori da una finestra credibile (una «scadenza» nel 1970 o nel
 *     2140 è un errore di lettura, non una scadenza);
 *   - niente proposte sui campi che una persona ha già compilato: li decide lei.
 *
 * Qui dentro non si scrive niente nel database: si traduce la risposta del
 * modello in una proposta, e la proposta la conferma chi carica.
 */
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edgeFunctionError';
import { CATEGORIE_DOCUMENTO, PREAVVISO_PREDEFINITO } from '@/types/documentiAzienda';
import type { CartaDaLeggere, CategoriaDocumento, DatiDocumento } from '@/types/documentiAzienda';

/** Sotto questa fiducia non si propone niente: il campo resta vuoto. */
export const FIDUCIA_MINIMA = 0.5;

/** Una «scadenza» più vecchia di così è un errore di lettura, non una scadenza. */
const ANNI_INDIETRO = 15;
/** E una più lontana di così nemmeno: le carte della ditta non durano trent'anni. */
const ANNI_AVANTI = 25;

export interface LetturaCarta {
  titolo: string | null;
  ente: string | null;
  numero: string | null;
  categoria: CategoriaDocumento | null;
  data_documento: string | null;
  data_scadenza: string | null;
  /** Il documento dichiara di non scadere (una visura è una fotografia del registro). */
  senza_scadenza: boolean;
  /** Quanto il modello si fida di sé: sotto FIDUCIA_MINIMA la proposta è vuota. */
  fiducia: number | null;
}

export const LETTURA_VUOTA: LetturaCarta = {
  titolo: null, ente: null, numero: null, categoria: null,
  data_documento: null, data_scadenza: null, senza_scadenza: false, fiducia: null,
};

function testo(v: unknown, massimo: number): string | null {
  if (typeof v !== 'string') return null;
  const pulito = v.trim().replace(/\s+/g, ' ');
  if (!pulito || pulito.toLowerCase() === 'null' || pulito === '-') return null;
  return pulito.slice(0, massimo);
}

/** Una data solo se è una data ISO vera: `2026-02-31` non lo è. */
function dataISO(v: unknown): string | null {
  const s = testo(v, 10);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [a, m, g] = s.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, g));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== g) return null;
  return s;
}

function dentroLaFinestra(iso: string, oggi: Date, indietro: number, avanti: number): boolean {
  const anno = Number(iso.slice(0, 4));
  const ora = oggi.getUTCFullYear();
  return anno >= ora - indietro && anno <= ora + avanti;
}

/** Le parole con cui si riconosce dove va la carta: il modello dà il tipo, non la categoria. */
const CATEGORIA_DA_PAROLE: Array<[CategoriaDocumento, RegExp]> = [
  ['appalti_pubblici', /\b(durc|soa|white ?list|anac|contributiv)/i],
  ['assicurazioni', /\b(polizza|assicurat|rc[ at]?\b|fideiussion|catastrofal|incendio|infortun|tutela legale)/i],
  ['ambiente_rifiuti', /\b(rentri|rifiut|sistri|ambiental|albo gestori|analisi (dei )?rifiuti|agest)/i],
  ['sicurezza', /\b(estintor|antincendio|dvr|pos\b|psc\b|rspp|sicurezza|primo soccorso|imbracatur)/i],
  ['certificazioni', /\b(iso|visura|camer|certificat|attestazion|accredit|sintel|qualit)/i],
  ['sedi_utenze', /\b(contator|utenza|locazion|affitto|imposta di registro|sede)/i],
];

/** Dove mettere la carta, dal tipo e dal titolo che il modello ha letto. */
export function categoriaDaLettura(tipo: string | null, titolo: string | null): CategoriaDocumento | null {
  const insieme = [tipo, titolo].filter(Boolean).join(' ');
  if (!insieme.trim()) return null;
  for (const [categoria, parole] of CATEGORIA_DA_PAROLE) {
    if (parole.test(insieme)) return categoria;
  }
  return null;
}

/**
 * La risposta del modello tradotta in una proposta, o la proposta vuota.
 *
 * `oggi` si passa per i test: la finestra delle date credibili si muove con il
 * tempo, e un test che fra due anni fallisce da solo non è un test.
 */
export function interpretaLettura(grezzo: unknown, oggi: Date = new Date()): LetturaCarta {
  if (!grezzo || typeof grezzo !== 'object') return LETTURA_VUOTA;
  const r = grezzo as Record<string, unknown>;

  // La fiducia la mette il prompt condiviso (0…1). Se non c'è si procede: la
  // proposta si vede comunque prima di diventare un dato.
  const fiducia = typeof r.confidence === 'number' && Number.isFinite(r.confidence)
    ? Math.max(0, Math.min(1, r.confidence))
    : null;
  if (fiducia !== null && fiducia < FIDUCIA_MINIMA) return { ...LETTURA_VUOTA, fiducia };

  const titolo = testo(r.titolo, 120);
  const tipo = testo(r.tipo_documento, 80);

  const documento = dataISO(r.data_documento);
  const scadenza = dataISO(r.data_scadenza);

  return {
    titolo,
    ente: testo(r.ente, 120),
    numero: testo(r.numero, 60),
    categoria: categoriaDaLettura(tipo, titolo),
    // Un documento emesso fra dieci anni non esiste: è una lettura sbagliata.
    data_documento: documento && dentroLaFinestra(documento, oggi, 40, 1) ? documento : null,
    data_scadenza: scadenza && dentroLaFinestra(scadenza, oggi, ANNI_INDIETRO, ANNI_AVANTI) ? scadenza : null,
    senza_scadenza: r.senza_scadenza === true,
    fiducia,
  };
}

/** Vero se la categoria letta è una delle nostre (il modello risponde in italiano libero). */
export function categoriaValida(c: string | null | undefined): c is CategoriaDocumento {
  return !!c && (CATEGORIE_DOCUMENTO as readonly string[]).includes(c);
}

/** Di questi il modello legge il contenuto; un .doc no, e chiederlo è solo spesa. */
export function siPuoLeggere(nomeOMime: string): boolean {
  return /\.(pdf|jpe?g|png)$/i.test(nomeOMime) || /^(application\/pdf|image\/(jpeg|png))$/i.test(nomeOMime);
}

/** Le carte su cui ha senso chiedere: un .doc o un .heic non si leggono. */
export function daFarLeggere<T extends { nomeFile: string; mime: string | null }>(carte: T[]): T[] {
  return carte.filter((c) => siPuoLeggere(c.nomeFile) || siPuoLeggere(c.mime ?? ''));
}

/**
 * Manda al lettore un file già nell'archivio e torna con la proposta.
 *
 * Consuma credito AI dell'azienda, una volta per file: la funzione tiene in
 * cache la lettura dello stesso documento per novanta giorni, quindi riprovare
 * non ripaga.
 */
export async function leggiCartaConAI(args: {
  companyId: string;
  path: string;
  nomeFile: string;
  mime?: string | null;
}): Promise<LetturaCarta> {
  const { data, error } = await supabase.functions.invoke('generic-doc-ai-extract', {
    body: {
      storage_bucket: 'azienda-documenti',
      storage_path: args.path,
      file_name: args.nomeFile,
      mime_type: args.mime || 'application/pdf',
      company_id: args.companyId,
      doc_type: 'documento_azienda',
    },
  });
  if (error) throw new Error(await edgeErrorMessage(error, 'Non è riuscito a leggere il documento'));
  if (data?.error) throw new Error(String(data.error));
  return interpretaLettura(data?.extracted);
}

/**
 * Cosa finisce davvero sulla carta, una volta confermata la lettura.
 *
 * Due regole, e sono tutta la prudenza di questa funzione:
 *   - **non si sovrascrive niente**: un campo che una persona ha compilato resta
 *     com'è, anche se il documento dice altro. Chi ha scritto quel numero aveva
 *     il documento in mano;
 *   - la data che si scrive è quella che si vede nel campo (`scadenzaScelta`),
 *     non quella che ha letto il modello: se chi conferma la corregge, vince lui.
 *
 * Titolo e categoria si toccano solo sulle carte nate dal nome di un file
 * («Durc ottobre 2026» in «Altro»): lì il nome del file era un ripiego, e quello
 * scritto sul documento è meglio.
 */
export function campiDaScrivere(
  carta: CartaDaLeggere,
  lettura: LetturaCarta,
  scadenzaScelta: string,
): Partial<DatiDocumento> {
  const dati: Partial<DatiDocumento> = {};
  const scadenza = dataISO(scadenzaScelta);
  if (scadenza) dati.data_scadenza = scadenza;
  if (!carta.data_documento && lettura.data_documento) dati.data_documento = lettura.data_documento;
  if (!carta.ente && lettura.ente) dati.ente = lettura.ente;
  if (!carta.numero && lettura.numero) dati.numero = lettura.numero;
  if (carta.titoloDalNome && lettura.titolo) dati.titolo = lettura.titolo;
  if (carta.titoloDalNome && lettura.categoria && lettura.categoria !== carta.categoria) {
    dati.categoria = lettura.categoria;
    // Il preavviso di partenza segue la categoria: sul DURC due mesi, su una ISO
    // altrettanto, su un contatore trenta giorni. Sulle carte nuove è ancora
    // quello di riserva, quindi non si sta scavalcando nessuna scelta.
    dati.alert_giorni_prima = PREAVVISO_PREDEFINITO[lettura.categoria];
  }
  return dati;
}

/** C'è qualcosa da proporre su questa carta? (Niente da scrivere = niente da confermare.) */
export function qualcosaDaProporre(carta: CartaDaLeggere, lettura: LetturaCarta): boolean {
  return Object.keys(campiDaScrivere(carta, lettura, lettura.data_scadenza ?? '')).length > 0;
}
