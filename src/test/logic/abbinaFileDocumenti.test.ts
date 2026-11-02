import { describe, expect, it } from 'vitest';
import {
  abbinaFile, punteggioAbbinamento, titoloDaNomeFile, type DocumentoDaAbbinare,
} from '@/lib/documentiAzienda/abbinaFile';

// Le carte vere di Impresa Vulcano: è su queste che l'abbinamento deve funzionare.
const DOCUMENTI: DocumentoDaAbbinare[] = [
  { id: 'durc', titolo: 'DURC', ente: 'INAIL / INPS / Cassa Edile' },
  { id: 'soa', titolo: 'SOA — attestazione', ente: 'Organismo di attestazione', numero: 'AT-12345' },
  { id: 'visura', titolo: 'Visura camerale', ente: 'Camera di Commercio' },
  { id: 'iso9001', titolo: 'ISO 9001 — Qualità' },
  { id: 'iso14001', titolo: 'ISO 14001 — Ambiente' },
  { id: 'iso45001', titolo: 'ISO 45001 — Salute e sicurezza' },
  { id: 'rc-ditta', titolo: 'Responsabilità civile — ditta' },
  { id: 'rc-ufficio', titolo: 'Responsabilità civile — ufficio' },
  { id: 'rentri', titolo: 'Iscrizione RENTRI' },
  { id: 'estintori', titolo: 'Verifica dei 4 estintori' },
];

function abbinati(nomi: string[]): Array<string | null> {
  return abbinaFile(nomi, DOCUMENTI).map((a) => a.documentoId);
}

describe('abbinaFile', () => {
  it('riconosce la carta dal nome del file, anche scritto male', () => {
    expect(abbinati(['DURC_ottobre_2026.pdf'])).toEqual(['durc']);
    expect(abbinati(['iso14001.pdf'])).toEqual(['iso14001']);
    expect(abbinati(['visura-camerale-30-09-2026.PDF'])).toEqual(['visura']);
    expect(abbinati(['Iscrizione RENTRI.pdf'])).toEqual(['rentri']);
  });

  it('il numero del documento basta da solo', () => {
    expect(abbinati(['scan AT-12345.pdf'])).toEqual(['soa']);
  });

  it('a pari merito non indovina: la tendina resta da scegliere', () => {
    // «ISO.pdf» davanti a tre ISO: nessuno sa quale sia, e sbagliare in silenzio
    // è peggio che chiedere.
    expect(abbinati(['ISO.pdf'])).toEqual([null]);
    expect(abbinati(['responsabilita civile.pdf'])).toEqual([null]);
  });

  it('un nome che non dice niente resta senza abbinamento', () => {
    expect(abbinati(['scan0001.pdf', 'documento firmato.pdf', 'IMG_4471.jpeg'])).toEqual([null, null, null]);
  });

  it('due file non finiscono sulla stessa carta', () => {
    const esito = abbinati(['DURC.pdf', 'durc_vecchio.pdf']);
    expect(esito.filter((id) => id === 'durc')).toHaveLength(1);
    expect(esito.filter((id) => id === null)).toHaveLength(1);
  });

  it('distingue le carte che si somigliano', () => {
    expect(abbinati([
      'ISO 9001.pdf', 'ISO 14001.pdf', 'ISO 45001.pdf',
      'RC ditta.pdf', 'RC ufficio.pdf',
    ])).toEqual(['iso9001', 'iso14001', 'iso45001', 'rc-ditta', 'rc-ufficio']);
  });

  it('l’anno nel nome non vale come una parola del titolo', () => {
    // «2026» sta nel nome di mezzo archivio: da solo non deve abbinare niente.
    expect(punteggioAbbinamento('2026.pdf', { id: 'x', titolo: 'Polizza 2026' })).toBeLessThan(4);
  });

  it('senza documenti in elenco non propone niente e non si rompe', () => {
    expect(abbinaFile(['DURC.pdf'], [])).toEqual([{ file: 0, documentoId: null, punteggio: 0 }]);
  });
});

describe('titoloDaNomeFile', () => {
  it('fa un titolo leggibile dal nome del file', () => {
    expect(titoloDaNomeFile('durc_ottobre_2026.pdf')).toBe('Durc ottobre 2026');
    expect(titoloDaNomeFile('polizza-incendio.PDF')).toBe('Polizza incendio');
    expect(titoloDaNomeFile('.pdf')).toBe('Documento senza nome');
  });
});
