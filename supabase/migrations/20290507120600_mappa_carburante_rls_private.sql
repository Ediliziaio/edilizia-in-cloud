-- Difesa in profondità per la feature mappa/carburante (rilievi guardiano-accessi, 23/11/2026).
-- Non cambia il comportamento: l'accesso a queste tabelle resta SOLO tramite funzioni
-- SECURITY DEFINER, come per le tabelle sorelle. Serve a evitare che un GRANT per colonna
-- aggiunto per sbaglio in futuro diventi un leak immediato (è già successo il pattern
-- ai_whatsapp_numbers). Idempotente.
set local lock_timeout = '3s';

-- 1) RLS sulle due tabelle private rimaste scoperte in 20290507115600.
do $$
begin
  if to_regclass('private.carburante_prezzi') is not null then
    execute 'alter table private.carburante_prezzi enable row level security';
  end if;
  if to_regclass('private.mezzi_carburante_consumi') is not null then
    execute 'alter table private.mezzi_carburante_consumi enable row level security';
  end if;
end $$;

-- 2) REVOKE/GRANT espliciti su mezzi_viaggi_elenco: in produzione i privilegi sono già
--    corretti (authenticated, niente anon), ma la funzione non era nel blocco revoke/grant
--    dei file originali 20290507115700/115900. Qui li rendiamo espliciti, così un replay
--    pulito non le dà l'EXECUTE di default a PUBLIC.
do $$
begin
  if to_regprocedure('public.mezzi_viaggi_elenco(uuid,uuid,uuid,date,date,integer)') is not null then
    revoke all on function public.mezzi_viaggi_elenco(uuid,uuid,uuid,date,date,integer) from public, anon;
    grant execute on function public.mezzi_viaggi_elenco(uuid,uuid,uuid,date,date,integer) to authenticated;
  end if;
end $$;
