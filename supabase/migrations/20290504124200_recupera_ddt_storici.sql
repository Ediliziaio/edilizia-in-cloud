set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Recupero manuale, per azienda e a lotti. Il limite e il cursore valgono
-- per le fatture esaminate, comprese quelle con tutti i DDT disponibili.
create or replace function private.operazioni_recupera_ddt_storici(
  p_company uuid,
  p_fino timestamptz,
  p_dopo uuid default null,
  p_limite integer default 25,
  p_anteprima boolean default true
)
returns table (
  esaminate integer,
  ultimo_id uuid,
  nuove integer,
  riaperte integer,
  gia_aperte integer,
  saldate integer,
  riferimenti integer
)
language plpgsql set search_path = '' as $$
declare
  f record;
  verifica jsonb;
  mancanti integer;
  scad date;
  referente uuid;
  esistente uuid;
  chiusa timestamptz;
  scritta uuid;
  iniziato timestamptz := statement_timestamp();
begin
  if p_company is null or p_fino is null or p_limite is null or p_limite not between 1 and 50 or p_anteprima is null then
    raise exception 'Indica azienda, data limite e da 1 a 50 fatture per lotto' using errcode = '22023';
  end if;

  esaminate := 0;
  nuove := 0;
  riaperte := 0;
  gia_aperte := 0;
  saldate := 0;
  riferimenti := 0;
  if not p_anteprima then
    referente := private.operazioni_responsabile(p_company, null, 'ddt');
  end if;

  for f in
    select x.id, x.numero_fattura
    from public.fatture_ricevute x
    where x.company_id = p_company and x.created_at <= p_fino
      and (p_dopo is null or x.id > p_dopo)
      and private.ddt_prezzi_documentata(x)
    order by x.id
    limit p_limite
  loop
    esaminate := esaminate + 1;
    ultimo_id := f.id;
    verifica := private.pagamento_fornitore_controllo(f.id);
    mancanti := coalesce(jsonb_array_length(verifica->'ddt'), 0);
    if mancanti = 0 then continue; end if;

    riferimenti := riferimenti + mancanti;
    if verifica->>'stato' = 'chiusa' then saldate := saldate + 1; end if;
    select e.id, e.chiusa_il into esistente, chiusa from public.operazioni_eccezioni e
    where e.company_id = p_company and e.tipo = 'ddt' and e.origine_id = f.id;

    if esistente is not null and chiusa is null then
      gia_aperte := gia_aperte + 1;
      continue;
    end if;
    if p_anteprima then
      if esistente is null then nuove := nuove + 1; else riaperte := riaperte + 1; end if;
      continue;
    end if;

    scad := coalesce((verifica->>'scadenza')::date,
      (select min(e.scadenza) from public.operazioni_eccezioni e
       where e.company_id = p_company and e.origine_id = f.id and e.chiusa_il is null),
      (now() at time zone 'Europe/Rome')::date + 2);

    -- Fa valere la stessa unicità del worker. Le attività storiche sono
    -- inserite direttamente nella lista, senza avvisi individuali in massa.
    insert into public.operazioni_eccezioni(company_id, tipo, origine_id, responsabile, scadenza, titolo, dati)
    values (p_company, 'ddt', f.id, referente, scad,
      'Completa i DDT della fattura ' || f.numero_fattura, verifica - 'problemi' - 'nota')
    on conflict (company_id, tipo, origine_id) do nothing returning id into scritta;
    if found then
      nuove := nuove + 1;
      continue;
    end if;

    -- La chiusura avvenuta mentre il lotto era in corso ha la precedenza.
    update public.operazioni_eccezioni e
    set responsabile = referente, scadenza = scad, titolo = 'Completa i DDT della fattura ' || f.numero_fattura,
        dati = verifica - 'problemi' - 'nota', aperta_il = now(), aggiornata_il = now(), chiusa_il = null
    where e.company_id = p_company and e.tipo = 'ddt' and e.origine_id = f.id
      and e.chiusa_il < iniziato
    returning e.id into scritta;
    if found then
      riaperte := riaperte + 1;
    elsif exists (select 1 from public.operazioni_eccezioni e
                  where e.company_id = p_company and e.tipo = 'ddt' and e.origine_id = f.id and e.chiusa_il is null) then
      gia_aperte := gia_aperte + 1;
    end if;
  end loop;

  return next;
end;
$$;

revoke all on function private.operazioni_recupera_ddt_storici(uuid,timestamptz,uuid,integer,boolean)
  from public, anon, authenticated, service_role;
