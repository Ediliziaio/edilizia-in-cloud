import {afterEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import piano from '@/lib/listino/bestInfissiRiordino.json';
import {BEST_CATALOG_MIGRATION,bestCatalogDatabase} from '../fixtures/bestInfissiCatalogDatabase';
import type {PGlite} from '@electric-sql/pglite';
let db:PGlite|undefined;
afterEach(async()=>{await db?.close();db=undefined;});
const migration=readFileSync(BEST_CATALOG_MIGRATION,'utf8');
const company_id=piano.companyId;
function fixture(){
 const macros=[...piano.modelli.map(m=>({id:m.macroId,company_id,nome:m.nome,attivo:true})),...piano.categorieAggiuntive.map(m=>({id:m.macrocategoria_id,company_id,nome:'Accessori',attivo:true}))];
 const families=[...piano.modelli.map(m=>({id:randomUUID(),company_id,nome:'Finestra 1 Anta',macrocategoria_id:m.macroId,categoria_id:null as string|null,descrizione:'Testo originale',prezzo_base_vendita:0.0044,prezzo_base_acquisto:200,markup_valore:100,vat_rate:22,assi:[] as unknown[]})),...Object.entries(piano.assegnazioni).map(([id,a])=>({id,company_id,nome:'Prodotto importato',macrocategoria_id:a.macroId===piano.serramenti.id?piano.modelli[4].macroId:piano.modelli[5].macroId,categoria_id:null as string|null,descrizione:'Originale importato',prezzo_base_vendita:123.45,prezzo_base_acquisto:54.32,markup_valore:12.5,vat_rate:10,assi:[] as unknown[]}))];
 return {macros,categories:[] as unknown[],families,grids:[{id:randomUUID(),company_id,family_id:families[0].id,prezzo_vendita:123.4567,prezzo_acquisto:45.67}]};
}
it('la migrazione reale crea le sei linee, preserva articoli e griglie e separa gli accessori',async()=>{
 const data=fixture();db=await bestCatalogDatabase(data);await db.exec(migration);
 const rows=(await db.query<{id:string;prezzo_base_vendita:string;descrizione:string;macrocategoria_id:string}>('select * from article_families')).rows;
 expect(rows).toHaveLength(data.families.length);
 for(const f of data.families){const r=rows.find(r=>r.id===f.id)!;expect(Number(r.prezzo_base_vendita)).toBe(f.prezzo_base_vendita);expect(r.descrizione).toContain(f.descrizione);}
 expect((await db.query('select * from listino_schede_linea')).rows).toHaveLength(6);
 const snapshot=await db.query('select * from article_families order by id');
 await db.exec(migration);expect(await db.query('select * from article_families order by id')).toEqual(snapshot);
 expect((await db.query('select * from listino_griglia')).rows).toHaveLength(1);
 expect((await db.query('select * from article_families where macrocategoria_id=$1',[piano.serramenti.id])).rows).toHaveLength(12);
},30000);
it('un catalogo incompleto viene fermato senza applicare un riordino parziale',async()=>{
 const data=fixture();data.macros=data.macros.slice(1);db=await bestCatalogDatabase({...data,families:[]});
 // Una famiglia senza gruppo è ammessa nel vecchio catalogo, ma non autorizza a inventare la linea mancante.
 await db.query('insert into article_families(id,company_id,nome) values($1,$2,$3)',[randomUUID(),company_id,'Originale']);
 await expect(db.exec(migration)).rejects.toThrow('diverso');
 expect((await db.query('select * from listino_schede_linea')).rows).toHaveLength(0);
},30000);
