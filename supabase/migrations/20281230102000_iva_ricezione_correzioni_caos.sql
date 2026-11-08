-- Liquidazione IVA, fasi 0 e 1.1: correzioni trovate dalle simulazioni del
-- 07/11/2026 (src/test/logic/ivaCaos.test.ts).
--
-- 1. Impostazioni IVA salvate una seconda volta: il browser usa un upsert, che
--    nel ramo ON CONFLICT riscrive anche company_id e anno. Senza il permesso di
--    UPDATE su quelle due colonne la seconda modifica falliva sempre. Ora il
--    permesso c'è, e il trigger impedisce che cambino davvero.
-- 2. Data di ricezione nel futuro: la funzione la rifiutava, la scrittura diretta
--    della colonna (il browser ha l'UPDATE sulla tabella) no.
-- 3. Due dichiarazioni in contemporanea sulle stesse fatture potevano prendersi
--    i lock in ordine diverso e bloccarsi a vicenda: ora le righe si bloccano
--    prima, in ordine di id. E gli id ripetuti non gonfiano più le «saltate».

-- 1 ---------------------------------------------------------------------------
create or replace function private.fiscalita_impostazioni_iva_firma()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and (new.company_id is distinct from old.company_id or new.anno is distinct from old.anno) then
    raise exception 'Azienda e anno delle impostazioni IVA non si cambiano: crea la riga dell''altro anno' using errcode = '22023';
  end if;
  new.aggiornato_da := auth.uid();
  new.aggiornato_il := now();
  new.cf_contribuente := nullif(upper(regexp_replace(coalesce(new.cf_contribuente, ''), '\s', '', 'g')), '');
  new.cf_dichiarante := nullif(upper(regexp_replace(coalesce(new.cf_dichiarante, ''), '\s', '', 'g')), '');
  new.cf_intermediario := nullif(upper(regexp_replace(coalesce(new.cf_intermediario, ''), '\s', '', 'g')), '');
  return new;
end $$;
revoke all on function private.fiscalita_impostazioni_iva_firma() from public, anon, authenticated;

grant update (company_id, anno) on public.fiscalita_impostazioni_iva to authenticated;

-- 2 ---------------------------------------------------------------------------
create or replace function private.ricezione_dichiarata_firma()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.ricezione_dichiarata_il is null then
    new.ricezione_dichiarata_da := null;
    new.ricezione_dichiarata_at := null;
    return new;
  end if;
  -- Arriva la data SDI su una fattura che aveva quella dichiarata: vince lo SDI,
  -- la dichiarazione si toglie invece di bloccare l'aggiornamento.
  if new.data_ricezione_sdi is not null and tg_op = 'UPDATE'
     and new.data_ricezione_sdi is distinct from old.data_ricezione_sdi then
    new.ricezione_dichiarata_il := null;
    new.ricezione_dichiarata_da := null;
    new.ricezione_dichiarata_at := null;
    return new;
  end if;
  if new.data_ricezione_sdi is not null then
    raise exception 'La fattura ha già la data di ricezione dello SDI' using errcode = '22023';
  end if;
  if new.data_fattura is not null and new.ricezione_dichiarata_il < new.data_fattura then
    raise exception 'La data di ricezione non può precedere quella della fattura' using errcode = '22023';
  end if;
  if new.ricezione_dichiarata_il > (now() at time zone 'Europe/Rome')::date then
    raise exception 'La data di ricezione non può essere nel futuro' using errcode = '22023';
  end if;
  new.ricezione_dichiarata_da := auth.uid();
  new.ricezione_dichiarata_at := now();
  return new;
end $$;
revoke all on function private.ricezione_dichiarata_firma() from public, anon, authenticated;

-- 3 ---------------------------------------------------------------------------
create or replace function public.fiscalita_dichiara_ricezione(p_company uuid, p_ids uuid[], p_data date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ids uuid[];
  v_richieste integer;
  v_aggiornate integer;
begin
  perform public.fiscalita_verifica_scrittura(p_company);
  select coalesce(array_agg(distinct x order by x), '{}') into v_ids from unnest(p_ids) x where x is not null;
  v_richieste := cardinality(v_ids);
  if v_richieste = 0 then raise exception 'Nessuna fattura indicata' using errcode = '22023'; end if;
  if v_richieste > 2000 then raise exception 'Al massimo 2000 fatture per volta' using errcode = '22023'; end if;
  if p_data is not null and p_data > (now() at time zone 'Europe/Rome')::date then
    raise exception 'La data di ricezione non può essere nel futuro' using errcode = '22023';
  end if;

  -- Prima i lock, sempre nello stesso ordine: due dichiarazioni parallele si
  -- mettono in fila invece di bloccarsi a vicenda.
  perform 1 from public.fatture_ricevute f
   where f.company_id = p_company and f.id = any(v_ids)
   order by f.id
   for update;

  update public.fatture_ricevute f
     set ricezione_dichiarata_il = p_data
   where f.company_id = p_company
     and f.id = any(v_ids)
     and f.data_ricezione_sdi is null
     and (p_data is null or p_data >= f.data_fattura)
     and f.ricezione_dichiarata_il is distinct from p_data;
  get diagnostics v_aggiornate = row_count;

  return jsonb_build_object(
    'aggiornate', v_aggiornate,
    'saltate', v_richieste - v_aggiornate,
    'nota', 'Saltate: già con data SDI, data precedente a quella della fattura, già con questa data o di un''altra azienda.'
  );
end $$;
revoke all on function public.fiscalita_dichiara_ricezione(uuid, uuid[], date) from public, anon;
grant execute on function public.fiscalita_dichiara_ricezione(uuid, uuid[], date) to authenticated;
