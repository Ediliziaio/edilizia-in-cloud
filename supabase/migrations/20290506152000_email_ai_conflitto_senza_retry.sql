-- La preparazione della coda era già applicata, ma il filtro resta spento.
-- Riallinea solo il codice di conflitto della presa scaduta: PostgREST non deve
-- ritentare una scrittura che il token non autorizza più. Permessi/OID invariati.
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$
declare definizione text;
begin
  select pg_get_functiondef('public.email_ai_salva_bozza(uuid,uuid,jsonb)'::regprocedure) into definizione;
  if strpos(definizione, '''40001''')>0 then
    execute replace(definizione, '''40001''', '''PT409''');
  end if;
end $$;
