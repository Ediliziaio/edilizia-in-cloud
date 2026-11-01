-- f24_componi resta spenta anche rieseguendo le migrazioni da zero (lotto 7 di docs/piano-costi-commessa.md,
-- E6, 01/11/2026).
--
-- La composizione automatica dell'F24 è stata spenta apposta da 20261026220848_fiscalita_conferme_tracciate
-- (l'F24 si conferma col prospetto del consulente: fiscalita_f24_anteprima e fiscalita_f24_conferma). Ma la
-- migrazione che la accendeva, 20280905120000_f24_composto_dai_dati_veri, ha una versione PIÙ ALTA: in
-- produzione è stata applicata prima, quindi vale lo spegnimento; su un database ricostruito da zero
-- l'ordine si rovescia e la composizione automatica tornerebbe attiva, scrivendo F24 senza conferma.
--
-- Questa migrazione, l'ultima, rimette lo stesso corpo di produzione: per chi ha già il database è
-- identica a quello che c'è, per chi lo ricostruisce chiude il buco.

create or replace function public.f24_componi(p_company_id uuid, p_anno integer, p_mese integer, p_rigenera boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin raise exception 'Composizione automatica non disponibile: usa anteprima e conferma con prospetto del consulente'; end $$;
