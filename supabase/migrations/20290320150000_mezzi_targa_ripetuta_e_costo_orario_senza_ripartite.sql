-- Fase 5 del piano anomalie (14/11/2026) — mezzi e fatture.
--
-- 1. La targa si cerca anche quando nasce un mezzo (o gli si corregge targa/matricola) e quando cambiano
--    le righe di una fattura. Prima solo all'inserimento della fattura: un mezzo aggiunto dopo restava senza
--    fatture finché qualcuno non premeva «Cerca la targa». Il legame è unico per (fattura, mezzo) e si
--    scrive con ON CONFLICT DO NOTHING: ripetere la ricerca non raddoppia niente. Un errore qui non deve
--    mai bloccare il salvataggio del mezzo o della fattura.
-- 2. Una fattura del mezzo ripartita su più commesse (company_costs.allocations con order_id) entra già nei
--    costi delle commesse: non entra anche nel costo orario del mezzo, che le commesse pagano di nuovo
--    attraverso le ore dei rapportini. Prima si escludeva solo quella con company_costs.order_id.
--
-- Solo funzioni e trigger, nessuna riga scritta.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- La ricerca vera e propria, senza controllo dei permessi: la chiamano il pulsante (che i permessi li
-- controlla) e il trigger del mezzo (che scatta su una scrittura già permessa).
create or replace function public.mezzo_cerca_nelle_fatture_interno(p_mezzo_id uuid)
returns integer language plpgsql security definer set search_path = public set statement_timeout to '60s' as $$
declare v_azienda uuid; v_k text; n integer;
begin
  select company_id, upper(regexp_replace(coalesce(nullif(targa, ''), matricola, ''), '[^A-Za-z0-9]', '', 'g'))
    into v_azienda, v_k from public.mezzi where id = p_mezzo_id and deleted_at is null;
  if v_azienda is null or length(coalesce(v_k, '')) < 6 then return 0; end if;
  with trovati as (
    select f.id, f.imponibile_totale, sum(abs(case when (r->>'imponibile') ~ '^-?\d+(\.\d+)?$' then (r->>'imponibile')::numeric else 0 end)) as importo,
           public.e_nota_credito_ricevuta(f.tipo_documento) as nota
      from public.fatture_ricevute f, jsonb_array_elements(case when jsonb_typeof(f.righe) = 'array' then f.righe else '[]'::jsonb end) r
     where f.company_id = v_azienda and not public.e_autofattura_ricevuta(f.tipo_documento)
       and upper(regexp_replace(coalesce(r->>'descrizione', ''), '[^A-Za-z0-9]', '', 'g')) like '%' || v_k || '%'
     group by f.id, f.tipo_documento, f.imponibile_totale
  ), scritti as (
    insert into public.fattura_ricevuta_mezzi (company_id, fattura_ricevuta_id, mezzo_id, importo, origine, created_by)
    select v_azienda, t.id, p_mezzo_id,
           public.importo_legame_mezzo(t.importo, 1 + (select count(*)::integer from public.fattura_ricevuta_mezzi l where l.fattura_ricevuta_id = t.id and l.mezzo_id <> p_mezzo_id), t.imponibile_totale, t.nota),
           'targa', auth.uid() from trovati t
    on conflict (fattura_ricevuta_id, mezzo_id) do nothing returning 1
  ) select count(*) into n from scritti;
  return n;
end $$;
revoke all on function public.mezzo_cerca_nelle_fatture_interno(uuid) from public, anon, authenticated;
grant execute on function public.mezzo_cerca_nelle_fatture_interno(uuid) to service_role;

create or replace function public.mezzo_cerca_nelle_fatture(p_mezzo_id uuid)
returns integer language plpgsql security definer set search_path = public set statement_timeout to '60s' as $$
declare v_azienda uuid; v_k text;
begin
  select company_id, upper(regexp_replace(coalesce(nullif(targa, ''), matricola, ''), '[^A-Za-z0-9]', '', 'g')) into v_azienda, v_k from public.mezzi where id = p_mezzo_id;
  if v_azienda is null then raise exception 'Mezzo non trovato.' using errcode = 'P0002'; end if;
  if not (public.e_super_admin_dentro(v_azienda) or (v_azienda = any (public.aziende_con_permesso('can_view_costs')) and not public.utente_sola_lettura(v_azienda))) then
    raise exception 'Il tuo ruolo non permette di collegare le fatture.' using errcode = '42501';
  end if;
  if length(coalesce(v_k, '')) < 6 then raise exception 'Serve una targa o una matricola di almeno 6 caratteri.' using errcode = '22023'; end if;
  return public.mezzo_cerca_nelle_fatture_interno(p_mezzo_id);
end $$;
revoke all on function public.mezzo_cerca_nelle_fatture(uuid) from public, anon;
grant execute on function public.mezzo_cerca_nelle_fatture(uuid) to authenticated, service_role;

create or replace function public.mezzo_cerca_fatture_auto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null then return new; end if;
  if tg_op = 'UPDATE'
     and coalesce(nullif(old.targa, ''), old.matricola, '') = coalesce(nullif(new.targa, ''), new.matricola, '')
     and old.deleted_at is not distinct from new.deleted_at then
    return new;
  end if;
  begin
    perform public.mezzo_cerca_nelle_fatture_interno(new.id);
  exception when others then
    raise log 'mezzo_cerca_fatture_auto %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.mezzo_cerca_fatture_auto() from public, anon, authenticated;

drop trigger if exists trg_mezzo_cerca_fatture on public.mezzi;
create trigger trg_mezzo_cerca_fatture after insert or update of targa, matricola, deleted_at on public.mezzi
  for each row execute function public.mezzo_cerca_fatture_auto();

-- Righe o XML della fattura cambiati (rilettura, correzione a mano): stessa ricerca dell'inserimento.
drop trigger if exists trg_fattura_ricevuta_collegamenti_righe on public.fatture_ricevute;
create trigger trg_fattura_ricevuta_collegamenti_righe after update of righe, xml_raw on public.fatture_ricevute
  for each row when (old.righe is distinct from new.righe or old.xml_raw is distinct from new.xml_raw)
  execute function public.fattura_ricevuta_collegamenti_auto();

-- Costo orario: fuori anche le fatture ripartite su commesse.
do $$
declare
  v text := pg_get_functiondef('public.mezzi_spese_12_mesi(uuid,uuid)'::regprocedure);
  a text := 'and cc.order_id is null';
  b text := $q$and cc.order_id is null and not (jsonb_typeof(cc.allocations) = 'array' and exists (select 1 from jsonb_array_elements(cc.allocations) ra where nullif(ra->>'order_id', '') is not null))$q$;
begin
  if position('jsonb_array_elements(cc.allocations)' in v) > 0 then return; end if;
  if position(a in v) = 0 then raise exception 'mezzi_spese_12_mesi: esclusione delle commesse inattesa'; end if;
  execute replace(v, a, b);
end $$;
