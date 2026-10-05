-- Varianti che compaiono solo se un'altra variante ha un certo valore (05/10/2026).
-- Esempio: «Monoblocco» su ogni tipologia; altezza cassonetto, avvolgimento, colori e zanzariera solo se «Con monoblocco».
-- {"asse": "<codice dell'altra variante>", "valori": ["<valore>", …]}  NULL = sempre visibile.
-- Solo una colonna nullable: istantanea, nessun effetto sulle varianti esistenti.
alter table public.article_family_axes
  add column if not exists visibile_se jsonb;

comment on column public.article_family_axes.visibile_se is
  'Condizione di visibilità: {"asse": codice, "valori": [valore,…]}. NULL = sempre visibile. Vedi src/lib/serramenti/assiCondizionati.ts.';
