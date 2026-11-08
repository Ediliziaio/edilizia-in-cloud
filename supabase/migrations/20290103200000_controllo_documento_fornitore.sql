-- Il controllo del documento del fornitore (08/11/2026), piano articoli su misura, fase 6.
--
-- Vale per l'offerta ricevuta e per la conferma d'ordine. L'AI legge il documento, il codice
-- lo confronta con quello che abbiamo chiesto, e il risultato finisce qui: una riga per
-- posizione, chiesto | letto | esito. Con rossi o letture incerte l'ordine non passa a
-- «confermato» senza «Accetto» e il motivo. Stesso file due volte: riconosciuto dall'impronta.
--
-- Tabella nuova e colonne facoltative: nessuna riga esistente viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.controlli_documento_fornitore (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_order_id uuid references public.purchase_orders(id) on delete cascade,
  rfq_supplier_id uuid references public.supplier_rfq_suppliers(id) on delete cascade,
  tipo text not null check (tipo in ('offerta', 'conferma')),
  file_hash text not null,
  file_path text,
  file_nome text,
  email_inbox_id uuid,
  stato text not null default 'in_lettura' check (stato in ('in_lettura', 'letto')),
  esito text check (esito in ('verde', 'giallo', 'rosso', 'da_controllare')),
  lettura jsonb,
  righe jsonb not null default '[]'::jsonb,
  accettato_motivo text,
  accettato_il timestamptz,
  accettato_da uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((purchase_order_id is not null) <> (rfq_supplier_id is not null))
);

comment on table public.controlli_documento_fornitore is 'Un controllo per ogni documento del fornitore: offerta o conferma, confrontata con le regole del codice.';
comment on column public.controlli_documento_fornitore.file_hash is 'Impronta del file: lo stesso documento caricato due volte è riconosciuto.';
comment on column public.controlli_documento_fornitore.righe is 'Una riga per posizione: chiesto, letto, esito e i campi confrontati.';

create unique index if not exists controlli_documento_fornitore_unico
  on public.controlli_documento_fornitore (company_id, coalesce(purchase_order_id, rfq_supplier_id), tipo, file_hash);
create index if not exists controlli_documento_fornitore_oda_idx
  on public.controlli_documento_fornitore (purchase_order_id, created_at desc) where purchase_order_id is not null;
create index if not exists controlli_documento_fornitore_rfq_idx
  on public.controlli_documento_fornitore (rfq_supplier_id, created_at desc) where rfq_supplier_id is not null;

alter table public.controlli_documento_fornitore enable row level security;
revoke all on public.controlli_documento_fornitore from anon, authenticated;
grant select on public.controlli_documento_fornitore to authenticated;

drop policy if exists controlli_documento_fornitore_lettura on public.controlli_documento_fornitore;
create policy controlli_documento_fornitore_lettura on public.controlli_documento_fornitore
  for select to authenticated
  using (public.user_can_access_company(company_id) and public.materiali_puo('can_view_orders', company_id));

alter table public.company_acquisti_impostazioni
  add column if not exists conferma_giorni_promemoria integer not null default 3,
  add column if not exists conferma_tolleranza_mm numeric not null default 5;

alter table public.purchase_orders
  add column if not exists conferma_sollecitata_il timestamptz;

alter table public.email_inbox
  add column if not exists purchase_order_id uuid references public.purchase_orders(id) on delete set null;
create index if not exists email_inbox_purchase_order_idx
  on public.email_inbox (purchase_order_id) where purchase_order_id is not null;

create or replace function public._controllo_documento_esito(p_righe jsonb)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when jsonb_array_length(coalesce(p_righe, '[]'::jsonb)) = 0 then 'da_controllare'
    when exists (select 1 from jsonb_array_elements(p_righe) r where r->>'esito' = 'rosso') then 'rosso'
    when exists (select 1 from jsonb_array_elements(p_righe) r where r->>'esito' = 'da_controllare') then 'da_controllare'
    when exists (select 1 from jsonb_array_elements(p_righe) r where r->>'esito' = 'giallo') then 'giallo'
    else 'verde'
  end;
$function$;

create or replace function public._controllo_documento_puo(p_company uuid)
 returns void
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.user_can_access_company(p_company)
     or not (public.materiali_puo('can_manage_purchasing', p_company) or public.materiali_puo('can_edit_orders', p_company)) then
    raise exception 'Gli acquisti li fa l''ufficio acquisti (o chi modifica le commesse)' using errcode = '42501';
  end if;
end;
$function$;

-- Una lettura incerta la risolve una persona, guardando il documento.
create or replace function public.controllo_documento_riga_decidi(p_id uuid, p_chiave text, p_esito text, p_nota text default null)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c public.controlli_documento_fornitore;
  nuove jsonb;
  esito_nuovo text;
