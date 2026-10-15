import { describe,it,expect } from 'vitest';
import { indiceProdottiImport } from '../../../supabase/functions/_shared/riconosciProdottoImport';
describe('Reimportazione senza duplicare prodotti classificati', () => {
  it('riconosce il codice originale Palma anche dopo una rinomina', () => {
    const cerca = indiceProdottiImport([{id:'1',nome:'Nome modificato',custom_field_values:{palma_source_sku:'AFA96'}}]);
    expect(cerca('Descrizione vecchia','afa96')).toEqual({id:'1',ambiguo:false});
  });
  it('usa il nome univoco per un prodotto già classificato', () => {
    expect(indiceProdottiImport([{id:'1',nome:' Collante '}])('COLLANTE','A1')).toEqual({id:'1',ambiguo:false});
  });
  it('non sceglie un omonimo o un codice duplicato a caso', () => {
    const cerca = indiceProdottiImport([{id:'1',nome:'Collante',custom_field_values:{catalog_import_sku:'A1'}},{id:'2',nome:'Collante',custom_field_values:{catalog_import_sku:'A1'}}]);
    expect(cerca('Collante')).toEqual({id:null,ambiguo:true});
    expect(cerca('Altro','A1')).toEqual({id:null,ambiguo:true});
  });
  it('non sovrascrive un prodotto con un codice differente', () => {
    expect(indiceProdottiImport([{id:'1',nome:'Collante',custom_field_values:{catalog_import_sku:'A1'}}])('Collante','B1')).toEqual({id:null,ambiguo:true});
  });
  it('un nuovo prodotto rimane nuovo', () => expect(indiceProdottiImport([])('Nuovo','N1')).toEqual({id:null,ambiguo:false}));
});
