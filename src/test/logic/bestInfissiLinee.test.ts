import {expect,it} from 'vitest';
import piano from '@/lib/listino/bestInfissiRiordino.json';
import {modelloBestInfissi,variantiBestInfissi,avvisiVariantiBestInfissi} from '@/lib/listino/bestInfissiVarianti';
import {articoloEsempio} from '@/lib/listino/esempiListino';
import {corrispondeProdottoCatalogo,dettagliProdottoCatalogo} from '@/lib/preventivi/catalogoPreventivo';
import type {CatalogItemFamily,CatalogCategory} from '@/types/catalogItem';
it('tutte le linee mantengono identità, varianti e avvisi dopo la ricollocazione',()=>{
 for(const m of piano.modelli){
  const original=articoloEsempio(m.macroId,'Finestra 1 Anta',{company_id:piano.companyId,macrocategoria_id:m.macroId});
  const moved={...original,macrocategoria_id:piano.serramenti.id,categoria_id:m.categoriaId};
  expect(modelloBestInfissi(moved)).toBe(m.nome);
  expect(variantiBestInfissi(moved)).toEqual(variantiBestInfissi(original));
  expect(avvisiVariantiBestInfissi(moved)).toEqual(avvisiVariantiBestInfissi(original));
  expect(modelloBestInfissi({...moved,company_id:'altra'})).toBeNull();
 }
});
it('Epiq si trova per nome della linea prima e dopo il riordino, senza cambiare prezzi',()=>{
 const m=piano.modelli[1];
 const f=articoloEsempio('f','Finestra 1 Anta',{company_id:piano.companyId,macrocategoria_id:m.macroId,prezzo_base_vendita:400});
 const item={id:f.id,company_id:f.company_id,source:'family',nome:f.nome,descrizione:f.descrizione,categoria_id:null,family:f,prezzo_base_vendita:400} as CatalogItemFamily;
 expect(corrispondeProdottoCatalogo(item,[],'epiq finestra')).toBe(true);
 const categorie=[{id:m.categoriaId,nome:'Epiq',macrocategoria_id:piano.serramenti.id}] as CatalogCategory[];
 const moved={...item,categoria_id:m.categoriaId,family:{...f,categoria_id:m.categoriaId,macrocategoria_id:piano.serramenti.id}};
 expect(dettagliProdottoCatalogo(moved,categorie,[piano.serramenti])).toMatchObject({categoria:'Serramenti',linea:'Epiq'});
 expect(corrispondeProdottoCatalogo(moved,categorie,'Epiq')).toBe(true);
 expect(moved.prezzo_base_vendita).toBe(400);
});
