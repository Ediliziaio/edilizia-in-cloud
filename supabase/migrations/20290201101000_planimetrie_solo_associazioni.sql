-- Le planimetrie si associano a schede esistenti. Rimossa la variante di creazione aggiunta durante lo sviluppo.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
drop function if exists public.planimetria_crea_cliente(uuid,text,jsonb,uuid,jsonb,text,text,uuid,uuid,uuid,uuid,uuid);
