-- HERE con un tetto giornaliero per tutta la piattaforma (26/11/2026, richiesta di
-- Florin: «imposto HERE senza traffico e appena supero le 1000 richieste si
-- procede con il nostro sistema»).
--
-- mappa_conta (20290507115000) conta per azienda, al minuto e al mese. Qui si
-- aggiunge il conto di TUTTE le aziende nel giorno (ora di Roma), sugli stessi
-- dati di private.mappa_consumo: nessuna tabella nuova.
--
-- mappa_here_conta(azienda, voce, unità, al minuto, al mese, tetto del giorno):
--   'ok'     → registrato, si può chiamare HERE;
--   'giorno' → oltre il tetto di piattaforma: la pagina usa la stima in linea
--              d'aria fino a mezzanotte;
--   'quota'  → oltre la quota dell'azienda (minuto o mese), come prima.
-- Controllo e registrazione stanno sotto lo stesso lucchetto globale, nella
-- stessa transazione: due richieste parallele non superano il tetto.
-- Conta le voci «percorsi» ed «elementi_matrice» del provider «here».
--
-- Solo service role (la chiama la edge mappa-operativa).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.mappa_here_conta(
  p_company uuid, p_voce text, p_unita integer, p_minuto integer, p_mese integer, p_tetto integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  consumo integer;
begin
  if p_voce not in ('percorsi', 'elementi_matrice') or p_unita is null or p_unita < 1
     or p_tetto is null or p_tetto < 0 then
    return 'quota';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mappa_here_giorno', 29));
  select coalesce(sum(unita), 0) into consumo
    from private.mappa_consumo
   where provider = 'here'
     and voce in ('percorsi', 'elementi_matrice')
     and minuto >= date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome';
  if consumo + p_unita > p_tetto then return 'giorno'; end if;
  if not public.mappa_conta(p_company, 'here', p_voce, p_unita, p_minuto, p_mese) then return 'quota'; end if;
  return 'ok';
end;
$$;

revoke all on function public.mappa_here_conta(uuid, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.mappa_here_conta(uuid, text, integer, integer, integer, integer) to service_role;
