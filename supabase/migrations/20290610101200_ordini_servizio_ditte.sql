-- Ordini di servizio e contestazioni alle ditte subappaltatrici (26/11/2026, piano campo completo, punto 3.4).
--
-- Finora andavano solo dalla ditta all'impresa (Segnala). Ora l'impresa (ufficio o capocantiere) manda alla
-- ditta un ordine di servizio o una contestazione, con foto e scadenza; la ditta lo vede nell'app, conferma di
-- averlo letto e lo chiude scrivendo cosa ha fatto (con una foto). Chi l'ha mandato lo accetta o lo riapre.
-- Ogni passaggio avvisa l'altra parte. Le foto stanno nel bucket della ditta («azienda/ditta/…»), già protetto
-- (ognuno vede solo la sua ditta).

create table if not exists public.ordini_servizio_ditte (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subappaltatore_id uuid not null references public.subappaltatori(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  tipo text not null check (tipo in ('ordine', 'contestazione')),
  titolo text not null check (length(titolo) between 3 and 160),
  testo text,
  foto text[] not null default '{}',
  scadenza date,
  stato text not null default 'inviato' check (stato in ('inviato', 'letto', 'risolto', 'accettato', 'riaperto')),
  letto_il timestamptz,
  risposta text,
  foto_risposta text[] not null default '{}',
  risolto_il timestamptz,
  nota_chiusura text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ordini_servizio_ditte_ditta on public.ordini_servizio_ditte (subappaltatore_id, created_at desc);
alter table public.ordini_servizio_ditte enable row level security;
revoke all on public.ordini_servizio_ditte from public, anon, authenticated;
drop policy if exists ordini_servizio_lettura on public.ordini_servizio_ditte;
create policy ordini_servizio_lettura on public.ordini_servizio_ditte for select to authenticated
  using (
    (company_id = public.get_my_company_id() and not private.utente_solo_campo()
     and coalesce(public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id), false))
    or exists (select 1 from public.subappaltatori s where s.id = subappaltatore_id and s.user_id = (select auth.uid()))
    or created_by = (select auth.uid())
  );
grant select on public.ordini_servizio_ditte to authenticated;

-- Manda: ufficio con «modifica commesse» o capocantiere di quel cantiere.
create or replace function public.ordine_servizio_crea(
  p_subappaltatore_id uuid, p_order_id uuid, p_tipo text, p_titolo text, p_testo text, p_scadenza date, p_foto text[])
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.get_my_company_id();
  v_ditta record;
  v_id uuid;
begin
  if v_uid is null or v_company is null or public.utente_bloccato() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  select s.id, s.user_id into v_ditta from public.subappaltatori s where s.id = p_subappaltatore_id and s.company_id = v_company;
  if v_ditta.id is null then raise exception 'Ditta non trovata.' using errcode = '42501'; end if;
  if not (coalesce(public.has_permission_for_company(v_uid, 'can_edit_orders', v_company), false) and not private.utente_solo_campo()
          or (p_order_id is not null and exists (select 1 from public.order_campo_assignments a
                where a.order_id = p_order_id and a.user_id = v_uid and a.is_capocantiere))) then
    raise exception 'Lo manda l''ufficio o il capocantiere.' using errcode = '42501';
  end if;
  if p_tipo not in ('ordine', 'contestazione') or length(btrim(coalesce(p_titolo, ''))) not between 3 and 160 then
    raise exception 'Scrivi in breve di cosa si tratta.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_foto, 1), 0) > 6
     or exists (select 1 from unnest(coalesce(p_foto, '{}')) f where f not like v_company::text || '/' || v_ditta.id::text || '/%') then
    raise exception 'Foto non valide.' using errcode = '22023';
  end if;
  insert into public.ordini_servizio_ditte (company_id, subappaltatore_id, order_id, tipo, titolo, testo, foto, scadenza, created_by)
  values (v_company, v_ditta.id, p_order_id, p_tipo, btrim(p_titolo), nullif(btrim(coalesce(p_testo, '')), ''),
          coalesce(p_foto, '{}'), p_scadenza, v_uid)
  returning id into v_id;
  if v_ditta.user_id is not null then
    perform public.campo_notifica(v_company, v_ditta.user_id, 'ordine_servizio',
      case when p_tipo = 'contestazione' then 'Nuova contestazione dall''impresa' else 'Nuovo ordine di servizio' end,
      btrim(p_titolo), 'ordine_servizio', v_id, '/campo/ordini-servizio');
  end if;
  return v_id;
end;
$function$;

-- La ditta: letto, poi risolto con la risposta e le foto.
create or replace function public.ordine_servizio_ditta(p_id uuid, p_azione text, p_risposta text, p_foto text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_os public.ordini_servizio_ditte;
begin
  select os.* into v_os from public.ordini_servizio_ditte os
    join public.subappaltatori s on s.id = os.subappaltatore_id and s.user_id = v_uid
   where os.id = p_id for update of os;
  if v_os.id is null or public.utente_bloccato() then
    raise exception 'Non trovato.' using errcode = '42501';
  end if;
  if p_azione = 'letto' then
    update public.ordini_servizio_ditte set stato = case when stato in ('inviato') then 'letto' else stato end,
      letto_il = coalesce(letto_il, now()), updated_at = now() where id = p_id;
  elsif p_azione = 'risolto' then
    if v_os.stato not in ('inviato', 'letto', 'riaperto') then raise exception 'È già chiuso.' using errcode = '22023'; end if;
    if length(btrim(coalesce(p_risposta, ''))) < 2 then raise exception 'Scrivi cosa avete fatto.' using errcode = '22023'; end if;
    if coalesce(array_length(p_foto, 1), 0) > 6
       or exists (select 1 from unnest(coalesce(p_foto, '{}')) f where f not like v_os.company_id::text || '/' || v_os.subappaltatore_id::text || '/%') then
      raise exception 'Foto non valide.' using errcode = '22023';
    end if;
    update public.ordini_servizio_ditte set stato = 'risolto', risposta = left(btrim(p_risposta), 2000),
      foto_risposta = coalesce(p_foto, '{}'), risolto_il = now(), letto_il = coalesce(letto_il, now()), updated_at = now()
     where id = p_id;
    if v_os.created_by is not null then
      perform public.campo_notifica(v_os.company_id, v_os.created_by, 'ordine_servizio', 'La ditta ha risposto', v_os.titolo,
        'ordine_servizio', v_os.id, '/azienda/subappaltatori');
    end if;
  else
    raise exception 'Azione non valida.' using errcode = '22023';
  end if;
end;
$function$;

-- Chi l'ha mandato (o l'ufficio): accetta la chiusura o riapre.
create or replace function public.ordine_servizio_decidi(p_id uuid, p_accetta boolean, p_nota text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_os public.ordini_servizio_ditte;
  v_ditta_user uuid;
begin
  select * into v_os from public.ordini_servizio_ditte where id = p_id for update;
  if v_os.id is null or public.utente_bloccato() or v_os.company_id is distinct from public.get_my_company_id()
     or not (v_os.created_by = v_uid or (coalesce(public.has_permission_for_company(v_uid, 'can_edit_orders', v_os.company_id), false)
                                         and not private.utente_solo_campo())) then
    raise exception 'Non puoi decidere su questo.' using errcode = '42501';
  end if;
  if v_os.stato <> 'risolto' then raise exception 'La ditta non l''ha ancora chiuso.' using errcode = '22023'; end if;
  update public.ordini_servizio_ditte set stato = case when p_accetta then 'accettato' else 'riaperto' end,
    nota_chiusura = nullif(left(btrim(coalesce(p_nota, '')), 1000), ''), updated_at = now() where id = p_id;
  select s.user_id into v_ditta_user from public.subappaltatori s where s.id = v_os.subappaltatore_id;
  if not p_accetta and v_ditta_user is not null then
    perform public.campo_notifica(v_os.company_id, v_ditta_user, 'ordine_servizio', 'Ordine riaperto: va rifatto', v_os.titolo,
      'ordine_servizio', v_os.id, '/campo/ordini-servizio');
  end if;
end;
$function$;

revoke all on function public.ordine_servizio_crea(uuid, uuid, text, text, text, date, text[]) from public, anon;
revoke all on function public.ordine_servizio_ditta(uuid, text, text, text[]) from public, anon;
revoke all on function public.ordine_servizio_decidi(uuid, boolean, text) from public, anon;
grant execute on function public.ordine_servizio_crea(uuid, uuid, text, text, text, date, text[]) to authenticated;
grant execute on function public.ordine_servizio_ditta(uuid, text, text, text[]) to authenticated;
grant execute on function public.ordine_servizio_decidi(uuid, boolean, text) to authenticated;
