import {describe,expect,it} from 'vitest';
import {haManodoperaConfigurata} from '@/lib/preventivi/avvisiInserimento';
import {articoloEsempio} from '@/lib/listino/esempiListino';
import type {CatalogItemFamily} from '@/types/catalogItem';
function item():CatalogItemFamily{const f=articoloEsempio('f','Finestra',{manodopera_modalita:'nessuna',posa_tariffa_default_id:'tariffa-precedente'});return {...f,source:'family',family:f,modalita_prezzo:'mq',ha_posa_automatica:true,posa_linked:true};}
describe('Modalità manodopera esplicita',()=>{
 it('non aggiunge posa quando è esplicitamente esclusa, anche con riferimenti precedenti',()=>{expect(haManodoperaConfigurata(item())).toBe(false);});
 it('mantiene la manodopera a tariffa e quella manuale',()=>{for(const mode of ['tariffa','manuale'] as const){const i=item();i.family.manodopera_modalita=mode;expect(haManodoperaConfigurata(i)).toBe(true);}});
 it('mantiene la compatibilità dei dati precedenti privi della modalità',()=>{const i=item();Reflect.deleteProperty(i.family,'manodopera_modalita');expect(haManodoperaConfigurata(i)).toBe(true);});
});
