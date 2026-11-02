/**
 * La scadenza letta dal PDF: cosa si propone e, soprattutto, cosa NON si propone.
 *
 * Il valore di questa lettura sta tutto nel secondo elenco. Una data sbagliata su
 * un DURC è peggio di una data mancante: quella mancante si vede vuota, quella
 * sbagliata fa credere di essere a posto fino al giorno della gara. Quindi un
 * modello incerto, una data impossibile (`2026-02-31`) o fuori da una finestra
 * credibile non arrivano al campo.
 */
import { describe, expect, it } from 'vitest';
import {
  FIDUCIA_MINIMA, LETTURA_VUOTA, campiDaScrivere, categoriaDaLettura, interpretaLettura,
  qualcosaDaProporre, siPuoLeggere, type LetturaCarta,
} from '@/lib/documentiAzienda/letturaAI';
import type { CartaDaLeggere } from '@/types/documentiAzienda';

const OGGI = new Date(Date.UTC(2026, 10, 2));

describe('quello che il documento dice davvero', () => {
  it('un DURC letto bene diventa una proposta completa', () => {
    const letto = interpretaLettura({
      tipo_documento: 'DURC',
      titolo: 'DURC',
      ente: 'INAIL / INPS',
      numero: 'INAIL_50937496',
      data_documento: '2026-06-17',
      data_scadenza: '2026-10-15',
      senza_scadenza: false,
      confidence: 0.95,
    }, OGGI);
    expect(letto.data_scadenza).toBe('2026-10-15');
    expect(letto.data_documento).toBe('2026-06-17');
    expect(letto.categoria).toBe('appalti_pubblici');
    expect(letto.numero).toBe('INAIL_50937496');
  });

  it('una visura dice di non scadere, e non si inventa una scadenza', () => {
    const letto = interpretaLettura({
      tipo_documento: 'visura camerale',
      titolo: 'Visura camerale',
      ente: 'Camera di Commercio',
      data_documento: '2026-09-30',
      data_scadenza: null,
      senza_scadenza: true,
      confidence: 0.9,
    }, OGGI);
    expect(letto.senza_scadenza).toBe(true);
    expect(letto.data_scadenza).toBeNull();
    expect(letto.categoria).toBe('certificazioni');
  });
});

describe('quello che non si propone', () => {
  it('se il modello non è sicuro, i campi restano vuoti', () => {
    const letto = interpretaLettura({
      titolo: 'Forse un DURC',
      data_scadenza: '2027-01-01',
      confidence: FIDUCIA_MINIMA - 0.01,
    }, OGGI);
    expect(letto).toEqual({ ...LETTURA_VUOTA, fiducia: FIDUCIA_MINIMA - 0.01 });
  });

  it('una data che non esiste non è una data', () => {
    for (const falsa of ['2026-02-31', '2026-13-01', '15/10/2026', '2026-10', 'ottobre 2026', '']) {
      const letto = interpretaLettura({ data_scadenza: falsa, confidence: 0.9 }, OGGI);
      expect(letto.data_scadenza, falsa).toBeNull();
    }
  });

  it('una scadenza nel 1978 o nel 2140 è un errore di lettura', () => {
    for (const fuori of ['1978-05-04', '2140-01-01', '1999-12-31']) {
      expect(interpretaLettura({ data_scadenza: fuori, confidence: 0.9 }, OGGI).data_scadenza, fuori).toBeNull();
    }
    // ma una scaduta da poco e una lunga sì: la SOA quinquennale arriva al 2028
    expect(interpretaLettura({ data_scadenza: '2025-09-01', confidence: 0.9 }, OGGI).data_scadenza).toBe('2025-09-01');
    expect(interpretaLettura({ data_scadenza: '2029-08-03', confidence: 0.9 }, OGGI).data_scadenza).toBe('2029-08-03');
  });

  it('un documento emesso nel futuro non esiste', () => {
    expect(interpretaLettura({ data_documento: '2040-01-01', confidence: 0.9 }, OGGI).data_documento).toBeNull();
    // uno vecchio invece sì: un certificato del 2009 sta in archivio
    expect(interpretaLettura({ data_documento: '2009-03-01', confidence: 0.9 }, OGGI).data_documento).toBe('2009-03-01');
  });

  it('«null» scritto a parole, o uno spazio, non è un valore', () => {
    const letto = interpretaLettura({ titolo: '  ', ente: 'null', numero: '-', confidence: 0.9 }, OGGI);
    expect(letto.titolo).toBeNull();
    expect(letto.ente).toBeNull();
    expect(letto.numero).toBeNull();
  });

  it('una risposta che non è un oggetto non propone niente', () => {
    for (const spazzatura of [null, undefined, 'niente', 42, ['a']]) {
      expect(interpretaLettura(spazzatura, OGGI)).toEqual(LETTURA_VUOTA);
    }
  });
});

