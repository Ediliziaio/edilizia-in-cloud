import { describe, expect, it } from 'vitest';
import { dettagliPerSalvataggio, misureValide, quantitaDaMisure, quantitaRigaMisura, vocePesaNelTotale } from '@/lib/computo/vociDettagli';

const m = (descrizione: string, parti: number, lunghezza: number | null, larghezza: number | null, altezza: number | null) => ({ descrizione, parti, lunghezza, larghezza, altezza });

describe('misure della voce', () => {
  it('area del pavimento: lunghezza × larghezza', () => {
    expect(quantitaDaMisure([m('bagno', 1, 2.4, 1.8, null)])).toBe(4.32);
  });
  it('pareti: parti × lunghezza × altezza, e somma di più righe', () => {
    expect(quantitaRigaMisura(m('pareti lunghe', 2, 2.4, null, 2.7))).toBe(12.96);
    expect(quantitaDaMisure([m('a', 2, 2.4, null, 2.7), m('b', 2, 1.8, null, 2.7)])).toBe(22.68);
  });
  it('scarta righe senza dimensioni, con parti nulle o dimensioni negative', () => {
    expect(misureValide([m('vuota', 1, null, null, null), m('zero', 0, 2, 2, null), m('neg', 1, -2, 2, null), m('ok', 1, 2, 2, null)])).toHaveLength(1);
    expect(quantitaDaMisure([])).toBeNull();
    expect(quantitaDaMisure(null)).toBeNull();
  });
  it('accetta la virgola decimale e arrotonda a 4 decimali', () => {
    expect(quantitaDaMisure([{ descrizione: '', parti: 1, lunghezza: '2,5' as unknown as number, larghezza: 1.33333, altezza: null }])).toBe(3.3333);
  });
  it('non più di 60 righe di misura', () => {
    expect(misureValide(Array.from({ length: 100 }, () => m('x', 1, 1, 1, null)))).toHaveLength(60);
  });
});

describe('dettagli per il salvataggio', () => {
  it('pulisce i testi e i valori, e dà sempre un opzionale booleano', () => {
    expect(dettagliPerSalvataggio({ ambiente: '  Bagno  ', marca: ' ', modello: 'X1', note_interne: '', ore_previste: 12.345, opzionale: undefined }))
      .toEqual({ ambiente: 'Bagno', misure: null, ore_previste: 12.35, note_interne: null, marca: null, modello: 'X1', opzionale: false });
  });
  it('ore negative o assurde diventano null, non un errore del database', () => {
    expect(dettagliPerSalvataggio({ ore_previste: -3 }).ore_previste).toBeNull();
    expect(dettagliPerSalvataggio({ ore_previste: 1e9 }).ore_previste).toBeNull();
    expect(dettagliPerSalvataggio({ ore_previste: 0 }).ore_previste).toBe(0);
  });
  it('una voce opzionale non pesa nel totale', () => {
    expect(vocePesaNelTotale({ opzionale: true })).toBe(false);
    expect(vocePesaNelTotale({ opzionale: false })).toBe(true);
    expect(vocePesaNelTotale({})).toBe(true);
  });
});

import { riepilogoPerAmbiente } from '@/components/computo/RiepilogoAmbienti';

describe('riepilogo per ambiente', () => {
  it('somma per stanza, ordina per importo e mette le voci senza ambiente in fondo', () => {
    const r = riepilogoPerAmbiente([
      { ambiente: 'Cucina', quantita: 1, prezzo_unitario: 500 },
      { ambiente: ' Bagno ', quantita: 2, prezzo_unitario: 400, sconto_pct: 10 },
      { ambiente: 'Bagno', quantita: 1, prezzo_unitario: 100 },
      { quantita: 1, prezzo_unitario: 50 },
    ]);
    expect(r).toEqual([
      { ambiente: 'Bagno', voci: 2, importo: 820 },
      { ambiente: 'Cucina', voci: 1, importo: 500 },
      { ambiente: 'Senza ambiente', voci: 1, importo: 50 },
    ]);
  });
  it('senza nessun ambiente non mostra niente', () => {
    expect(riepilogoPerAmbiente([{ quantita: 1, prezzo_unitario: 10 }])).toEqual([]);
  });
  it('le voci opzionali non si sommano', () => {
    expect(riepilogoPerAmbiente([{ ambiente: 'Bagno', quantita: 1, prezzo_unitario: 100 }, { ambiente: 'Bagno', quantita: 1, prezzo_unitario: 900, opzionale: true }])[0].importo).toBe(100);
  });
});
