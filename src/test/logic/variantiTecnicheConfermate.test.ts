import {describe,it,expect} from 'vitest';
import type {FamilyWithAxes} from '@/types/articleFamily';
import {variantiBestInfissi,avvisiVariantiBestInfissi} from '@/lib/listino/bestInfissiVarianti';
import {variantiTecnicheVisibili,riepilogoVariantiTecniche,snapshotVariantiTecniche,riprendiVariantiTecniche} from '@/lib/listino/variantiTecnicheConfermate';
import {calcolaPrezzoFamiglia} from '@/hooks/useFamilyPricing';
const f=(nome='Finestra 1 Anta')=>({company_id:'421f4929-04bc-406d-b0fd-3ff4d57a64ee',nome,id:'famiglia',axes:[],modalita_prezzo_base:'mq',prezzo_base_mode:'vendita',prezzo_base_vendita:400,prezzo_base_acquisto:200,unit_of_measure:'mq'}) as unknown as FamilyWithAxes;
describe('varianti confermate Best Infissi',()=>{
 it('riconosce il modello online dal suo identificativo senza dipendere dall’anteprima',()=>{
  const family={...f(),vertical:'serramenti',macrocategoria_id:'5066bc5e-0bc7-4826-8c27-dd81e014767d'};
  expect(variantiBestInfissi(family).map(v=>v.codice)).toEqual(['profilo','composizione_vetrocamera']);
  expect(avvisiVariantiBestInfissi({...family,nome:'Slide Plus'}).join(' ')).toContain('DX/SX');
  expect(avvisiVariantiBestInfissi({...family,company_id:'altra-azienda'})).toEqual([]);
 });
 it('limita Epiq alla famiglia e all’azienda corrette',()=>{
  expect(variantiBestInfissi(f(),'Epiq').map(v=>v.codice)).toEqual(['profilo','composizione_vetrocamera']);
  for(const nome of ['Slide Plus','Finestra 3 Ante','Portoncino 1 Anta','Porta Finestra 1 Anta con Serratura Passante'])expect(variantiBestInfissi(f(nome),'Epiq')).toEqual([]);
  expect(variantiBestInfissi({...f(),company_id:'altra-azienda'},'Epiq')).toEqual([]);
  expect(variantiBestInfissi(f(),'Agreen Home')).toEqual([]);
 });
 it('mantiene prezzi, assi e supplementi identici per tutte le nuove scelte',()=>{
  const family=f(),prima=structuredClone(family);
  const selezioni={};
  const input={family,selections:selezioni,larghezza_mm:1200,altezza_mm:1400,quantita:2};
  const prezzoPrima=calcolaPrezzoFamiglia(input,[]);
  for(const variante of variantiBestInfissi(family,'Epiq'))for(const valore of variante.valori){
   expect(riepilogoVariantiTecniche([variante],{[variante.codice]:valore.codice})).toEqual([`${variante.nome}: ${valore.nome}`]);
   expect(calcolaPrezzoFamiglia(input,[])).toEqual(prezzoPrima);
  }
  expect(prezzoPrima.unit_price_vendita).toBe(672);
  expect(family).toEqual(prima);
 });
 it('riprende lo snapshot delle specifiche senza trasformarlo in assi di prezzo',()=>{
  const varianti=variantiBestInfissi(f(),'Epiq'),scelta={profilo:varianti[0].valori[1].codice,nascosta:'qualcosa'};
  const snapshot=snapshotVariantiTecniche(varianti,scelta);
  expect(snapshot).toEqual({profilo:scelta.profilo});
  expect(riprendiVariantiTecniche(JSON.stringify(snapshot))).toEqual(snapshot);
  expect(riprendiVariantiTecniche('non valido')).toEqual({});
  expect(riprendiVariantiTecniche('[1,2]')).toEqual({});
 });
 it('non preseleziona le nuove varianti e scarta codici invalidi',()=>{
  const varianti=variantiBestInfissi(f(),'Epiq');
  expect(riepilogoVariantiTecniche(varianti,{})).toEqual([]);
  expect(riepilogoVariantiTecniche(varianti,{profilo:'inesistente'})).toEqual([]);
 });
 it('evita il profilo duplicato Mini Social e nasconde le varianti della finestra quando si sceglie alzante',()=>{
  const family=f('Porta finestra legno-alluminio Anger Mini Social');
  family.axes=[{codice:'profilo',values:[]},{codice:'apertura',values:[{id:'apre',valore:'1_anta',attivo:true},{id:'alza',valore:'alzante',attivo:true}]}] as FamilyWithAxes['axes'];
  const varianti=variantiBestInfissi(family,'Legno-Alluminio');
  const visibili=variantiTecnicheVisibili(varianti,family,{apertura:'apre'});
  expect(visibili.map(v=>v.codice)).toEqual(['finitura_legno_interno']);
  expect(variantiTecnicheVisibili(varianti,family,{apertura:'alza'})).toEqual([]);
  expect(riepilogoVariantiTecniche([],{'finitura_legno_interno':'finitura_legno_interno_1'})).toEqual([]);
 });
 it('fornisce i quattro profili per Social e Social Plus ma non per articoli generici',()=>{
  for(const nome of ['Finestra legno-alluminio Anger Social','Finestra legno-alluminio Anger Social Plus']){
   expect(variantiBestInfissi(f(nome),'Legno-Alluminio')[0].valori.map(v=>v.nome)).toEqual(['Recta','Modern','Classic','Epoca']);
  }
  expect(variantiBestInfissi(f('Finestra legno-alluminio Anger Social Plus'),'Legno-Alluminio').map(v=>v.codice)).toEqual(['profilo']);
  expect(variantiBestInfissi(f('Finestra 1 Anta'),'Legno-Alluminio')).toEqual([]);
 });
});