describe('dove va la carta', () => {
  it.each([
    ['DURC', 'DURC', 'appalti_pubblici'],
    ['attestazione SOA', 'Attestazione SOA', 'appalti_pubblici'],
    ['polizza assicurativa', 'Tutela legale ditta', 'assicurazioni'],
    ['certificato', 'ISO 14001 — Ambiente', 'certificazioni'],
    ['iscrizione albo o registro', 'Iscrizione RENTRI', 'ambiente_rifiuti'],
    ['verifica estintori', 'Controllo estintori', 'sicurezza'],
    ['altro', 'Contatore Mazzolari', 'sedi_utenze'],
  ])('«%s / %s» → %s', (tipo, titolo, attesa) => {
    expect(categoriaDaLettura(tipo, titolo)).toBe(attesa);
  });

  it('se non si capisce, nessuna categoria: la sceglie chi carica', () => {
    expect(categoriaDaLettura(null, null)).toBeNull();
    expect(categoriaDaLettura('altro', 'Documento 4471')).toBeNull();
  });
});

describe('che file si mandano a leggere', () => {
  it('PDF e foto sì, il resto no: chiederlo è solo spesa', () => {
    for (const buono of ['DURC.pdf', 'iso.PDF', 'foto.jpg', 'scan.jpeg', 'certificato.png', 'application/pdf', 'image/jpeg']) {
      expect(siPuoLeggere(buono), buono).toBe(true);
    }
    for (const no of ['contratto.docx', 'vecchio.doc', 'foto.heic', 'archivio.zip', 'text/plain']) {
      expect(siPuoLeggere(no), no).toBe(false);
    }
  });
});

// ── Cosa finisce davvero sulla carta ─────────────────────────────────────────

const CARTA_NUOVA: CartaDaLeggere = {
  documentoId: 'c-1',
  nomeFile: 'DURC_ottobre_2026.pdf',
  path: 'azienda/uuid-DURC_ottobre_2026.pdf',
  mime: 'application/pdf',
  titolo: 'DURC ottobre 2026',
  ente: null,
  numero: null,
  data_documento: null,
  categoria: 'altro',
  titoloDalNome: true,
};

const LETTO_DURC: LetturaCarta = {
  titolo: 'DURC',
  ente: 'INAIL / INPS',
  numero: '50937496',
  categoria: 'appalti_pubblici',
  data_documento: '2026-06-17',
  data_scadenza: '2026-10-15',
  senza_scadenza: false,
  fiducia: 0.95,
};

describe('cosa finisce sulla carta', () => {
  it('una carta nata dal nome di un file prende titolo, categoria e preavviso veri', () => {
    const dati = campiDaScrivere(CARTA_NUOVA, LETTO_DURC, '2026-10-15');
    expect(dati).toEqual({
      data_scadenza: '2026-10-15',
      data_documento: '2026-06-17',
      ente: 'INAIL / INPS',
      numero: '50937496',
      titolo: 'DURC',
      categoria: 'appalti_pubblici',
      alert_giorni_prima: 60,
    });
  });

  it('quello che una persona ha già scritto non si tocca', () => {
    const suo: CartaDaLeggere = {
      ...CARTA_NUOVA,
      titolo: 'DURC',
      ente: 'Cassa Edile di Milano',
      numero: 'AT-12345',
      data_documento: '2026-06-01',
      categoria: 'appalti_pubblici',
      titoloDalNome: false,
    };
    expect(campiDaScrivere(suo, LETTO_DURC, '2026-10-15')).toEqual({ data_scadenza: '2026-10-15' });
  });

  it('la data che vince è quella nel campo, non quella del modello', () => {
    const dati = campiDaScrivere(CARTA_NUOVA, LETTO_DURC, '2026-10-20');
    expect(dati.data_scadenza).toBe('2026-10-20');
  });

  it('campo svuotato da chi conferma = nessuna scadenza scritta', () => {
    const dati = campiDaScrivere(CARTA_NUOVA, LETTO_DURC, '');
    expect(dati.data_scadenza).toBeUndefined();
    // il resto della lettura resta: il titolo vero vale anche senza la data
    expect(dati.titolo).toBe('DURC');
  });

  it('una data corretta a mano ma impossibile non passa', () => {
    expect(campiDaScrivere(CARTA_NUOVA, LETTO_DURC, '2026-02-31').data_scadenza).toBeUndefined();
  });

  it('se la lettura è vuota non c\'è niente da confermare', () => {
    expect(campiDaScrivere(CARTA_NUOVA, LETTURA_VUOTA, '')).toEqual({});
    expect(qualcosaDaProporre(CARTA_NUOVA, LETTURA_VUOTA)).toBe(false);
    expect(qualcosaDaProporre(CARTA_NUOVA, LETTO_DURC)).toBe(true);
  });

  it('una carta già completa senza scadenza letta: niente da proporre', () => {
    const completa: CartaDaLeggere = {
      ...CARTA_NUOVA, titolo: 'Visura camerale', ente: 'Camera di Commercio',
      numero: 'MI-1234', data_documento: '2026-09-30', categoria: 'certificazioni', titoloDalNome: false,
    };
    const visura: LetturaCarta = {
      ...LETTURA_VUOTA, titolo: 'Visura camerale', ente: 'Camera di Commercio',
      numero: 'MI-1234', data_documento: '2026-09-30', categoria: 'certificazioni', senza_scadenza: true, fiducia: 0.9,
    };
    expect(qualcosaDaProporre(completa, visura)).toBe(false);
  });
});
