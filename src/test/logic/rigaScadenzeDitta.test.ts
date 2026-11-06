/**
 * Le parole della riga delle scadenze in Attività.
 *
 * È una riga sola, letta di sfuggita la mattina: o dice il numero giusto con le
 * parole giuste, o è rumore. E quando non c'è niente di scaduto o in scadenza
 * deve sparire — un riquadro che dice «0» occupa posto per dire niente.
 */
import { describe, expect, it } from 'vitest';
import { contaScadenze, frasiScadenze } from '@/lib/documentiAzienda/rigaScadenze';
import type { StatoDocumento } from '@/types/documentiAzienda';

const righe = (...stati: Array<StatoDocumento | null>) => stati.map((stato) => ({ stato }));

describe('quante sono', () => {
  it('conta solo scadute e in scadenza', () => {
    expect(contaScadenze(righe('scaduto', 'scaduto', 'in_scadenza', 'valido', 'senza_scadenza', null)))
      .toEqual({ scadute: 2, inScadenza: 1 });
  });

  it('senza carte, zero', () => {
    expect(contaScadenze([])).toEqual({ scadute: 0, inScadenza: 0 });
    expect(contaScadenze(righe('valido', 'senza_scadenza'))).toEqual({ scadute: 0, inScadenza: 0 });
  });
});

describe('come si legge', () => {
  it.each([
    [{ scadute: 2, inScadenza: 1 }, '2 carte scadute · 1 in scadenza'],
    [{ scadute: 1, inScadenza: 0 }, '1 carta scaduta'],
    [{ scadute: 3, inScadenza: 0 }, '3 carte scadute'],
    [{ scadute: 0, inScadenza: 1 }, '1 carta in scadenza'],
    [{ scadute: 0, inScadenza: 4 }, '4 carte in scadenza'],
    [{ scadute: 1, inScadenza: 2 }, '1 carta scaduta · 2 in scadenza'],
  ])('%o → «%s»', (conteggio, atteso) => {
    expect(frasiScadenze(conteggio)).toBe(atteso);
  });

  it('niente da dire: niente riga', () => {
    expect(frasiScadenze({ scadute: 0, inScadenza: 0 })).toBeNull();
  });
});
