/**
 * Abbinare i file trascinati ai documenti già in elenco, guardando il nome.
 *
 * Chi ha l'archivio su una cartella del server ha venti PDF che si chiamano
 * `DURC_ottobre_2026.pdf`, `iso14001.pdf`, `polizza-rc-ditta.pdf`. Allegarli uno per
 * uno costa venti giri; abbinarli a mano in una tendina da ventitré voci costa quasi
 * uguale. Qui si propone l'abbinamento e lo si fa vedere: **nessun file si attacca da
 * solo**. Un file sulla carta sbagliata è peggio di un file non caricato — in una gara
 * presenti il DURC e ci trovano la polizza incendio.
 *
 * Il punteggio guarda **quanta parte del titolo ricompare nel nome del file**, non
 * quante parole in assoluto: così «DURC», che è una parola sola, vale come
 * «Responsabilità civile — ditta», che sono tre. Il numero del documento, se c'è, vale
 * da solo (`AT-12345` nel nome di un file non ci finisce per caso).
 *
 * Due regole di prudenza, perché la macchina qui non deve indovinare:
 *   - sotto `PUNTEGGIO_MINIMO` la tendina resta vuota;
 *   - se il secondo classificato è lì lì col primo (`MARGINE`), resta vuota comunque:
 *     con `ISO.pdf` davanti a «ISO 9001», «ISO 14001» e «ISO 45001» nessuno può sapere,
 *     e tirare a indovinare è il modo di sbagliare in silenzio.
 */

export interface DocumentoDaAbbinare {
  id: string;
  titolo: string;
  numero?: string | null;
  ente?: string | null;
}

export interface Abbinamento {
  /** Posizione del file nell'elenco passato a `abbinaFile`. */
  file: number;
  /** Il documento proposto, oppure null: lo sceglie chi carica. */
  documentoId: string | null;
  punteggio: number;
}

/** Sotto questa soglia non si propone niente. */
export const PUNTEGGIO_MINIMO = 4;

/** Di quanto il primo deve battere il secondo perché l'abbinamento sia credibile. */
export const MARGINE = 1.5;

/**
 * Parole che compaiono in mezzo a tutto e non distinguono niente: tolte da entrambe le
 * parti, così `DURC_documento_firmato.pdf` e «DURC» si somigliano come devono.
 */
const PAROLE_VUOTE = new Set([
  'documento', 'documenti', 'doc', 'scan', 'scansione', 'scansioni', 'copia', 'file',
  'definitivo', 'def', 'firmato', 'firmata', 'nuovo', 'nuova', 'rinnovo', 'rinnovato',
  'allegato', 'img', 'image', 'foto', 'pdf',
  'del', 'dei', 'delle', 'della', 'dello', 'di', 'da', 'il', 'lo', 'la', 'le', 'gli',
  'e', 'ed', 'in', 'con', 'per', 'su',
  'srl', 'spa', 'snc', 'sas', 'sl',
]);

/**
 * Le abbreviazioni del mestiere: chi salva il file scrive `RC_ditta.pdf`, in elenco il
 * documento si chiama «Responsabilità civile — ditta». Senza questa tabella le due cose
 * non si somigliano per niente, e l'abbinamento più ovvio dell'archivio va perso.
 */
const ABBREVIAZIONI: Record<string, string[]> = {
  rc: ['responsabilita', 'civile'],
  rct: ['responsabilita', 'civile'],
  rco: ['responsabilita', 'civile'],
  dvr: ['valutazione', 'rischi'],
  pos: ['piano', 'operativo', 'sicurezza'],
  psc: ['piano', 'sicurezza', 'coordinamento'],
  cciaa: ['camera', 'commercio'],
  rspp: ['prevenzione', 'protezione'],
  ccnl: ['contratto', 'collettivo'],
  ape: ['prestazione', 'energetica'],
};

