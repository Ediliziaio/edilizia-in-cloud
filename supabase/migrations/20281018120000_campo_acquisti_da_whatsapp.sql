-- Bolle e scontrini mandati su WhatsApp entrano in «Merce presa» (18/10/2026).
--
-- La bolla o lo scontrino che l'operaio fotografa su WhatsApp fa la stessa
-- strada di quella caricata dall'app Campo: va sul cantiere scelto, l'ufficio la
-- verifica in Magazzino e diventa costo della commessa, rimborso all'operaio o
-- carico dell'ordine d'acquisto. Una sola tabella, campo_acquisti, una sola
-- verifica, campo_acquisto_verifica.
--
-- Su WhatsApp scrivono anche operai che non hanno l'account nell'app: sono in
-- anagrafica dipendenti con il numero di telefono. La registrazione resta a nome
-- del dipendente (employee_id) e l'ufficio vede chi l'ha mandata; il rimborso
-- porta il suo nome.
--
-- 1. campo_acquisti: employee_id (chi l'ha mandata, se non ha account) e fonte
--    (app o whatsapp). La tabella è piccola: aggiungere le colonne è immediato.
-- 2. campo_acquisto_registra_whatsapp: come campo_acquisto_registra, ma la
--    persona arriva come parametro (identità già verificata dal bot sul numero
--    WhatsApp) invece che dalla sessione dell'app. Solo service role.
-- 3. campo_acquisto_verifica: il nome nel costo e nel rimborso viene anche
--    dall'anagrafica dipendenti, per chi non ha l'account.
--
-- Rilanciabile. La funzione di verifica si tocca solo se la riga da aggiornare
-- c'è una volta sola, oppure è già aggiornata; altrimenti la migrazione si
-- ferma senza cambiare niente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Chi l'ha mandata e da dove ────────────────────────────────────────────
alter table public.campo_acquisti
  add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.campo_acquisti
  add column if not exists fonte text not null default 'app';
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.campo_acquisti'::regclass and conname = 'campo_acquisti_fonte_check') then
    alter table public.campo_acquisti add constraint campo_acquisti_fonte_check check (fonte in ('app', 'whatsapp'));
  end if;
end $$;
create index if not exists idx_campo_acquisti_dipendente on public.campo_acquisti (employee_id, created_at desc);

-- ── 2. La registrazione da WhatsApp ─────────────────────────────────────────
create or replace function public.campo_acquisto_registra_whatsapp(
  p_company_id uuid,
  p_user_id uuid,
  p_employee_id uuid,
  p_order_id uuid,
  p_modalita text,
  p_tipo_documento text default 'altro',
  p_fornitore text default null,
  p_numero text default null,
  p_data date default null,
  p_totale numeric default null,
  p_righe jsonb default '[]'::jsonb,
  p_foto_path text default null,
  p_lettura jsonb default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nome text;
  v_codice text;
  v_dip_user uuid;
  v_dipendenti uuid[];
  v_forn text := left(btrim(coalesce(p_fornitore, '')), 120);
  v_num text := left(btrim(coalesce(p_numero, '')), 60);
  v_tipo text := case when p_tipo_documento in ('bolla', 'scontrino', 'fattura') then p_tipo_documento else 'altro' end;
  v_righe jsonb := '[]'::jsonb;
  v_r jsonb;
  v_desc text;
  v_qta numeric;
  v_prezzo numeric;
  v_imp numeric;
  v_somma numeric := 0;
  v_totale numeric := p_totale;
  v_suppliers uuid[];
  v_supplier uuid;
  v_oda uuid[];
  v_po uuid;
  v_dup record;
  v_id uuid;
  v_admin record;
begin
  if p_company_id is null or (p_user_id is null and p_employee_id is null) then
    raise exception using errcode = 'P0001', message = 'Non so chi ha mandato il documento.';
  end if;

  -- chi scrive: un utente dell'azienda, oppure un dipendente attivo dell'azienda
  if p_user_id is not null then
    select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_nome
      from public.profiles where id = p_user_id and company_id = p_company_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'Il tuo profilo non è collegato a questa azienda: avvisa l''ufficio.';
    end if;
  end if;
  if p_employee_id is not null then
    select user_id, coalesce(v_nome, nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''))
      into v_dip_user, v_nome
      from public.employees where id = p_employee_id and company_id = p_company_id and is_active;
    if not found then
      raise exception using errcode = 'P0001', message = 'Non risulti tra i dipendenti attivi: avvisa l''ufficio.';
    end if;
    if v_dip_user is not null and p_user_id is not null and v_dip_user <> p_user_id then
      raise exception using errcode = 'P0001', message = 'Il numero non corrisponde a una sola persona: avvisa l''ufficio.';
    end if;
  end if;
  if p_modalita is null or p_modalita not in ('pagato_da_me', 'conto_azienda', 'ritiro_ordine') then
    raise exception using errcode = 'P0001', message = 'Dici come hai preso la merce: l''hai pagata tu, è sul conto dell''azienda o è un ordine già fatto.';
  end if;

  -- cantiere: dell'azienda, e la persona ci lavora (o è dell'ufficio). Stesse
  -- assegnazioni dell'app Campo: diretta, o dipendente nella squadra della commessa.
  select order_code into v_codice from public.orders
   where id = p_order_id and company_id = p_company_id and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'Scegli il cantiere a cui va la merce.';
  end if;
  select array_agg(e.id) into v_dipendenti from public.employees e
   where e.company_id = p_company_id and (e.id = p_employee_id or (p_user_id is not null and e.user_id = p_user_id));
  if not ((p_user_id is not null and exists (
              select 1 from public.profiles p join public.user_roles ur on ur.user_id = p.id
               where p.id = p_user_id and p.company_id = p_company_id
                 and ur.role in ('company_admin', 'company_staff', 'super_admin')))
          or (p_user_id is not null and exists (
              select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = p_user_id))
          or exists (select 1 from public.order_employees oe
                      where oe.order_id = p_order_id and oe.employee_id = any (coalesce(v_dipendenti, '{}')))) then
    raise exception using errcode = 'P0001', message = 'Non puoi segnare merce per un cantiere che non ti è assegnato.';
  end if;

  -- prodotti: solo righe con una descrizione, quantità e importi puliti
  if jsonb_typeof(p_righe) = 'array' then
    for v_r in select * from jsonb_array_elements(p_righe) limit 200 loop
      v_desc := left(btrim(coalesce(v_r->>'descrizione', '')), 200);
      continue when v_desc = '';
      v_qta := case when (v_r->>'quantita') ~ '^[0-9]+([.][0-9]+)?$' then (v_r->>'quantita')::numeric else 1 end;
      v_prezzo := case when (v_r->>'prezzo_unitario') ~ '^[0-9]+([.][0-9]+)?$' then (v_r->>'prezzo_unitario')::numeric else null end;
      v_imp := case when (v_r->>'importo') ~ '^[0-9]+([.][0-9]+)?$' then (v_r->>'importo')::numeric
                    when v_prezzo is not null then round(v_prezzo * v_qta, 2) else null end;
      v_somma := v_somma + coalesce(v_imp, 0);
      v_righe := v_righe || jsonb_build_object(
        'descrizione', v_desc,
        'codice', nullif(left(btrim(coalesce(v_r->>'codice', '')), 60), ''),
        'quantita', least(v_qta, 1000000),
        'unita', nullif(left(btrim(coalesce(v_r->>'unita', '')), 12), ''),
        'prezzo_unitario', v_prezzo,
        'importo', v_imp);
    end loop;
  end if;
  if v_totale is null and v_somma > 0 then v_totale := round(v_somma, 2); end if;
  if v_totale is not null and (v_totale < 0 or v_totale > 1000000) then
    raise exception using errcode = 'P0001', message = 'Il totale non sembra giusto: controllalo.';
  end if;
  if p_modalita = 'pagato_da_me' and coalesce(v_totale, 0) <= 0 then
    raise exception using errcode = 'P0001', message = 'Indica quanto hai speso: serve per il rimborso.';
  end if;
  -- una bolla fotografata va bene anche senza articoli letti: li completa l'ufficio
  if v_totale is null and jsonb_array_length(v_righe) = 0
     and not (v_tipo = 'bolla' and nullif(btrim(coalesce(p_foto_path, '')), '') is not null) then
    raise exception using errcode = 'P0001', message = 'Indica almeno il totale o i prodotti che hai preso.';
  end if;

  -- stesso documento due volte: non si carica due volte (doppio costo, doppio rimborso)
  if v_num <> '' then
    select a.created_at,
           coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
                    nullif(btrim(coalesce(em.first_name, '') || ' ' || coalesce(em.last_name, '')), ''), 'un collega') as chi
      into v_dup
      from public.campo_acquisti a
      left join public.profiles pr on pr.id = a.user_id
      left join public.employees em on em.id = a.employee_id
     where a.company_id = p_company_id and a.stato not in ('rifiutato', 'annullato')
       and lower(btrim(coalesce(a.fornitore, ''))) = lower(v_forn)
       and btrim(coalesce(a.numero_documento, '')) = v_num
       and a.data_documento is not distinct from p_data
     order by a.created_at desc limit 1;
    if found then
      raise exception using errcode = 'P0001', message =
        'Questo documento è già stato caricato da ' || v_dup.chi || ' il ' || to_char(v_dup.created_at at time zone 'Europe/Rome', 'DD/MM') || ': non serve rimandarlo.';
    end if;
  elsif exists (select 1 from public.campo_acquisti a
                 where a.company_id = p_company_id
                   and ((p_user_id is not null and a.user_id = p_user_id) or (p_employee_id is not null and a.employee_id = p_employee_id))
                   and a.stato not in ('rifiutato', 'annullato')
                   and a.created_at > now() - interval '6 hours'
                   and a.totale is not distinct from v_totale
                   and lower(btrim(coalesce(a.fornitore, ''))) = lower(v_forn)) then
    raise exception using errcode = 'P0001', message = 'Hai già inviato questo documento poco fa: non serve rimandarlo.';
  end if;

  -- fornitore dell'anagrafica, se uno solo corrisponde («Tecnomat» trova «Tecnomat S.p.A.»)
  if length(v_forn) >= 4 then
    select array_agg(s.id) into v_suppliers from public.suppliers s
     where s.company_id = p_company_id and length(btrim(s.name)) >= 4
       and (position(lower(btrim(s.name)) in lower(v_forn)) > 0 or position(lower(v_forn) in lower(btrim(s.name))) > 0);
    if cardinality(v_suppliers) = 1 then v_supplier := v_suppliers[1]; end if;
  end if;

  -- ritiro di un ordine: se c'è UN solo ordine d'acquisto aperto per questo cantiere (e fornitore), lo propone
  if p_modalita = 'ritiro_ordine' then
    select array_agg(po.id) into v_oda from public.purchase_orders po
     where po.company_id = p_company_id and po.order_id = p_order_id
       and po.status in ('inviato', 'confermato', 'parziale')
       and (v_supplier is null or po.supplier_id = v_supplier);
    if cardinality(v_oda) = 1 then v_po := v_oda[1]; end if;
  end if;

  insert into public.campo_acquisti (company_id, user_id, employee_id, fonte, order_id, modalita, tipo_documento, fornitore,
                                     supplier_id, numero_documento, data_documento, totale, righe, foto_path, lettura_ai,
                                     purchase_order_id, rimborso_stato, note)
  values (p_company_id, coalesce(p_user_id, v_dip_user), p_employee_id, 'whatsapp', p_order_id, p_modalita, v_tipo,
          nullif(v_forn, ''), v_supplier, nullif(v_num, ''), p_data, v_totale, v_righe,
          nullif(left(coalesce(p_foto_path, ''), 300), ''), p_lettura,
          v_po, case when p_modalita = 'pagato_da_me' then 'da_rimborsare' else 'non_dovuto' end,
          nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  returning id into v_id;

  -- l'ufficio lo vede subito
  for v_admin in
    select p.id from public.profiles p join public.user_roles ur on ur.user_id = p.id
     where p.company_id = p_company_id and ur.role in ('company_admin', 'company_staff')
  loop
    perform public.campo_notifica(p_company_id, v_admin.id, 'campo_acquisto', 'Merce da verificare',
      coalesce(v_nome, 'Un operaio') || ' ha mandato su WhatsApp ' || case v_tipo when 'scontrino' then 'uno scontrino' else 'una bolla' end
        || coalesce(' di ' || nullif(v_forn, ''), '') || ' per ' || coalesce(v_codice, 'un cantiere')
        || case when v_totale is not null then ' (' || replace(to_char(v_totale, 'FM9999990.00'), '.', ',') || ' €)' else '' end || '.',
      'campo_acquisto', v_id, '/azienda/magazzino');
  end loop;

  return v_id;
end;
$$;
revoke all on function public.campo_acquisto_registra_whatsapp(uuid, uuid, uuid, uuid, text, text, text, text, date, numeric, jsonb, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.campo_acquisto_registra_whatsapp(uuid, uuid, uuid, uuid, text, text, text, text, date, numeric, jsonb, text, jsonb, text) to service_role;

-- ── 3. Il nome di chi l'ha mandata, anche senza account ──────────────────────
do $$
declare
  v_impronta text;
  v_def text;
  v_vecchio constant text := $v$  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_nome_op from public.profiles where id = a.user_id;$v$;
  v_nuovo constant text := $v$  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_nome_op from public.profiles where id = a.user_id;
  if v_nome_op is null and a.employee_id is not null then
    select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_nome_op from public.employees where id = a.employee_id;
  end if;$v$;
begin
  select md5(p.prosrc), pg_get_functiondef(p.oid) into v_impronta, v_def
    from pg_proc p where p.oid = 'public.campo_acquisto_verifica(uuid,text,numeric,uuid,text)'::regprocedure;
  -- La funzione è cambiata anche per altre ragioni dopo il 18/10/2026: si
  -- controlla la riga da aggiornare, non l'impronta di tutto il corpo.
  if position('from public.employees where id = a.employee_id' in v_def) > 0 then
    return; -- già aggiornata
  end if;
  if (length(v_def) - length(replace(v_def, v_vecchio, ''))) / length(v_vecchio) <> 1 then
    raise exception 'campo_acquisto_verifica: il punto da aggiornare non è unico';
  end if;
  execute replace(v_def, v_vecchio, v_nuovo);
end $$;
