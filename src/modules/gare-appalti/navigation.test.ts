import { describe,expect,it } from 'vitest';
import { currentGareSection,gareRoot,sectionHref } from './navigation';

describe('pagina unica Gare e appalti',()=>{
 it('apre le funzioni sulla stessa pagina con una scheda esplicita',()=>{
  const url=new URL(sectionHref('fascicolo'),'http://127.0.0.1:8081');expect(url.pathname).toBe(gareRoot);expect(url.searchParams.get('sezione')).toBe('fascicolo');expect(currentGareSection(url.pathname,url.search)).toBe('fascicolo');
 });
 it('conserva filtri, accenti e caratteri riservati senza mutare la ricerca di origine',()=>{
  const filters=new URLSearchParams({q:'edifici & scuole',territorio:'Emilia-Romagna',entro:'2026-12-01',sezione:'vecchia'});const url=new URL(sectionHref('opportunita',filters),'http://127.0.0.1:8081');expect(url.searchParams.get('q')).toBe('edifici & scuole');expect(url.searchParams.get('territorio')).toBe('Emilia-Romagna');expect(url.searchParams.get('entro')).toBe('2026-12-01');expect(url.searchParams.getAll('sezione')).toEqual(['opportunita']);expect(filters.get('sezione')).toBe('vecchia');
 });
 it('mantiene la scheda corretta per link storici e bozze annidate',()=>{
  expect(currentGareSection('/azienda/gare/fonti')).toBe('fonti');expect(currentGareSection('/azienda/gare/partecipazioni/p/documenti/d')).toBe('partecipazioni');expect(currentGareSection('/azienda/gare/procedure/t')).toBe('opportunita');expect(currentGareSection('/azienda/gare/nuova')).toBe('opportunita');
 });
 it('usa una vista valida anche con parametri mancanti o non riconosciuti',()=>{
  expect(currentGareSection(gareRoot)).toBe('opportunita');expect(currentGareSection(gareRoot,'?sezione=sconosciuta&q=test')).toBe('opportunita');expect(currentGareSection(gareRoot+'/', '?sezione=scadenze')).toBe('scadenze');
 });
});
