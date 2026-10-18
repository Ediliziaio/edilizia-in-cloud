-- Modifica commessa: lo scarico di magazzino va alla riga che ne ha bisogno (19/10/2026).
-- Precisa 20281019100000: con la prima riga dell'articolo, la voce nuova si scaricava di nuovo
-- all'installazione (47 → 44).
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function pg_temp.correggi(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti);
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

-- Il movimento va alla riga che ne ha bisogno: lo scarico alla riga con più pezzi ancora da
-- scaricare (la voce nuova o quella aumentata), il ripristino a quella con più pezzi già scaricati.
select pg_temp.correggi('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
  $re$order by oi\.position, oi\.id limit 1\)$re$,
  $to$order by sign(r.delta) * (oi.quantity - coalesce((
                       select sum(case m.movement_type when 'scarico' then m.quantity when 'carico' then -m.quantity else 0 end)
                         from public.warehouse_movements m where m.order_item_id = oi.id), 0)) desc,
                     oi.position, oi.id
            limit 1)$to$,
  'order by sign(r.delta) * (oi.quantity');
