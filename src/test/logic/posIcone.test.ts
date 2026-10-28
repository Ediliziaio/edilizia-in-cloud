import {describe,it,expect} from 'vitest';
import {ICONE_POS,iconaPosSvg} from '../../../supabase/functions/_shared/posIcone';
import {layoutPdfPos} from '../../../supabase/functions/_shared/posPdfLayout';
import {costruisciHtmlPos} from '../../../supabase/functions/_shared/posHtml';
import {posVuoto} from '../../../supabase/functions/_shared/posModello';
const html=()=>costruisciHtmlPos({contenuto:posVuoto(),stato:'bozza',revisione:0,revisioni:[],codiceCommessa:'TEST'});
type Nodo={headlineLevel?:number;startPosition?:{pageInnerHeight:number;verticalRatio:number}};
type Seguente={id?:string;headlineLevel?:number;text?:unknown;table?:unknown};
const layout=()=>layoutPdfPos(html(),'TEST',0,'2026-10-27T12:00:00Z',true);
const guard=()=>layout().definizione.pageBreakBefore as (n:Nodo,c:{getFollowingNodesOnPage:()=>Seguente[]})=>boolean;
describe('Icone editoriali e titoli POS',()=>{
 it('offre undici SVG originali senza risorse esterne, script o etichette di certificazione',()=>{
  expect(new Set(ICONE_POS.map(i=>i.id)).size).toBe(11);
  for(const i of ICONE_POS){const svg=iconaPosSvg(i.id);expect(svg).toContain('viewBox="0 0 24 24"');expect(svg).not.toMatch(/<script|<image|href=|onload=|ISO|certificat/i);}
  expect(()=>iconaPosSvg('non-amessa' as never)).toThrow(/non riconosciuta/);
 });
 it('mantiene le undici sezioni e il loro testo con le icone decorative',()=>{
  expect((html().match(/<svg /g)||[])).toHaveLength(11);
  const l=layout();expect(l.sezioni).toHaveLength(11);expect(l.sezioni[0]).toMatch(/^Identificazione/);
  const blocchi=l.definizione.content as Array<{columns?:Array<{svg?:string}>}>;
  expect(blocchi.filter(b=>b.columns?.some(c=>c.svg))).toHaveLength(11);
 });
 it('conserva le avvertenze complete separandole dalla copertina della bozza',()=>{
  const l=layout();const testo=JSON.stringify(l.definizione.content);
  expect(testo).toContain('Verifiche e avvertenze della bozza');expect(testo).toContain('NON APPROVATA');expect(testo).toContain('Committente');
 });
 it('il piè di pagina non fa considerare accompagnato un titolo isolato',()=>{
  expect(guard()({headlineLevel:1},{getFollowingNodesOnPage:()=>[{id:'pos-footer',text:'Pagina 1 di 2'}]})).toBe(true);
 });
 it('riserva spazio per il titolo e l’inizio del contenuto anche se la tabella ha già un nodo sulla pagina',()=>{
  expect(guard()({headlineLevel:1,startPosition:{pageInnerHeight:750,verticalRatio:0.94}},{getFollowingNodesOnPage:()=>[{table:{}}]})).toBe(true);
  expect(guard()({headlineLevel:1,startPosition:{pageInnerHeight:750,verticalRatio:0.3}},{getFollowingNodesOnPage:()=>[{table:{}}]})).toBe(false);
 });
});
