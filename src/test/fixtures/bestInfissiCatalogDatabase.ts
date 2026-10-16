import {PGlite} from '@electric-sql/pglite';
export const BEST_CATALOG_MIGRATION='supabase/migrations/20281016151109_best_infissi_linee_e_schede.sql';
export async function bestCatalogDatabase(catalogo:{macros:unknown[];categories:unknown[];families:Array<Record<string,unknown>>;grids:unknown[]}) {
 const db=new PGlite();
 await db.exec(`create table companies(id uuid primary key);
 create table listino_macrocategorie(id uuid primary key,company_id uuid,nome text,sort_order int,attivo boolean,tipologia text,categoria_tipo text,verticali_abilitati text[]);
 create table listino_categorie(id uuid primary key,company_id uuid,nome text,macrocategoria_id uuid references listino_macrocategorie(id),sort_order int);
 create table article_families(id uuid primary key,company_id uuid,nome text,descrizione text,macrocategoria_id uuid references listino_macrocategorie(id),categoria_id uuid references listino_categorie(id),deleted_at timestamptz,prezzo_base_vendita numeric,prezzo_base_acquisto numeric,markup_valore numeric,vat_rate numeric,payload jsonb);
 create table article_family_axes(id uuid primary key,company_id uuid,family_id uuid,payload jsonb);
 create table article_family_axis_values(id uuid primary key,company_id uuid,axis_id uuid,payload jsonb);
 create table listino_griglia(id uuid primary key,company_id uuid,family_id uuid,payload jsonb);
 create table listino_schede_linea(id uuid primary key,company_id uuid,macrocategoria_id uuid,chiave text,nome text,descrizione text,immagine_url text,scheda_tecnica_url text,scheda_tecnica_nome text);
 insert into companies values('421f4929-04bc-406d-b0fd-3ff4d57a64ee');`);
 const axes=catalogo.families.flatMap(f=>(f.assi??[]) as Array<Record<string,unknown>>);
 const values=axes.flatMap(a=>(a.valori??[]) as Array<Record<string,unknown>>);
 for(const [table,rows] of Object.entries({listino_macrocategorie:catalogo.macros,listino_categorie:catalogo.categories,article_families:catalogo.families.map(f=>({...f,payload:f})),article_family_axes:axes.map(a=>({...a,payload:a})),article_family_axis_values:values.map(v=>({...v,payload:v})),listino_griglia:catalogo.grids.map(g=>({...g as object,payload:g}))})) {
  await db.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(rows)]);
 }
 return db;
}
