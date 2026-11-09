-- SAL di appalto: fattura annullata e passaggi di stato.
--   Fattura annullata: il SAL torna «approvato» e si puo' rifatturare (prima restava
--   «fatturato» per sempre). Una proforma non lo segna piu' fatturato.
--   Da bozza non si salta ad approvato o fatturato.
--   Dopo l'invio gli importi non cambiano, nemmeno con una chiamata diretta.
set local lock_timeout = '3s';
create or replace function public.appalto_sal_stato() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  new.updated_at := now();
  if old.stato <> 'bozza' and (new.totale is distinct from old.totale or new.netto is distinct from old.netto or new.ritenuta is distinct from old.ritenuta) then
    raise exception 'Gli importi si decidono in bozza: dopo l''invio il rendiconto non cambia' using errcode = '42501';
  end if;
  if new.stato is distinct from old.stato then
    if old.stato = 'bozza' and new.stato in ('approvato', 'fatturato') then
      raise exception 'Un rendiconto in bozza va prima mandato al committente' using errcode = '42501';
    end if;
    if old.stato = 'fatturato' then
      -- Unica uscita: la fattura e' stata annullata, il rendiconto torna da fatturare.
      if not (new.stato = 'approvato' and new.documento_fiscale_id is null and old.documento_fiscale_id is not null
              and exists (select 1 from public.documenti_fiscali d where d.id = old.documento_fiscale_id and d.stato = 'annullata')) then
        raise exception 'Un rendiconto fatturato non cambia piu'' stato' using errcode = '42501';
      end if;
      return new;
    end if;
    if old.stato = 'approvato' and new.stato in ('bozza', 'inviato') then
      raise exception 'Un rendiconto approvato non torna indietro: e'' la prova di quello che hai fatturato' using errcode = '42501';
    end if;
    if new.stato = 'inviato' and new.inviato_at is null then
      new.inviato_at := now();
    end if;
    if new.stato = 'approvato' then
      new.approvato_da := auth.uid();
      new.approvato_at := now();
    end if;
  end if;
  return new;
end; $$;
create or replace function public.appalto_sal_fattura_emessa() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.stato = 'annullata' then
    update public.appalto_sal set stato = 'approvato', documento_fiscale_id = null
     where documento_fiscale_id = new.id and stato = 'fatturato';
  elsif new.stato <> 'bozza' and new.tipo <> 'proforma' then
    update public.appalto_sal set stato = 'fatturato' where documento_fiscale_id = new.id and stato <> 'fatturato';
  end if;
  return null;
end; $$;
