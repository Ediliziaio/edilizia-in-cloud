-- Fondo TFR: liquidazioni, anticipi e TFR versato ai fondi pensione o al Fondo Tesoreria INPS (15/11/2026)
--
-- Dal 20290401170000 il fondo TFR dello Stato patrimoniale è il fondo di
-- partenza più il TFR maturato dai cedolini. Mancavano le uscite dal fondo e
-- il TFR che non resta in azienda:
--
-- 1. Liquidazioni e anticipi (art. 2120 c.c.). Il TFR pagato a chi lascia
--    l'azienda, o anticipato a chi lo chiede, esce dal fondo: non è un costo,
--    il costo è già stato contato quando è maturato (OIC 31). Si registrano in
--    cg_tfr_movimenti, con la data e l'importo lordo; il fondo cala da quella
--    data. Una riga sbagliata si annulla (annullato_il), non si cancella.
-- 2. Destinazione del TFR del dipendente (cg_tfr_destinazioni). Dalla data
--    della scelta il TFR che matura va a un fondo pensione (D.Lgs. 252/2005) o,
--    nelle aziende con almeno 50 dipendenti, al Fondo Tesoreria INPS (L.
--    296/2006): resta un costo del conto economico, ma non entra nel fondo
--    TFR. Finché non è versato è un debito previdenziale: al Fondo Tesoreria
--    con l'F24 del 16 del mese dopo, ai fondi pensione entro il 16 del mese
--    dopo la fine del trimestre (la scadenza più diffusa: i versamenti veri non
--    sono registrati, alla scadenza si considerano fatti). Il TFR maturato
--    prima della scelta resta in azienda.
-- La rivalutazione annua del fondo (1,5% più il 75% dell'inflazione) non è
-- ancora calcolata.
-- Nessuna chiave esterna verso aziende e dipendenti: la purga e la rimozione
-- di un dipendente restano libere; che il dipendente sia dell'azienda lo
-- controlla un trigger. «azienda» corregge una scelta inserita per errore.

create table if not exists public.cg_tfr_movimenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid,
  tipo text not null check (tipo in ('liquidazione', 'anticipo')),
  data date not null,
  importo numeric(14,2) not null check (importo > 0),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  annullato_il timestamptz
);
create index if not exists cg_tfr_movimenti_company_data_idx on public.cg_tfr_movimenti (company_id, data);

create table if not exists public.cg_tfr_destinazioni (
  employee_id uuid primary key,
  company_id uuid not null,
  destinazione text not null check (destinazione in ('azienda', 'fondo_pensione', 'tesoreria_inps')),
  dal date not null,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists cg_tfr_destinazioni_company_idx on public.cg_tfr_destinazioni (company_id);

alter table public.cg_tfr_movimenti enable row level security;
alter table public.cg_tfr_destinazioni enable row level security;

revoke all on public.cg_tfr_movimenti from public, anon, authenticated;
revoke all on public.cg_tfr_destinazioni from public, anon, authenticated;
grant select, insert, update on public.cg_tfr_movimenti to authenticated;
grant select, insert, update on public.cg_tfr_destinazioni to authenticated;

do $p$
declare
  t text;
begin
  foreach t in array array['cg_tfr_movimenti', 'cg_tfr_destinazioni'] loop
    -- Le regole nascono con la tabella: se ci sono già, la migrazione è già passata.
    continue when exists (select 1 from pg_policies where schemaname = 'public' and tablename = t);
    execute format($q$create policy blocco_utente_bloccato on public.%I as restrictive for all to authenticated
      using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()))$q$, t);
    execute format($q$create policy permessi_finanza on public.%I as restrictive for all to authenticated
      using ((select public.utente_super_admin()) or company_id = any ((select public.aziende_area('{can_view_controllo_gestione,can_view_cruscotto,can_view_billing,can_view_costs,can_view_financial_reports,can_view_prima_nota,can_view_tesoreria,can_view_scadenzario,can_manage_payments,can_view_forecast}'::text[]))::uuid[]))
      with check ((select public.utente_super_admin()) or company_id = any ((select public.aziende_area('{can_view_controllo_gestione,can_view_cruscotto,can_view_billing,can_view_costs,can_view_financial_reports,can_view_prima_nota,can_view_tesoreria,can_view_scadenzario,can_manage_payments,can_view_forecast}'::text[]))::uuid[]))$q$, t);
    execute format($q$create policy tfr_select on public.%I for select to authenticated
      using (company_id = public.get_my_company_id() and not public.utente_e_cliente_esterno())$q$, t);
    execute format($q$create policy tfr_insert on public.%I for insert to authenticated
      with check (company_id = public.get_my_company_id() and not public.utente_e_cliente_esterno())$q$, t);
    execute format($q$create policy tfr_update on public.%I for update to authenticated
      using (company_id = public.get_my_company_id() and not public.utente_e_cliente_esterno())
      with check (company_id = public.get_my_company_id() and not public.utente_e_cliente_esterno())$q$, t);
  end loop;
