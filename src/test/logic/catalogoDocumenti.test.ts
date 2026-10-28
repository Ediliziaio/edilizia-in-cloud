import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { CATALOGO_DOCUMENTI,cercaCatalogo,erroreAmbitoCatalogo,voceCatalogo,evidenzeDellaVoce } from '@/lib/sicurezza/catalogoDocumenti';
import type { EvidenzaFascicolo } from '@/lib/sicurezza/fascicolo';
describe('Catalogo derivato dalle richieste aziendali, senza obblighi universali',()=>{
 it('conserva tutte le 124 celle una sola volta, separando 82 tipi e sei gruppi',()=>{const fonti=CATALOGO_DOCUMENTI.voci.flatMap(v=>v.fonti);expect(fonti).toHaveLength(124);expect(new Set(fonti.map(f=>f.cella)).size).toBe(124);expect(CATALOGO_DOCUMENTI.voci).toHaveLength(82);expect(new Set(fonti.map(f=>f.gruppo)).size).toBe(6);expect(new Set(CATALOGO_DOCUMENTI.voci.map(v=>v.id)).size).toBe(82);});
 it('copre esattamente le celle della matrice analizzata, senza intestazioni o righe inventate',()=>{
  const matrice=readFileSync('docs/plans/2026-10-26-matrice-documenti-implementazione.md','utf8');
  const celle=[...matrice.matchAll(/^\| ([BH]\d+) \|/gm)].map(m=>m[1]);
  expect(CATALOGO_DOCUMENTI.voci.flatMap(v=>v.fonti.map(f=>f.cella)).sort()).toEqual(celle.sort());
 });
 it('rinnovi, voci condivise e duplicati rimandano allo stesso tipo',()=>{expect(voceCatalogo('formazione_antincendio',1)?.fonti.map(f=>f.cella)).toEqual(['B61','B62','H25']);expect(voceCatalogo('analisi_rischi',1)?.fonti).toHaveLength(6);expect(voceCatalogo('pos',1)?.fonti).toHaveLength(4);expect(voceCatalogo('nomina_rls',1)?.fonti).toHaveLength(2);});
 it('mantiene le frequenze discordanti del foglio senza trasformarle in date calcolate',()=>{const v=voceCatalogo('formazione_antincendio',1)!;expect(v.fonti.map(f=>f.scadenza_originale)).toContain('OGNI 3 ANNI');expect(v.fonti.map(f=>f.scadenza_originale)).toContain('OGNI 5 ANNI');expect(v.nota).toMatch(/discordanti/);expect(v).not.toHaveProperty('validita_mesi');});
 it('separa documenti mensili, personali e sigle non chiarite dal caricamento sicurezza',()=>{for(const id of ['lul','unilav_assunzione','doma','plac','patente_edilizia'])expect(erroreAmbitoCatalogo(voceCatalogo(id,1)!,{})).toMatch(/archivio indicato|chiarita/);});
 it('ricerca anche per cella e dicitura originale senza duplicare il risultato',()=>{expect(cercaCatalogo('H25').map(v=>v.id)).toEqual(['formazione_antincendio']);expect(cercaCatalogo('agg attestato PIMUS').map(v=>v.id)).toContain('formazione_ponteggi');});
 it('richiede il titolare o il cantiere pertinente, senza riconoscerli dal titolo',()=>{expect(erroreAmbitoCatalogo(voceCatalogo('pos',1)!,{})).toMatch(/commessa/);expect(erroreAmbitoCatalogo(voceCatalogo('nomina_rspp',1)!,{})).toMatch(/incarico/);expect(erroreAmbitoCatalogo(voceCatalogo('formazione_preposto',1)!,{})).toMatch(/operaio/);expect(erroreAmbitoCatalogo(voceCatalogo('formazione_preposto',1)!,{incarico_id:'id'})).toBeNull();expect(erroreAmbitoCatalogo(voceCatalogo('nomina_cse',1)!,{order_id:'ordine',stato:'non_applicabile'})).toBeNull();});
 it('i documenti precedenti non vengono classificati dal titolo o considerati validi automaticamente',()=>{const v=voceCatalogo('durc',1)!;expect(evidenzeDellaVoce(v,[{tipo:'durc',titolo:'DURC',stato:'verificato'} as EvidenzaFascicolo])).toHaveLength(0);expect(evidenzeDellaVoce(v,[{catalogo_id:'durc',catalogo_versione:1,stato:'da_richiedere'} as EvidenzaFascicolo])).toHaveLength(1);});
});
