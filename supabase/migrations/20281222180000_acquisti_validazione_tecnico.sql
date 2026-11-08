-- Acquisti: la validazione del tecnico, obbligatoria per chi la vuole.
--
-- Provato il 07/11/2026 sulla Demo 2: un ordine d'acquisto partiva anche per i
-- materiali di una fase IN VERIFICA dal tecnico (la richiesta d'offerta invece
-- era bloccata). La richiesta di un'impresa cliente è il contrario: la distinta
-- la valida il tecnico prima che la veda l'ufficio acquisti. Altre aziende non
-- usano la validazione e devono continuare a ordinare come oggi.
--
-- Quindi:
--   * company_acquisti_impostazioni: per azienda, `validazione_obbligatoria`
--     (spenta di base), più i giorni di consegna predefiniti e il promemoria
--     agli acquisti, che servono al cruscotto del fabbisogno.
--   * materiali_motivo_blocco_acquisto(riga): perché un materiale non si può
--     ancora comprare, o null.
--       - Sempre (anche a impostazione spenta): la fase è stata mandata al
--         tecnico e non è validata (in verifica, o rimandata in bozza). Chi la
--         manda in verifica vuole la verifica.
--       - Solo a impostazione accesa: la fase non è mai stata mandata al
--         tecnico, o il materiale non è in una fase.
--   * Un trigger su purchase_order_items fa valere la regola su OGNI strada
--     che crea una riga d'ordine collegata a un materiale (pannello «Ordina ai
--     fornitori», riga aggiunta a mano, aggiudicazione di un'offerta, import):
--     vale per le righe di un ordine ancora in bozza, cioè quando si ordina. Le
--     righe che nascono dentro un ordine già emesso vengono dalla divisione di
--     una riga esistente (dividi_scarico_magazzino) e non sono un acquisto nuovo.
--   * acquisti_materiali_controllati (richiesta d'offerta) usa la stessa regola.
--
-- Al 07/11/2026 nessuna fase della piattaforma è mai stata validata e
-- l'impostazione parte spenta: per chi lavora oggi non cambia niente.

-- ─── Impostazioni ───────────────────────────────────────────────────────────

create table if not exists public.company_acquisti_impostazioni (
  company_id uuid primary key references public.companies(id) on delete cascade,
  validazione_obbligatoria boolean not null default false,
  giorni_consegna_predefiniti integer not null default 7 check (giorni_consegna_predefiniti between 0 and 365),
  promemoria_attivo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.company_acquisti_impostazioni is
  'Per azienda: validazione del tecnico obbligatoria prima degli acquisti, giorni di consegna predefiniti dei fornitori, promemoria quotidiano all''ufficio acquisti. Si scrive solo con acquisti_impostazioni_salva.';

alter table public.company_acquisti_impostazioni enable row level security;

drop policy if exists company_acquisti_impostazioni_leggi on public.company_acquisti_impostazioni;
create policy company_acquisti_impostazioni_leggi on public.company_acquisti_impostazioni
  for select to authenticated
  using (public.user_can_access_company(company_id));

revoke all on public.company_acquisti_impostazioni from public, anon, authenticated;
grant select on public.company_acquisti_impostazioni to authenticated;
grant all on public.company_acquisti_impostazioni to service_role;

create or replace function public.acquisti_impostazioni_salva(
  p_company uuid, p_validazione_obbligatoria boolean, p_giorni_consegna integer, p_promemoria boolean)
 returns public.company_acquisti_impostazioni
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  riga public.company_acquisti_impostazioni;
begin
  if uid is null or p_company is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;
  if public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.user_can_access_company(p_company) then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if not (public.has_role(uid, 'super_admin'::public.app_role)
          or exists (select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
                      where ur.user_id = uid and ur.role = 'company_admin'::public.app_role and p.company_id = p_company)
          or public.has_permission_for_company(uid, 'can_edit_settings_orders', p_company)) then
    raise exception 'Le impostazioni degli acquisti le cambia l''amministratore o chi modifica la configurazione ordini' using errcode = '42501';
  end if;
  if p_giorni_consegna is null or p_giorni_consegna < 0 or p_giorni_consegna > 365 then
    raise exception 'I giorni di consegna vanno da 0 a 365' using errcode = '22023';
  end if;
  insert into public.company_acquisti_impostazioni as s (company_id, validazione_obbligatoria, giorni_consegna_predefiniti, promemoria_attivo, updated_at, updated_by)
  values (p_company, coalesce(p_validazione_obbligatoria, false), p_giorni_consegna, coalesce(p_promemoria, true), now(), uid)
  on conflict (company_id) do update
     set validazione_obbligatoria = excluded.validazione_obbligatoria,
         giorni_consegna_predefiniti = excluded.giorni_consegna_predefiniti,
         promemoria_attivo = excluded.promemoria_attivo,
         updated_at = now(), updated_by = uid
  returning * into riga;
  return riga;
end;
$function$;

revoke all on function public.acquisti_impostazioni_salva(uuid, boolean, integer, boolean) from public, anon;
grant execute on function public.acquisti_impostazioni_salva(uuid, boolean, integer, boolean) to authenticated, service_role;

-- ─── La regola ──────────────────────────────────────────────────────────────

create or replace function public.materiali_motivo_blocco_acquisto(p_item uuid)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
    when oi.natura_riga is distinct from 'materiale' then null
    when v.stato is not null and v.stato <> 'validata' then
      format('«%s»: i materiali della fase «%s» non sono ancora validati dal tecnico (%s).',
             oi.name, w.name, case v.stato when 'da_validare' then 'sono in verifica' else 'sono stati rimandati in bozza' end)
    when coalesce(s.validazione_obbligatoria, false) and oi.phase_id is null then
      format('«%s» non è in una fase: in questa azienda i materiali si comprano dopo la validazione del tecnico, fase per fase.', oi.name)
    when coalesce(s.validazione_obbligatoria, false) and v.stato is null then
      format('«%s»: la fase «%s» non è stata mandata al tecnico, e in questa azienda i materiali si comprano dopo la sua validazione.', oi.name, w.name)
    else null
  end
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.order_work_phases w on w.id = oi.phase_id
  left join public.materiali_fasi_validazione v on v.phase_id = oi.phase_id
  left join public.company_acquisti_impostazioni s on s.company_id = o.company_id
  where oi.id = p_item;
$function$;

-- Restituisce il nome di una riga di commessa qualunque: solo per il trigger e per
-- le funzioni SECURITY DEFINER che la chiamano, mai dal browser.
revoke all on function public.materiali_motivo_blocco_acquisto(uuid) from public, anon, authenticated;
grant execute on function public.materiali_motivo_blocco_acquisto(uuid) to service_role;

comment on function public.materiali_motivo_blocco_acquisto(uuid) is
  'Perché un materiale della commessa non si può ancora comprare (validazione del tecnico), o null. La usano il trigger su purchase_order_items e la richiesta d''offerta.';

-- ─── Ogni riga d'ordine nuova la rispetta ───────────────────────────────────

create or replace function public.purchase_order_items_materiale_validato()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  motivo text;
begin
  if new.order_item_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.order_item_id is not distinct from old.order_item_id then
    return new;
  end if;
  -- Solo quando si ordina: righe di un ordine in bozza. Una riga che nasce in un
  -- ordine già emesso viene dalla divisione di una riga esistente.
  if not exists (select 1 from public.purchase_orders po where po.id = new.purchase_order_id and po.status = 'bozza') then
    return new;
  end if;
  motivo := public.materiali_motivo_blocco_acquisto(new.order_item_id);
  if motivo is not null then
    raise exception '%', motivo using errcode = '22023';
  end if;
  return new;
end;
$function$;

revoke all on function public.purchase_order_items_materiale_validato() from public, anon, authenticated;

drop trigger if exists purchase_order_items_materiale_validato on public.purchase_order_items;
create trigger purchase_order_items_materiale_validato
  before insert or update of order_item_id on public.purchase_order_items
  for each row execute function public.purchase_order_items_materiale_validato();

-- ─── Richiesta d'offerta: la stessa regola ──────────────────────────────────

create or replace function public.acquisti_materiali_controllati(p_items uuid[])
 returns table(id uuid, order_id uuid, company_id uuid, name text, specifiche text, unita_misura text, quantity numeric, article_template_id uuid, supplier_rfq_item_id uuid)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  aziende integer;
  trovate integer;
  azienda uuid;
  motivo text;
begin
  if coalesce(cardinality(p_items), 0) = 0 then
    raise exception 'Seleziona almeno un materiale' using errcode = '22023';
  end if;
  select count(distinct o.company_id), count(*), min(o.company_id::text)::uuid into aziende, trovate, azienda
    from public.order_items oi join public.orders o on o.id = oi.order_id
   where oi.id = any(p_items);
  if trovate <> (select count(distinct x) from unnest(p_items) x) or aziende <> 1
     or not public.materiali_utente_in_azienda(azienda) then
    raise exception 'Materiali non trovati' using errcode = 'P0002';
  end if;
  if not (public.materiali_puo('can_manage_purchasing', azienda) or public.materiali_puo('can_edit_orders', azienda)) then
    raise exception 'Gli acquisti li fa l''ufficio acquisti (o chi modifica le commesse)' using errcode = '42501';
  end if;
  if exists (select 1 from public.order_items oi where oi.id = any(p_items) and oi.natura_riga <> 'materiale') then
    raise exception 'Solo i materiali si comprano: lavorazioni e descrizioni no' using errcode = '22023';
  end if;
  select m into motivo
    from unnest(p_items) x, lateral (select public.materiali_motivo_blocco_acquisto(x) as m) b
   where b.m is not null
   limit 1;
  if motivo is not null then
    raise exception '%', motivo using errcode = '22023';
  end if;
  return query
    select oi.id, oi.order_id, o.company_id, oi.name, oi.specifiche, oi.unita_misura, oi.quantity,
           oi.article_template_id, oi.supplier_rfq_item_id
      from public.order_items oi join public.orders o on o.id = oi.order_id
     where oi.id = any(p_items)
     order by oi.order_id, oi.phase_id, oi.position;
end;
$function$;

revoke all on function public.acquisti_materiali_controllati(uuid[]) from public, anon, authenticated;
grant execute on function public.acquisti_materiali_controllati(uuid[]) to service_role;