end $p$;

-- Il dipendente, se c'è, è della stessa azienda. Un trigger e non una regola:
-- chi vede i conti può non avere il permesso di leggere i dipendenti.
create or replace function private.cg_tfr_dipendente_della_azienda()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.employee_id is not null and not exists (
       select 1 from public.employees e where e.id = new.employee_id and e.company_id = new.company_id) then
    raise exception 'Il dipendente non è di questa azienda' using errcode = '23503';
  end if;
  return new;
end $$;
revoke all on function private.cg_tfr_dipendente_della_azienda() from public, anon, authenticated;

do $p$
declare
  t text;
begin
  foreach t in array array['cg_tfr_movimenti', 'cg_tfr_destinazioni'] loop
    if not exists (select 1 from pg_trigger where tgname = 'cg_tfr_dipendente' and tgrelid = format('public.%I', t)::regclass) then
      execute format('create trigger cg_tfr_dipendente before insert or update on public.%I
        for each row execute function private.cg_tfr_dipendente_della_azienda()', t);
    end if;
  end loop;
end $p$;

-- TFR maturato che resta in azienda: senza i mesi dei dipendenti che lo destinano altrove.
create or replace function private.cg_patrimonio_al(p_company uuid, p_anno integer, p_rif date)
returns table(esercizio_base integer, capitale numeric, riserve numeric, utili_riportati numeric,
              tfr_iniziale numeric, tfr_maturato numeric, fondi numeric)
language plpgsql stable security definer set search_path to '' as $$
declare
  r public.patrimonio_netto%rowtype;
  y integer;
  v_l numeric;
begin
  select * into r from public.patrimonio_netto pn
   where pn.company_id = p_company and pn.esercizio <= p_anno
   order by pn.esercizio desc limit 1;

  esercizio_base  := r.esercizio;
  capitale        := coalesce(r.capitale_sociale, 0);
  riserve         := coalesce(r.riserva_legale, 0) + coalesce(r.riserva_straordinaria, 0)
                     + coalesce(r.altre_riserve, 0) + coalesce(r.utili_perdite_a_nuovo, 0);
  tfr_iniziale    := coalesce(r.fondo_tfr, 0);
  fondi           := coalesce(r.fondo_rischi, 0) + coalesce(r.altri_fondi, 0);
  utili_riportati := 0;

  -- Utili e perdite degli anni chiusi dopo la riga (al massimo dieci).
  if r.esercizio is not null then
    for y in greatest(r.esercizio, p_anno - 10) .. p_anno - 1 loop
      select (v ->> 'valore')::numeric into v_l
        from jsonb_array_elements(public.cg_get_conto_economico_riclassificato(p_company, y, 1, 12) -> 'voci') v
       where v ->> 'codice' = 'L'
       limit 1;
      utili_riportati := utili_riportati + coalesce(v_l, 0);
    end loop;
  end if;

  -- TFR maturato come nel conto economico, dall'anno della riga (o dall'anno, senza riga),
  -- tranne quello dei dipendenti che dalla loro scelta lo versano a un fondo.
  select coalesce(sum(round(coalesce(c.lordo, 0) / 13.5, 2)), 0) into tfr_maturato
    from public.cedolini c
    left join public.cg_tfr_destinazioni d on d.employee_id = c.employee_id and d.company_id = p_company
                                          and d.destinazione <> 'azienda'
   where c.company_id = p_company
     and c.stato in ('emesso', 'pagato')
     and make_date(c.anno, c.mese, 1) >= make_date(coalesce(r.esercizio, p_anno), 1, 1)
     and make_date(c.anno, c.mese, 1) <= p_rif
     and (d.employee_id is null or make_date(c.anno, c.mese, 1) < date_trunc('month', d.dal)::date);

  return next;
end $$;
revoke all on function private.cg_patrimonio_al(uuid, integer, date) from public, anon, authenticated;