begin
  select * into c from public.controlli_documento_fornitore where id = p_id for update;
  if not found then
    raise exception 'Controllo non trovato' using errcode = 'P0002';
  end if;
  perform public._controllo_documento_puo(c.company_id);
  if p_esito not in ('verde', 'rosso') then
    raise exception 'Scegli se è giusta o sbagliata' using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_array_elements(c.righe) r where r->>'chiave' = p_chiave and r->>'esito' = 'da_controllare') then
    raise exception 'Questa riga non è da controllare' using errcode = '22023';
  end if;
  select jsonb_agg(case when r->>'chiave' = p_chiave then
      r || jsonb_build_object('esito', p_esito, 'deciso_da_persona', true, 'nota_persona', nullif(btrim(coalesce(p_nota, '')), ''))
    else r end order by ord)
    into nuove
    from jsonb_array_elements(c.righe) with ordinality t(r, ord);
  esito_nuovo := public._controllo_documento_esito(nuove);
  update public.controlli_documento_fornitore
     set righe = nuove, esito = esito_nuovo, updated_at = now()
   where id = p_id;
  return esito_nuovo;
end;
$function$;

create or replace function public.controllo_documento_accetta(p_id uuid, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c public.controlli_documento_fornitore;
  motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into c from public.controlli_documento_fornitore where id = p_id for update;
  if not found then
    raise exception 'Controllo non trovato' using errcode = 'P0002';
  end if;
  perform public._controllo_documento_puo(c.company_id);
  if c.stato <> 'letto' then
    raise exception 'Il documento è ancora in lettura' using errcode = '22023';
  end if;
  if c.esito in ('rosso', 'da_controllare') and (motivo is null or length(motivo) < 5) then
    raise exception 'Scrivi il motivo: con errori si accetta solo spiegando perché' using errcode = '22023';
  end if;
  update public.controlli_documento_fornitore
     set accettato_motivo = motivo, accettato_il = now(), accettato_da = auth.uid(), updated_at = now()
   where id = p_id and accettato_il is null;
end;
$function$;

-- Con errori non accettati l'ordine non diventa «confermato».
create or replace function public.purchase_orders_blocco_conferma()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c public.controlli_documento_fornitore;
begin
  if new.status is distinct from 'confermato' or old.status is not distinct from 'confermato' then
    return new;
  end if;
  select * into c from public.controlli_documento_fornitore
   where purchase_order_id = new.id and tipo = 'conferma' and stato = 'letto'
   order by created_at desc limit 1;
  if found and c.esito in ('rosso', 'da_controllare') and c.accettato_il is null then
    raise exception 'La conferma del fornitore ha differenze: apri il controllo e, se vanno bene, usa «Accetto» scrivendo il motivo.'
      using errcode = 'DOC01';
  end if;
  return new;
end;
$function$;

drop trigger if exists purchase_orders_blocco_conferma on public.purchase_orders;
create trigger purchase_orders_blocco_conferma
  before update of status on public.purchase_orders
  for each row execute function public.purchase_orders_blocco_conferma();

-- La risposta del fornitore si aggancia al codice dell'ordine nell'oggetto.
create or replace function public.aggancia_email_a_oda()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  codice text;
  ordine uuid;
begin
  if coalesce(new.mailbox_folder, '') = 'sent' or new.company_id is null then
    return null;
  end if;
  codice := substring(new.subject from 'ODA-[0-9]{4}-[0-9]+');
  if codice is null then
    return null;
  end if;
  select po.id into ordine from public.purchase_orders po
   where po.company_id = new.company_id and po.oda_number = codice;
  if ordine is not null then
    update public.email_inbox set purchase_order_id = ordine where id = new.id;
  end if;
  return null;
end;
$function$;

drop trigger if exists aggancia_email_a_oda on public.email_inbox;
create trigger aggancia_email_a_oda
  after insert on public.email_inbox
  for each row when (new.subject ~ 'ODA-[0-9]{4}-[0-9]+')
  execute function public.aggancia_email_a_oda();

-- Gli allegati leggibili arrivati col codice dell'ordine o agganciati alla risposta dell'offerta.
create or replace function public.controllo_documento_email(p_po uuid default null, p_rfq_supplier uuid default null)
 returns table(attachment_id uuid, inbox_id uuid, filename text, mime_type text, mittente text, oggetto text, ricevuta_il timestamptz)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  azienda uuid;
  casella uuid;
begin
  if p_po is not null then
    select po.company_id into azienda from public.purchase_orders po where po.id = p_po;
  else
    select rs.company_id, rs.email_inbox_id into azienda, casella from public.supplier_rfq_suppliers rs where rs.id = p_rfq_supplier;
  end if;
  if azienda is null or not public.user_can_access_company(azienda) or not public.materiali_puo('can_view_orders', azienda) then
    raise exception 'Non accessibile' using errcode = '42501';
  end if;
  return query
    select a.id, a.inbox_id, a.filename, a.mime_type, e.from_email, e.subject, e.received_at
      from public.email_inbox e
      join public.email_attachments a on a.inbox_id = e.id
     where e.company_id = azienda
       and ((p_po is not null and e.purchase_order_id = p_po) or (casella is not null and e.id = casella))
       and (a.mime_type ilike '%pdf%' or a.mime_type ilike 'image/%')
     order by e.received_at desc
     limit 20;
end;
$function$;

create or replace function public.acquisti_conferma_impostazioni_salva(p_company uuid, p_giorni integer, p_tolleranza numeric)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.user_can_access_company(p_company)
     or not (public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company)
             or public.has_role(auth.uid(), 'super_admin'::public.app_role)
             or exists (select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
                         where ur.user_id = auth.uid() and ur.role = 'company_admin'::public.app_role and p.company_id = p_company)) then
    raise exception 'Le impostazioni degli acquisti le cambia l''amministratore o chi modifica la configurazione ordini' using errcode = '42501';
  end if;
  if p_giorni is null or p_giorni < 1 or p_giorni > 60 then
    raise exception 'I giorni di attesa vanno da 1 a 60' using errcode = '22023';
  end if;
  if p_tolleranza is null or p_tolleranza < 0 or p_tolleranza > 50 then
    raise exception 'La tolleranza va da 0 a 50 mm' using errcode = '22023';
  end if;
  insert into public.company_acquisti_impostazioni as s (company_id, conferma_giorni_promemoria, conferma_tolleranza_mm, updated_at, updated_by)
  values (p_company, p_giorni, p_tolleranza, now(), auth.uid())
  on conflict (company_id) do update
    set conferma_giorni_promemoria = excluded.conferma_giorni_promemoria,
        conferma_tolleranza_mm = excluded.conferma_tolleranza_mm,
        updated_at = now(), updated_by = auth.uid();