/** Minuscole, senza accenti, un solo spazio fra le parole. */
export function normalizza(testo: string): string {
  return testo
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** `DURC ottobre 2026.pdf` → `DURC ottobre 2026`. Solo le estensioni vere. */
export function senzaEstensione(nomeFile: string): string {
  return nomeFile.replace(/\.(pdf|jpe?g|png|heic|heif|docx?|p7m|tiff?|webp)$/i, '');
}

function parole(testo: string): string[] {
  return normalizza(testo).split(' ').filter((p) => p.length > 0 && !PAROLE_VUOTE.has(p));
}

/** Un anno è quasi sempre rumore: sta nel nome di mezzo archivio. */
function eUnAnno(parola: string): boolean {
  return /^(19|20)\d{2}$/.test(parola);
}

/** Le parole del nome del file, con le abbreviazioni sciolte. */
function paroleDelFile(nomeFile: string): Set<string> {
  const trovate = parole(senzaEstensione(nomeFile));
  const tutte = new Set(trovate);
  for (const p of trovate) for (const sciolta of ABBREVIAZIONI[p] ?? []) tutte.add(sciolta);
  return tutte;
}

/**
 * Quanto questo nome di file somiglia a questo documento.
 *
 * Il grosso è la quota di titolo coperta (tutto il titolo vale 8); poi un punto per
 * parola azzeccata, così «ISO 14001 — Ambiente» batte «ISO 9001» quando il numero c'è.
 * L'ente vale poco — «INAIL» sta su mezzo archivio — e il numero vale da solo.
 */
export function punteggioAbbinamento(nomeFile: string, documento: DocumentoDaAbbinare): number {
  const paroleNome = paroleDelFile(nomeFile);
  if (paroleNome.size === 0) return 0;
  const compatto = normalizza(senzaEstensione(nomeFile)).replace(/ /g, '');

  // Quanta parte di `testo` ricompare nel nome del file, in quote (0…1) e in parole.
  const copertura = (testo: string | null | undefined): { quota: number; parole: number } => {
    if (!testo) return { quota: 0, parole: 0 };
    let coperte = 0;
    let totale = 0;
    for (const p of parole(testo)) {
      const peso = eUnAnno(p) ? 0.4 : 1;
      totale += peso;
      if (paroleNome.has(p)) coperte += peso;
      // `iso14001.pdf` è una parola sola: il titolo lo si ritrova solo nel nome
      // senza spazi.
      else if (p.length >= 3 && compatto.includes(p)) coperte += peso * 0.7;
    }
    return totale > 0 ? { quota: coperte / totale, parole: coperte } : { quota: 0, parole: 0 };
  };

  const titolo = copertura(documento.titolo);
  const ente = copertura(documento.ente);
  let punteggio = titolo.quota * 8 + titolo.parole + ente.quota * 2;

  const numero = documento.numero ? normalizza(documento.numero).replace(/ /g, '') : '';
  if (numero.length >= 4 && compatto.includes(numero)) punteggio += 6;

  return Math.round(punteggio * 10) / 10;
}

/**
 * Per ogni file il documento che gli somiglia di più, senza che due file finiscano sulla
 * stessa carta: si assegnano prima gli abbinamenti più sicuri, e chi resta senza posto
 * resta da scegliere a mano.
 */
export function abbinaFile(nomiFile: string[], documenti: DocumentoDaAbbinare[]): Abbinamento[] {
  const esito: Abbinamento[] = nomiFile.map(
    (_, file): Abbinamento => ({ file, documentoId: null, punteggio: 0 }),
  );

  const candidati: Array<{ file: number; documentoId: string; punteggio: number }> = [];
  for (let i = 0; i < nomiFile.length; i++) {
    const punteggi = documenti
      .map((d) => ({ file: i, documentoId: d.id, punteggio: punteggioAbbinamento(nomiFile[i], d) }))
      .filter((c) => c.punteggio >= PUNTEGGIO_MINIMO)
      .sort((a, b) => b.punteggio - a.punteggio);
    if (punteggi.length === 0) continue;
    if (punteggi.length > 1 && punteggi[0].punteggio - punteggi[1].punteggio < MARGINE) continue;
    candidati.push(punteggi[0]);
  }

  candidati.sort((a, b) => b.punteggio - a.punteggio);
  const filePresi = new Set<number>();
  const documentiPresi = new Set<string>();
  for (const c of candidati) {
    if (filePresi.has(c.file) || documentiPresi.has(c.documentoId)) continue;
    filePresi.add(c.file);
    documentiPresi.add(c.documentoId);
    esito[c.file] = { file: c.file, documentoId: c.documentoId, punteggio: c.punteggio };
  }

  return esito;
}

/** `DURC_ottobre_2026.pdf` → `DURC ottobre 2026`: il titolo di partenza di un documento nuovo. */
export function titoloDaNomeFile(nomeFile: string): string {
  const pulito = senzaEstensione(nomeFile).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!pulito) return 'Documento senza nome';
  return pulito.charAt(0).toUpperCase() + pulito.slice(1);
}