-- Uscite dal fondo e TFR destinato ai fondi, dall'1/1 di p_dal_anno alla data.
create or replace function private.cg_tfr_movimenti_al(p_company uuid, p_dal_anno integer, p_rif date)
returns table(liquidato numeric, maturato_fondi numeric, da_versare numeric)
language sql stable security definer set search_path to '' as $$
  with fondi as (
    select round(coalesce(c.lordo, 0) / 13.5, 2) as quota, d.destinazione,
           make_date(c.anno, c.mese, 1) as mese
      from public.cedolini c
      join public.cg_tfr_destinazioni d on d.employee_id = c.employee_id and d.company_id = p_company
                                     and d.destinazione <> 'azienda'
     where c.company_id = p_company
       and c.stato in ('emesso', 'pagato')
       and make_date(c.anno, c.mese, 1) <= p_rif
       and make_date(c.anno, c.mese, 1) >= date_trunc('month', d.dal)::date
  )
  select
    coalesce((select sum(m.importo) from public.cg_tfr_movimenti m
               where m.company_id = p_company and m.annullato_il is null
                 and m.data >= make_date(p_dal_anno, 1, 1) and m.data <= p_rif), 0),
    coalesce((select sum(f.quota) from fondi f where f.mese >= make_date(p_dal_anno, 1, 1)), 0),
    -- Ancora da versare alla data: Tesoreria INPS il 16 del mese dopo, fondi pensione
    -- il 16 del mese dopo la fine del trimestre.
    coalesce((select sum(f.quota) from fondi f
               where case when f.destinazione = 'tesoreria_inps'
                          then (f.mese + interval '1 month' + interval '15 days')::date
                          else (date_trunc('quarter', f.mese) + interval '3 months' + interval '15 days')::date
                     end > p_rif), 0)
$$;
revoke all on function private.cg_tfr_movimenti_al(uuid, integer, date) from public, anon, authenticated;

do $p$
declare
  vecchio text := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  nuovo text := vecchio;
  prima text[] := array[
    $a$  v_tfr_maturato numeric(14,2) := 0;$a$,
    $a$  FROM private.cg_patrimonio_al(v_company_id, p_anno, v_rif) pa;$a$,
    $a$    AND c.stato IN ('emesso', 'pagato')
    AND make_date(c.anno, c.mese, 1) <= v_rif;$a$,
    $a$        'tfr_maturato', v_tfr_maturato),$a$];
  dopo text[] := array[
    $b$  v_tfr_maturato numeric(14,2) := 0;
  v_tfr_liquidato numeric(14,2) := 0;
  v_tfr_fondi numeric(14,2) := 0;
  v_tfr_da_versare numeric(14,2) := 0;$b$,
    $b$  FROM private.cg_patrimonio_al(v_company_id, p_anno, v_rif) pa;

  -- Liquidazioni e anticipi escono dal fondo; il TFR destinato ai fondi non c'entra.
  SELECT t.liquidato, t.maturato_fondi, t.da_versare
    INTO v_tfr_liquidato, v_tfr_fondi, v_tfr_da_versare
    FROM private.cg_tfr_movimenti_al(v_company_id, COALESCE(v_pn_base, p_anno), v_rif) t;
  v_tfr := COALESCE(v_tfr, 0) - v_tfr_liquidato;$b$,
    $b$    AND c.stato IN ('emesso', 'pagato')
    AND make_date(c.anno, c.mese, 1) <= v_rif;
  -- TFR destinato a fondi pensione o Fondo Tesoreria INPS e non ancora versato.
  v_debiti_prev := COALESCE(v_debiti_prev, 0) + v_tfr_da_versare;$b$,
    $b$        'tfr_maturato', v_tfr_maturato,
        'tfr_liquidato', v_tfr_liquidato,
        'tfr_ai_fondi', v_tfr_fondi,
        'tfr_da_versare_ai_fondi', v_tfr_da_versare),$b$];
  i integer;
begin
  if position('private.cg_tfr_movimenti_al' in nuovo) > 0 then
    return;
  end if;
  for i in 1 .. array_length(prima, 1) loop
    if position(prima[i] in nuovo) = 0 then
      raise exception 'Stato patrimoniale: blocco % non trovato, la funzione è cambiata', i;
    end if;
    if (length(nuovo) - length(replace(nuovo, prima[i], ''))) / length(prima[i]) <> 1 then
      raise exception 'Stato patrimoniale: blocco % presente più volte', i;
    end if;
    nuovo := replace(nuovo, prima[i], dopo[i]);
  end loop;
  execute nuovo;
end $p$;