end;
$function$;

-- Ordine su misura inviato e nessuna conferma controllata: un promemoria a chi compra.
create or replace function public.oda_promemoria_conferma()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  inviate integer := 0;
begin
  for r in
    select po.id, po.company_id, po.oda_number, coalesce(s.conferma_giorni_promemoria, 3) as giorni, f.name as fornitore
      from public.purchase_orders po
      left join public.company_acquisti_impostazioni s on s.company_id = po.company_id
      left join public.suppliers f on f.id = po.supplier_id
     where po.status = 'inviato'
       and coalesce(s.promemoria_attivo, true)
       and coalesce(po.sent_at, po.updated_at) < now() - make_interval(days => coalesce(s.conferma_giorni_promemoria, 3))
       and (po.conferma_sollecitata_il is null
            or po.conferma_sollecitata_il < now() - make_interval(days => coalesce(s.conferma_giorni_promemoria, 3)))
       and exists (select 1 from public.purchase_order_items i where i.purchase_order_id = po.id and i.misure_fonte is not null)
       and not exists (select 1 from public.controlli_documento_fornitore c where c.purchase_order_id = po.id and c.tipo = 'conferma')
     order by po.sent_at
     limit 200
  loop
    inviate := inviate + public.materiali_notifica_permesso(r.company_id, 'can_manage_purchasing',
      format('Conferma non arrivata: %s', r.oda_number),
      format('%s non ha ancora confermato l''ordine dopo %s giorni. Sollecita o carica la conferma.', coalesce(r.fornitore, 'Il fornitore'), r.giorni),
      '/azienda/ordini-acquisto/' || r.id, r.id);
    update public.purchase_orders set conferma_sollecitata_il = now() where id = r.id;
  end loop;
  return inviate;
end;
$function$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'oda-promemoria-conferma') then
    perform cron.schedule('oda-promemoria-conferma', '40 6 * * *', 'select public.oda_promemoria_conferma();');
  end if;
end $$;

revoke all on function public._controllo_documento_esito(jsonb) from public, anon, authenticated;
revoke all on function public._controllo_documento_puo(uuid) from public, anon, authenticated;
revoke all on function public.purchase_orders_blocco_conferma() from public, anon, authenticated;
revoke all on function public.aggancia_email_a_oda() from public, anon, authenticated;
revoke all on function public.oda_promemoria_conferma() from public, anon, authenticated;
revoke all on function public.controllo_documento_riga_decidi(uuid, text, text, text) from public, anon;
grant execute on function public.controllo_documento_riga_decidi(uuid, text, text, text) to authenticated, service_role;
revoke all on function public.controllo_documento_accetta(uuid, text) from public, anon;
grant execute on function public.controllo_documento_accetta(uuid, text) to authenticated, service_role;
revoke all on function public.controllo_documento_email(uuid, uuid) from public, anon;
grant execute on function public.controllo_documento_email(uuid, uuid) to authenticated, service_role;
revoke all on function public.acquisti_conferma_impostazioni_salva(uuid, integer, numeric) from public, anon;
grant execute on function public.acquisti_conferma_impostazioni_salva(uuid, integer, numeric) to authenticated, service_role;
