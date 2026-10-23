-- Preventivo cointestato nei preventivatori edili (23/10/2026).
--
-- Un secondo intestatario del preventivo (per esempio i due coniugi proprietari): nome,
-- cognome e codice fiscale. Il PDF lo mostra accanto al cliente, nelle condizioni
-- ({{cliente.nome_completo}} diventa «Mario Rossi e Anna Bianchi») e con una sua riga
-- di firma. Colonne facoltative: aggiungerle non tocca le righe esistenti.
set local lock_timeout = '3s';

do $$
declare t text;
begin
  foreach t in array array['rst_progetti', 'bgn_progetti', 'clm_progetti', 'ele_progetti', 'idr_progetti',
                           'pav_progetti', 'pis_progetti', 'tet_progetti'] loop
    execute format('alter table public.%I add column if not exists cointestatario_nome text', t);
    execute format('alter table public.%I add column if not exists cointestatario_cognome text', t);
    execute format('alter table public.%I add column if not exists cointestatario_codice_fiscale text', t);
  end loop;
end $$;
