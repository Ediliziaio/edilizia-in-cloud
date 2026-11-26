import { expect, it } from 'vitest';
import { dossierHref, dossierReturn } from './dossier-navigation';

it('torna al modello e al campo di partenza nell’ufficio, con l’operatore già indicato', () => {
 const params = new URLSearchParams({ correggi_documento: 'bozza', campo: 'pec', request: 'xml' });
 const url = new URL(dossierHref('gara', 'ufficio', params, 'partner'), 'http://localhost');
 expect(dossierReturn(url.searchParams, new Set(['gara']))).toEqual({
  id: 'gara', subjectId: 'partner', label: 'Torna ai moduli',
  href: '/azienda/gare/partecipazioni/gara?tab=documenti&documenti_vista=ufficio&ufficio=moduli&correggi_documento=bozza&campo=pec',
 });
 expect(dossierReturn(url.searchParams, new Set(['altra-gara']))).toBeNull();
});

it('torna alla Request, al caso e alla domanda DGUE con il solo percorso interno previsto', () => {
 const params = new URLSearchParams({ request: 'request', caso: 'case', domanda: 'q2', redirect: 'https://example.org' });
 const url = new URL(dossierHref('gara', 'dgue', params, 'partner'), 'http://localhost');
 const target = dossierReturn(url.searchParams, new Set(['gara']));
 expect(target?.href).toBe('/azienda/gare/partecipazioni/gara?tab=documenti&documenti_vista=dgue&request=request&caso=case&domanda=q2');
 url.searchParams.set('riprendi', 'https://example.org');
 expect(dossierReturn(url.searchParams, new Set(['gara']))).toBeNull();
});

it('conserva l’operatore al ritorno dal fascicolo aziendale', () => {
 const params = new URLSearchParams({ operatore_gara:'partner' });
 const url = new URL(dossierHref('gara','fascicolo',params,'partner'),'http://localhost');
 const target = dossierReturn(url.searchParams,new Set(['gara']));
 expect(target?.subjectId).toBe('partner');
 expect(target?.href).toBe('/azienda/gare/partecipazioni/gara?tab=panoramica&fase_lavoro=prepara&prepara_vista=fascicolo&operatore_gara=partner');
});
